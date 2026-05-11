import jsxSyntaxPlugin from "@babel/plugin-syntax-jsx";
let t;

const SSR_MODULE = "@litsx/ssr";
const RUNTIME_INFRASTRUCTURE_MODULE = "@litsx/core/elements";
const SCOPED_TEMPLATE_HELPER = "__litsxScopedTemplate";

export default function transformLitsxSsrRoots(api) {
  api.assertVersion(7);
  t = api.types;

  return {
    name: "transform-litsx-ssr-roots",
    inherits: jsxSyntaxPlugin.default || jsxSyntaxPlugin,
    visitor: {
      Program(programPath) {
        const availableMap = buildAvailableMap(programPath);
        const renderToStringBindings = collectSsrRenderBindings(programPath);

        if (renderToStringBindings.size === 0) {
          return;
        }

        programPath.traverse({
          CallExpression(callPath) {
            if (!callPath.get("callee").isIdentifier()) {
              return;
            }

            const calleeName = callPath.node.callee.name;
            if (!renderToStringBindings.has(calleeName)) {
              return;
            }

            const firstArgument = callPath.get("arguments.0");
            if (
              !firstArgument ||
              (!firstArgument.isJSXElement() && !firstArgument.isJSXFragment())
            ) {
              return;
            }

            const scopeEntries = collectScopedEntries(firstArgument, availableMap);
            const jsxRoot = firstArgument.node;
            ensureNamedImport(
              programPath,
              RUNTIME_INFRASTRUCTURE_MODULE,
              SCOPED_TEMPLATE_HELPER,
            );

            firstArgument.replaceWith(
              t.callExpression(t.identifier(SCOPED_TEMPLATE_HELPER), [
                jsxRoot,
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
          },
        });
      },
    },
  };
}

function toKebab(name) {
  return name.replace(/([a-z])([A-Z])/g, "$1-$2").toLowerCase();
}

function buildAvailableMap(programPath) {
  const availableMap = new Map();

  programPath.get("body").forEach((nodePath) => {
    if (nodePath.isImportDeclaration()) {
      nodePath.node.specifiers.forEach((specifier) => {
        if (t.isImportSpecifier(specifier) || t.isImportDefaultSpecifier(specifier)) {
          availableMap.set(specifier.local.name, {
            originalName: specifier.local.name,
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

function collectSsrRenderBindings(programPath) {
  const bindings = new Set();

  programPath.get("body").forEach((nodePath) => {
    if (
      !nodePath.isImportDeclaration() ||
      nodePath.node.source.value !== SSR_MODULE
    ) {
      return;
    }

    for (const specifier of nodePath.node.specifiers) {
      if (
        t.isImportSpecifier(specifier) &&
        t.isIdentifier(specifier.imported, { name: "renderToString" })
      ) {
        bindings.add(specifier.local.name);
      }
    }
  });

  return bindings;
}

function collectScopedEntries(rootPath, availableMap) {
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

function ensureNamedImport(programPath, moduleName, importName) {
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
