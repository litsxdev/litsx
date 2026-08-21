import { decodeVirtualAttributeName } from "@litsx/authoring";
import fs from "node:fs";
import path from "node:path";
import { normalizeFilePath } from "@litsx/typescript-session";

let t;
const RUNTIME_INFRASTRUCTURE_MODULE = "@litsx/core/elements";
const ANNOTATE_HYDRATABLE_CUSTOM_ELEMENT_HELPER = "annotateHydratableCustomElement";
const IMPORT_RESOLUTION_EXTENSIONS = [
  ".jsx",
  ".js",
  ".tsx",
  ".ts",
];

export function setSsrSharedBabelTypes(nextTypes) {
  t = nextTypes;
}

export function toKebab(name) {
  return name.replace(/([a-z])([A-Z])/g, "$1-$2").toLowerCase();
}

export function buildAvailableMap(programPath, options = {}) {
  const availableMap = new Map();
  const filename = normalizeFilePath(options.filename || programPath.hub.file?.opts?.filename || "");

  programPath.get("body").forEach((nodePath) => {
    if (nodePath.isImportDeclaration()) {
      nodePath.node.specifiers.forEach((specifier) => {
        if (t.isImportSpecifier(specifier) || t.isImportDefaultSpecifier(specifier)) {
          const sourceSpecifier = nodePath.node.source.value;
          availableMap.set(specifier.local.name, {
            originalName: specifier.local.name,
            moduleId: resolveImportModuleId(filename, sourceSpecifier),
          });
        }
      });
      return;
    }

    const declarationPath = resolveTopLevelDeclarationPath(nodePath);
    if (!declarationPath) return;

    const localName = declarationPath.node.id?.name;
    if (!localName) return;

    availableMap.set(localName, {
      originalName: localName,
      local: true,
    });
  });

  return availableMap;
}

function resolveImportModuleId(fromFilename, sourceSpecifier) {
  if (typeof sourceSpecifier !== "string" || sourceSpecifier.length === 0) {
    return null;
  }

  if (
    !sourceSpecifier.startsWith("./") &&
    !sourceSpecifier.startsWith("../") &&
    !sourceSpecifier.startsWith("/")
  ) {
    return sourceSpecifier;
  }

  if (!fromFilename) {
    return sourceSpecifier;
  }

  const basePath = sourceSpecifier.startsWith("/")
    ? sourceSpecifier
    : path.resolve(path.dirname(fromFilename), sourceSpecifier);
  const candidates = IMPORT_RESOLUTION_EXTENSIONS.some((extension) => basePath.endsWith(extension))
    ? [basePath]
    : [
        ...IMPORT_RESOLUTION_EXTENSIONS.map((extension) => `${basePath}${extension}`),
        ...IMPORT_RESOLUTION_EXTENSIONS.map((extension) => path.join(basePath, `index${extension}`)),
      ];

  for (const candidate of candidates) {
    try {
      if (fs.statSync(candidate).isFile()) {
        return normalizeFilePath(candidate);
      }
    } catch {
      // Ignore resolution misses and continue.
    }
  }

  return sourceSpecifier;
}

function resolveTopLevelDeclarationPath(nodePath) {
  if (nodePath.isClassDeclaration() || nodePath.isFunctionDeclaration()) {
    return nodePath;
  }

  if (nodePath.isVariableDeclaration()) {
    const declarator = nodePath.node.declarations[0];
    if (t.isIdentifier(declarator?.id)) {
      return {
        node: { id: declarator.id },
      };
    }
  }

  if (nodePath.isExportNamedDeclaration()) {
    const declarationPath = nodePath.get("declaration");
    if (
      declarationPath &&
      (declarationPath.isClassDeclaration() ||
        declarationPath.isFunctionDeclaration() ||
        declarationPath.isVariableDeclaration())
    ) {
      return resolveTopLevelDeclarationPath(declarationPath);
    }
  }

  return null;
}

export function collectScopedEntries(rootPath, availableMap) {
  const used = new Map();

  rootPath.traverse({
    JSXOpeningElement(path) {
      const nameNode = path.get("name");

      if (!nameNode.isJSXIdentifier()) {
        return;
      }

      const originalName = nameNode.node.name;
      if (!availableMap.has(originalName)) {
        return;
      }

      const tagName = toKebab(originalName);
      nameNode.node.name = tagName;
      used.set(originalName, {
        ...availableMap.get(originalName),
        originalName,
        tagName,
      });
    },
    JSXClosingElement(path) {
      const nameNode = path.get("name");

      if (!nameNode.isJSXIdentifier()) {
        return;
      }

      const originalName = nameNode.node.name;
      if (!availableMap.has(originalName)) {
        return;
      }

      nameNode.node.name = toKebab(originalName);
    },
  });

  return Array.from(used.values());
}

export function ensureNamedImport(programPath, moduleName, importName) {
  const existingImport = programPath.get("body").find(
    (nodePath) =>
      nodePath.isImportDeclaration() &&
      nodePath.node.source.value === moduleName,
  );

  if (existingImport) {
    const hasImport = existingImport.node.specifiers.some(
      (specifier) =>
        t.isImportSpecifier(specifier) &&
        t.isIdentifier(specifier.imported, { name: importName }),
    );

    if (!hasImport) {
      existingImport.node.specifiers.push(
        t.importSpecifier(t.identifier(importName), t.identifier(importName)),
      );
    }
    return;
  }

  programPath.unshiftContainer(
    "body",
    t.importDeclaration(
      [t.importSpecifier(t.identifier(importName), t.identifier(importName))],
      t.stringLiteral(moduleName),
    ),
  );
}

export function createSsrElementRegistryValue(programPath, entry) {
  const expression = entry?.expression
    ? t.cloneNode(entry.expression, true)
    : t.identifier(entry.originalName);

  if (!entry?.tagName || !entry?.moduleId) {
    return expression;
  }

  ensureNamedImport(
    programPath,
    RUNTIME_INFRASTRUCTURE_MODULE,
    ANNOTATE_HYDRATABLE_CUSTOM_ELEMENT_HELPER,
  );

  return t.callExpression(
    t.identifier(ANNOTATE_HYDRATABLE_CUSTOM_ELEMENT_HELPER),
    [
      expression,
      t.objectExpression([
        t.objectProperty(
          t.identifier("tagName"),
          t.stringLiteral(entry.tagName),
        ),
        t.objectProperty(
          t.identifier("moduleId"),
          t.stringLiteral(entry.moduleId),
        ),
      ]),
    ],
  );
}

export function buildServerComponentPropsObject(openingElementPath) {
  const properties = [];

  for (const attributePath of openingElementPath.get("attributes")) {
    if (!attributePath.isJSXAttribute()) {
      continue;
    }

    if (!attributePath.get("name").isJSXIdentifier()) {
      continue;
    }

    const authoredName =
      decodeVirtualAttributeName(attributePath.node.name.name) ??
      attributePath.node.name.name;
    if (!authoredName.startsWith(".")) {
      continue;
    }

    const propName = authoredName.slice(1);
    const valuePath = attributePath.get("value");

    let valueExpression;
    if (!valuePath.node) {
      valueExpression = t.booleanLiteral(true);
    } else if (valuePath.isJSXExpressionContainer()) {
      valueExpression = valuePath.node.expression;
    } else if (valuePath.isStringLiteral()) {
      valueExpression = valuePath.node;
    } else {
      continue;
    }

    properties.push(
      t.objectProperty(
        t.identifier(propName),
        t.cloneNode(valueExpression, true),
      ),
    );
  }

  return t.objectExpression(properties);
}
