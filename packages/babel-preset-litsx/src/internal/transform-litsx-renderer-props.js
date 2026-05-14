import jsxSyntaxPlugin from "@babel/plugin-syntax-jsx";
import { decodeVirtualAttributeName } from "@litsx/jsx-authoring";
import { importedBindingNeedsRendererContext } from "./transform-litsx-element-candidates.js";

let t;

function createHostReferenceExpression() {
  return t.conditionalExpression(
    t.binaryExpression(
      "===",
      t.unaryExpression("typeof", t.thisExpression(), true),
      t.stringLiteral("undefined")
    ),
    t.nullLiteral(),
    t.thisExpression()
  );
}

function stringifyJsxName(nameNode) {
  if (t.isJSXIdentifier(nameNode)) {
    return nameNode.name;
  }

  if (t.isJSXMemberExpression(nameNode)) {
    return `${stringifyJsxName(nameNode.object)}.${nameNode.property.name}`;
  }

  if (t.isJSXNamespacedName(nameNode)) {
    return `${nameNode.namespace.name}:${nameNode.name.name}`;
  }

  return "unknown";
}

function getTag(node) {
  const name = stringifyJsxName(node.name);
  const isCapitalized =
    name.charAt(0) === name.charAt(0).toUpperCase() &&
    name.charAt(0) !== name.charAt(0).toLowerCase();
  const isComponent =
    node.name.type !== "JSXIdentifier" || isCapitalized || name.includes("-");
  return { name, isComponent };
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

function getFunctionNodeFromBinding(binding) {
  if (!binding?.path) {
    return null;
  }

  if (binding.path.isFunctionDeclaration()) {
    return binding.path.node;
  }

  if (binding.path.isVariableDeclarator()) {
    const init = unwrapExpression(binding.path.node.init);
    if (t.isArrowFunctionExpression(init) || t.isFunctionExpression(init)) {
      return init;
    }
  }

  return null;
}

function mergeBooleanResults(results) {
  return results.some(Boolean);
}

function jsxTreeNeedsRendererContext(node, scope, seenBindings = new Set()) {
  if (!node) {
    return false;
  }

  if (t.isJSXFragment(node)) {
    return mergeBooleanResults(
      node.children.map((child) => jsxChildNeedsRendererContext(child, scope, seenBindings))
    );
  }

  if (!t.isJSXElement(node)) {
    return false;
  }

  const { isComponent } = getTag(node.openingElement);
  if (isComponent) {
    return true;
  }

  const childNeedsContext = mergeBooleanResults(
    node.children.map((child) => jsxChildNeedsRendererContext(child, scope, seenBindings))
  );

  if (childNeedsContext) {
    return true;
  }

  return mergeBooleanResults(
    node.openingElement.attributes.map((attr) => {
      if (!t.isJSXAttribute(attr) || !t.isJSXExpressionContainer(attr.value)) {
        return false;
      }
      return expressionNeedsRendererContext(attr.value.expression, scope, seenBindings);
    })
  );
}

function jsxChildNeedsRendererContext(child, scope, seenBindings) {
  if (t.isJSXElement(child) || t.isJSXFragment(child)) {
    return jsxTreeNeedsRendererContext(child, scope, seenBindings);
  }

  if (t.isJSXExpressionContainer(child)) {
    return expressionNeedsRendererContext(child.expression, scope, seenBindings);
  }

  return false;
}

function functionBodyNeedsRendererContext(body, scope, seenBindings = new Set()) {
  if (!body) {
    return false;
  }

  if (t.isBlockStatement(body)) {
    return mergeBooleanResults(
      body.body.map((statement) => statementNeedsRendererContext(statement, scope, seenBindings))
    );
  }

  return expressionNeedsRendererContext(body, scope, seenBindings);
}

function statementNeedsRendererContext(statement, scope, seenBindings) {
  if (t.isReturnStatement(statement)) {
    return expressionNeedsRendererContext(statement.argument, scope, seenBindings);
  }

  if (t.isIfStatement(statement)) {
    return mergeBooleanResults([
      statementNeedsRendererContext(statement.consequent, scope, seenBindings),
      statement.alternate
        ? statementNeedsRendererContext(statement.alternate, scope, seenBindings)
        : false,
    ]);
  }

  if (t.isBlockStatement(statement)) {
    return functionBodyNeedsRendererContext(statement, scope, seenBindings);
  }

  return false;
}

function callExpressionNeedsRendererContext(node, scope, seenBindings) {
  const callee = unwrapExpression(node.callee);
  if (!t.isIdentifier(callee)) {
    return false;
  }

  const binding = scope.getBinding(callee.name);
  const functionNode = getFunctionNodeFromBinding(binding);
  if (!functionNode) {
    return false;
  }

  if (seenBindings.has(binding)) {
    return false;
  }

  const nextSeenBindings = new Set(seenBindings);
  nextSeenBindings.add(binding);
  return functionBodyNeedsRendererContext(functionNode.body, binding.path.scope, nextSeenBindings);
}

function expressionNeedsRendererContext(node, scope, seenBindings = new Set()) {
  const expression = unwrapExpression(node);
  if (!expression) {
    return false;
  }

  if (t.isJSXElement(expression) || t.isJSXFragment(expression)) {
    return jsxTreeNeedsRendererContext(expression, scope, seenBindings);
  }

  if (t.isConditionalExpression(expression)) {
    return mergeBooleanResults([
      expressionNeedsRendererContext(expression.consequent, scope, seenBindings),
      expressionNeedsRendererContext(expression.alternate, scope, seenBindings),
    ]);
  }

  if (t.isLogicalExpression(expression)) {
    return mergeBooleanResults([
      expressionNeedsRendererContext(expression.left, scope, seenBindings),
      expressionNeedsRendererContext(expression.right, scope, seenBindings),
    ]);
  }

  if (t.isSequenceExpression(expression)) {
    return mergeBooleanResults(
      expression.expressions.map((part) => expressionNeedsRendererContext(part, scope, seenBindings))
    );
  }

  if (t.isArrayExpression(expression)) {
    return mergeBooleanResults(
      expression.elements.filter(Boolean).map((part) => expressionNeedsRendererContext(part, scope, seenBindings))
    );
  }

  if (t.isCallExpression(expression)) {
    return callExpressionNeedsRendererContext(expression, scope, seenBindings);
  }

  return false;
}

function isBindableFunctionReference(expressionPath, options = {}) {
  const expression = unwrapExpression(expressionPath.node);
  if (
    t.isArrowFunctionExpression(expression) ||
    t.isFunctionExpression(expression)
  ) {
    return functionBodyNeedsRendererContext(expression.body, expressionPath.scope);
  }

  if (t.isIdentifier(expression)) {
    const binding = expressionPath.scope.getBinding(expression.name);
    const functionNode = getFunctionNodeFromBinding(binding);
    if (!functionNode) {
      const programPath = expressionPath.findParent((entry) => entry.isProgram?.());
      return importedBindingNeedsRendererContext(
        programPath,
        expression.name,
        options
      );
    }
    return functionBodyNeedsRendererContext(functionNode.body, binding.path.scope, new Set([binding]));
  }

  return false;
}

function shouldBindRendererContext(attributePath, rawName, expressionPath, options = {}) {
  if (typeof rawName !== "string" || rawName[0] !== ".") {
    return false;
  }

  const openingElement = attributePath.parentPath;
  if (!openingElement?.isJSXOpeningElement()) {
    return false;
  }

  const { isComponent } = getTag(openingElement.node);
  if (!isComponent) {
    return false;
  }

  return isBindableFunctionReference(expressionPath, options);
}

function ensureRendererBindingImport(programPath) {
  const bodyPaths = programPath.get("body");
  const runtimeImports = bodyPaths.filter(
    (path) =>
      path.isImportDeclaration() &&
      path.node.source.value === "@litsx/litsx/internal/runtime-render-context"
  );

  const importSpecifier = t.importSpecifier(
    t.identifier("bindRendererContext"),
    t.identifier("bindRendererContext")
  );

  for (const importPath of runtimeImports) {
    const { specifiers } = importPath.node;
    const hasImport = specifiers.some(
      (specifier) =>
        t.isImportSpecifier(specifier) &&
        t.isIdentifier(specifier.imported, { name: "bindRendererContext" })
    );

    if (hasImport) {
      return;
    }

    specifiers.push(importSpecifier);
    return;
  }

  programPath.unshiftContainer("body", t.importDeclaration(
    [importSpecifier],
    t.stringLiteral("@litsx/litsx/internal/runtime-render-context")
  ));
}

export default function transformLitsxRendererProps(api) {
  api.assertVersion?.(7);
  t = api.types;

  return {
    name: "transform-litsx-renderer-props",
    inherits: jsxSyntaxPlugin.default || jsxSyntaxPlugin,
    visitor: {
      Program: {
        enter(_, state) {
          state.__litsxNeedsRendererBindingImport = false;
        },
        exit(programPath, state) {
          if (state.__litsxNeedsRendererBindingImport) {
            ensureRendererBindingImport(programPath);
          }
        },
      },
      JSXAttribute(path, state) {
        const { node } = path;
        if (node.value?.type !== "JSXExpressionContainer") {
          return;
        }

        const rawName = decodeVirtualAttributeName(node.name.name) ?? node.name.name;
        const expressionPath = path.get("value.expression");
        if (!expressionPath?.node) {
          return;
        }

        if (!shouldBindRendererContext(path, rawName, expressionPath, {
          filename: state.file?.opts?.filename || "",
        })) {
          return;
        }

        state.__litsxNeedsRendererBindingImport = true;
        node.value.expression = t.callExpression(
          t.identifier("bindRendererContext"),
          [
            createHostReferenceExpression(),
            expressionPath.node,
            t.objectExpression([
              t.objectProperty(t.identifier("projected"), t.booleanLiteral(true)),
            ]),
          ]
        );
      },
    },
  };
}
