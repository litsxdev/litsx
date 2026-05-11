import jsxSyntaxPlugin from "@babel/plugin-syntax-jsx";
import fs from "fs";
import { resolve, dirname, extname } from "path";
import * as parser from "@babel/parser";
import traverse from "@babel/traverse";
import {
  buildAvailableMap,
  buildServerComponentPropsObject,
  collectScopedEntries,
  ensureNamedImport,
  setSsrSharedBabelTypes,
} from "./transform-litsx-ssr-shared.js";

let t;
const babelTraverse = traverse.default ?? traverse;

const RUNTIME_INFRASTRUCTURE_MODULE = "@litsx/core/elements";
const SCOPED_TEMPLATE_HELPER = "__litsxScopedTemplate";
const SERVER_COMPONENT_CALL_HELPER = "__litsxServerComponentCall";
const SERVER_COMPONENT_SYMBOL = "LITSX_SERVER_COMPONENT";
const SUPPORTED_IMPORT_EXTENSIONS = [
  "",
  ".js",
  ".jsx",
  ".ts",
  ".tsx",
  ".litsx",
  ".mjs",
  ".cjs",
];

export function setServerComponentBabelTypes(nextTypes) {
  t = nextTypes;
  setSsrSharedBabelTypes(nextTypes);
}

function isCapitalizedComponentName(name) {
  if (typeof name !== "string" || name.length === 0) {
    return false;
  }

  const first = name[0];
  return first === first.toUpperCase() && first !== first.toLowerCase();
}

function isAsyncFunctionNode(node) {
  return Boolean(
    node &&
    node.async === true &&
    (t.isFunctionDeclaration(node) ||
      t.isFunctionExpression(node) ||
      t.isArrowFunctionExpression(node))
  );
}

function unwrapExpression(node) {
  let current = node;

  while (current) {
    if (t.isParenthesizedExpression?.(current)) {
      current = current.expression;
      continue;
    }

    if (
      t.isTSAsExpression?.(current) ||
      t.isTSSatisfiesExpression?.(current) ||
      t.isTypeCastExpression?.(current) ||
      t.isTSNonNullExpression?.(current)
    ) {
      current = current.expression;
      continue;
    }

    break;
  }

  return current;
}

function expressionIsRenderableTemplate(node) {
  const expression = unwrapExpression(node);
  if (!expression) {
    return false;
  }

  if (t.isJSXElement(expression) || t.isJSXFragment(expression)) {
    return true;
  }

  if (
    t.isTaggedTemplateExpression(expression) &&
    t.isIdentifier(expression.tag, { name: "html" })
  ) {
    return true;
  }

  if (t.isConditionalExpression(expression)) {
    return (
      expressionIsRenderableTemplate(expression.consequent) ||
      expressionIsRenderableTemplate(expression.alternate)
    );
  }

  if (t.isLogicalExpression(expression)) {
    return (
      expressionIsRenderableTemplate(expression.left) ||
      expressionIsRenderableTemplate(expression.right)
    );
  }

  if (t.isSequenceExpression(expression)) {
    return expression.expressions.some((part) => expressionIsRenderableTemplate(part));
  }

  return false;
}

function functionReturnsRenderableTemplate(node) {
  if (!node) {
    return false;
  }

  if (!t.isBlockStatement(node.body)) {
    return expressionIsRenderableTemplate(node.body);
  }

  let found = false;

  const visitStatement = (statement) => {
    if (!statement || found) {
      return;
    }

    if (t.isReturnStatement(statement)) {
      found = expressionIsRenderableTemplate(statement.argument);
      return;
    }

    if (t.isBlockStatement(statement)) {
      statement.body.forEach(visitStatement);
      return;
    }

    if (t.isIfStatement(statement)) {
      visitStatement(statement.consequent);
      visitStatement(statement.alternate);
    }
  };

  node.body.body.forEach(visitStatement);
  return found;
}

function getAsyncBindingFromIdentifier(programPath, localName) {
  if (!localName || !programPath?.scope) {
    return null;
  }

  const binding = programPath.scope.getBinding(localName);
  if (!binding?.path) {
    return null;
  }

  if (binding.path.isFunctionDeclaration()) {
    return isAsyncFunctionNode(binding.path.node) ? binding.path.node : null;
  }

  if (binding.path.isVariableDeclarator()) {
    const init = binding.path.node.init;
    return isAsyncFunctionNode(init) ? init : null;
  }

  return null;
}

function getDefaultExportServerComponentName(programPath) {
  const cached = programPath.getData("__litsxDefaultServerComponentName");
  if (cached !== undefined) {
    return cached;
  }

  let serverComponentName = null;

  for (const nodePath of programPath.get("body")) {
    if (!nodePath.isExportDefaultDeclaration()) {
      continue;
    }

    const declaration = nodePath.node.declaration;

    if (t.isFunctionDeclaration(declaration)) {
      if (declaration.id?.name &&
          isCapitalizedComponentName(declaration.id.name) &&
          isAsyncFunctionNode(declaration) &&
          functionReturnsRenderableTemplate(declaration)) {
        serverComponentName = declaration.id.name;
      }
      break;
    }

    if (!t.isIdentifier(declaration) || !isCapitalizedComponentName(declaration.name)) {
      break;
    }

    const bindingNode = getAsyncBindingFromIdentifier(programPath, declaration.name);
    if (bindingNode && functionReturnsRenderableTemplate(bindingNode)) {
      serverComponentName = declaration.name;
    }
    break;
  }

  programPath.setData("__litsxDefaultServerComponentName", serverComponentName);
  return serverComponentName;
}

function getOrCreateImportedServerComponentCache(programPath) {
  const existing = programPath.getData("__litsxImportedServerComponentCache");
  if (existing) {
    return existing;
  }

  const next = new Map();
  programPath.setData("__litsxImportedServerComponentCache", next);
  return next;
}

function resolveRelativeImportSource(filename, sourceValue) {
  if (!filename || typeof sourceValue !== "string" || !sourceValue.startsWith(".")) {
    return null;
  }

  const baseDirectory = dirname(filename);
  const basePath = resolve(baseDirectory, sourceValue);
  const candidates = [];

  if (extname(basePath)) {
    candidates.push(basePath);
  } else {
    for (const extension of SUPPORTED_IMPORT_EXTENSIONS) {
      candidates.push(`${basePath}${extension}`);
    }
    for (const extension of SUPPORTED_IMPORT_EXTENSIONS.slice(1)) {
      candidates.push(resolve(basePath, `index${extension}`));
    }
  }

  for (const candidate of candidates) {
    try {
      if (fs.statSync(candidate).isFile()) {
        return candidate;
      }
    } catch {
      // Keep scanning.
    }
  }

  return null;
}

function resolveImportedDefaultServerComponent(programPath, localName, options = {}) {
  if (!programPath?.scope || !localName) {
    return false;
  }

  const binding = programPath.scope.getBinding(localName);
  if (!binding?.path?.node) {
    return false;
  }

  if (!binding.path.isImportDefaultSpecifier()) {
    return false;
  }

  const filename = options.filename || programPath.hub.file?.opts?.filename || "";
  const sourceValue = binding.path.parent?.source?.value ?? null;
  const resolvedSource = resolveRelativeImportSource(filename, sourceValue);
  if (!resolvedSource) {
    return false;
  }

  const cache = getOrCreateImportedServerComponentCache(programPath);
  if (cache.has(resolvedSource)) {
    return cache.get(resolvedSource);
  }

  let source;
  try {
    source = fs.readFileSync(resolvedSource, "utf8");
  } catch {
    cache.set(resolvedSource, false);
    return false;
  }

  let importedProgramPath = null;
  try {
    const ast = parser.parse(source, {
      sourceType: "module",
      plugins: ["jsx", "typescript"],
    });
    babelTraverse(ast, {
      Program(path) {
        if (!importedProgramPath) {
          importedProgramPath = path;
          path.scope.crawl();
        }
      },
    });
  } catch {
    cache.set(resolvedSource, false);
    return false;
  }

  if (!importedProgramPath) {
    cache.set(resolvedSource, false);
    return false;
  }

  const result = getDefaultExportServerComponentName(importedProgramPath) !== null;
  cache.set(resolvedSource, result);
  return result;
}

export function isDefaultExportServerComponentPath(exportPath) {
  if (!exportPath?.isExportDefaultDeclaration?.()) {
    return false;
  }

  const programPath = exportPath.findParent((entry) => entry.isProgram());
  if (!programPath) {
    return false;
  }

  const declaration = exportPath.node.declaration;
  const serverComponentName = getDefaultExportServerComponentName(programPath);

  if (!serverComponentName) {
    return false;
  }

  if (t.isFunctionDeclaration(declaration)) {
    return declaration.id?.name === serverComponentName;
  }

  return t.isIdentifier(declaration, { name: serverComponentName });
}

export function isServerComponentBindingName(programPath, name, options = {}) {
  if (!programPath || !name) {
    return false;
  }

  return (
    getDefaultExportServerComponentName(programPath) === name ||
    resolveImportedDefaultServerComponent(programPath, name, options)
  );
}

function findServerComponentFunctionPath(programPath, componentName) {
  if (!componentName) {
    return null;
  }

  const binding = programPath.scope.getBinding(componentName);
  if (!binding?.path) {
    return null;
  }

  if (binding.path.isFunctionDeclaration()) {
    return binding.path;
  }

  if (binding.path.isVariableDeclarator()) {
    const initPath = binding.path.get("init");
    if (initPath.isArrowFunctionExpression() || initPath.isFunctionExpression()) {
      return initPath;
    }
  }

  return null;
}

function wrapRenderableReturns(functionPath, programPath) {
  const availableMap = buildAvailableMap(programPath);
  let transformed = false;

  functionPath.traverse({
    ReturnStatement(returnPath) {
      const argumentPath = returnPath.get("argument");
      if (!argumentPath.node || !expressionIsRenderableTemplate(argumentPath.node)) {
        return;
      }

      if (
        argumentPath.isJSXElement() &&
        argumentPath.get("openingElement.name").isJSXIdentifier() &&
        isServerComponentBindingName(
          programPath,
          argumentPath.node.openingElement.name.name,
          {
            filename: programPath.hub.file?.opts?.filename || "",
          },
        )
      ) {
        ensureNamedImport(
          programPath,
          RUNTIME_INFRASTRUCTURE_MODULE,
          SERVER_COMPONENT_CALL_HELPER,
        );
        argumentPath.replaceWith(
          t.callExpression(t.identifier(SERVER_COMPONENT_CALL_HELPER), [
            t.identifier(argumentPath.node.openingElement.name.name),
            buildServerComponentPropsObject(argumentPath.get("openingElement")),
          ]),
        );
        transformed = true;
        return;
      }

      argumentPath.traverse({
        JSXElement(jsxPath) {
          if (jsxPath === argumentPath) {
            return;
          }

          const openingName = jsxPath.get("openingElement.name");
          if (
            !openingName.isJSXIdentifier() ||
            !isServerComponentBindingName(
              programPath,
              openingName.node.name,
              {
                filename: programPath.hub.file?.opts?.filename || "",
              },
            )
          ) {
            return;
          }

          ensureNamedImport(
            programPath,
            RUNTIME_INFRASTRUCTURE_MODULE,
            SERVER_COMPONENT_CALL_HELPER,
          );
          jsxPath.replaceWith(
            t.jsxExpressionContainer(
              t.callExpression(t.identifier(SERVER_COMPONENT_CALL_HELPER), [
                t.identifier(openingName.node.name),
                buildServerComponentPropsObject(jsxPath.get("openingElement")),
              ]),
            ),
          );
          transformed = true;
        },
      });

      const scopeEntries = collectScopedEntries(argumentPath, availableMap);
      ensureNamedImport(programPath, RUNTIME_INFRASTRUCTURE_MODULE, SCOPED_TEMPLATE_HELPER);

      argumentPath.replaceWith(
        t.callExpression(t.identifier(SCOPED_TEMPLATE_HELPER), [
          argumentPath.node,
          t.objectExpression(
            scopeEntries.map((entry) =>
              t.objectProperty(
                t.stringLiteral(entry.tagName),
                t.identifier(entry.originalName),
              ),
            ),
          ),
        ]),
      );
      transformed = true;
    },
  });

  return transformed;
}

function markServerComponent(programPath, componentName) {
  ensureNamedImport(programPath, RUNTIME_INFRASTRUCTURE_MODULE, SERVER_COMPONENT_SYMBOL);

  const alreadyMarked = programPath.get("body").some((nodePath) => {
    if (!nodePath.isExpressionStatement()) {
      return false;
    }

    const expression = nodePath.node.expression;
    return (
      t.isAssignmentExpression(expression, { operator: "=" }) &&
      t.isMemberExpression(expression.left, { computed: true }) &&
      t.isIdentifier(expression.left.object, { name: componentName }) &&
      t.isIdentifier(expression.left.property, { name: SERVER_COMPONENT_SYMBOL })
    );
  });

  if (alreadyMarked) {
    return;
  }

  programPath.pushContainer(
    "body",
    t.expressionStatement(
      t.assignmentExpression(
        "=",
        t.memberExpression(
          t.identifier(componentName),
          t.identifier(SERVER_COMPONENT_SYMBOL),
          true,
        ),
        t.booleanLiteral(true),
      ),
    ),
  );
}

export default function transformLitsxServerComponents(api) {
  api.assertVersion(7);
  t = api.types;
  setServerComponentBabelTypes(t);

  return {
    name: "transform-litsx-server-components",
    inherits: jsxSyntaxPlugin.default || jsxSyntaxPlugin,
    visitor: {
      Program(programPath) {
        const componentName = getDefaultExportServerComponentName(programPath);
        if (!componentName) {
          return;
        }

        const functionPath = findServerComponentFunctionPath(programPath, componentName);
        if (!functionPath) {
          return;
        }

        if (wrapRenderableReturns(functionPath, programPath)) {
          markServerComponent(programPath, componentName);
        }
      },
    },
  };
}
