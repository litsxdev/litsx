const DEFAULT_PLACEHOLDER = "@unocss-placeholder";
const COMPONENT_SYMBOL = "litsx.component";
export const UNO_CSS_PREFLIGHT_MODULE_ID = "virtual:@litsx/unocss/preflight";
export const UNO_CSS_PREFLIGHT_EXPORT = "unoPreflightStyles";

function isSymbolFor(node, name, t) {
  return Boolean(
    t.isCallExpression(node) &&
    t.isMemberExpression(node.callee) &&
    !node.callee.computed &&
    t.isIdentifier(node.callee.object, { name: "Symbol" }) &&
    t.isIdentifier(node.callee.property, { name: "for" }) &&
    node.arguments.length === 1 &&
    t.isStringLiteral(node.arguments[0], { value: name }),
  );
}

function isLitsxComponentClass(classPath, t) {
  return classPath.get("body.body").some((memberPath) => {
    const member = memberPath.node;
    return Boolean(
      member?.static === true &&
      member?.computed === true &&
      isSymbolFor(member.key, COMPONENT_SYMBOL, t),
    );
  });
}

function findStaticStylesMember(classPath, t) {
  return (
    classPath.get("body.body").find((memberPath) => {
      const member = memberPath.node;
      return Boolean(
        member?.static === true &&
        member?.computed !== true &&
        t.isIdentifier(member.key, { name: "styles" }),
      );
    }) ?? null
  );
}

function composeStyleReferences(
  existingStyle,
  styleIdentifier,
  preflightIdentifier,
  t,
) {
  return t.arrayExpression([
    ...(preflightIdentifier ? [t.cloneNode(preflightIdentifier)] : []),
    ...(existingStyle ? [t.cloneNode(existingStyle, true)] : []),
    t.cloneNode(styleIdentifier),
  ]);
}

function appendStyleReference(
  classPath,
  styleIdentifier,
  preflightIdentifier,
  t,
) {
  const stylesPath = findStaticStylesMember(classPath, t);

  if (!stylesPath) {
    classPath
      .get("body")
      .unshiftContainer(
        "body",
        t.classProperty(
          t.identifier("styles"),
          preflightIdentifier
            ? composeStyleReferences(
                null,
                styleIdentifier,
                preflightIdentifier,
                t,
              )
            : t.cloneNode(styleIdentifier),
          null,
          null,
          false,
          true,
        ),
      );
    return;
  }

  if (stylesPath.isClassMethod({ kind: "get" })) {
    const returnPath = stylesPath
      .get("body.body")
      .find(
        (statementPath) =>
          statementPath.isReturnStatement() && statementPath.node.argument,
      );
    if (returnPath) {
      returnPath
        .get("argument")
        .replaceWith(
          composeStyleReferences(
            returnPath.node.argument,
            styleIdentifier,
            preflightIdentifier,
            t,
          ),
        );
    }
    return;
  }

  if (stylesPath.isClassProperty() && stylesPath.node.value) {
    stylesPath
      .get("value")
      .replaceWith(
        composeStyleReferences(
          stylesPath.node.value,
          styleIdentifier,
          preflightIdentifier,
          t,
        ),
      );
  }
}

function insertAfterImports(programPath, nodes) {
  const bodyPaths = programPath.get("body");
  const lastImport = [...bodyPaths]
    .reverse()
    .find((path) => path.isImportDeclaration());
  if (lastImport) {
    lastImport.insertAfter(nodes);
  } else {
    programPath.unshiftContainer("body", nodes);
  }
}

function findImportedCssIdentifier(programPath, t) {
  for (const statementPath of programPath.get("body")) {
    if (
      !statementPath.isImportDeclaration() ||
      statementPath.node.source.value !== "@litsx/core"
    ) {
      continue;
    }
    for (const specifier of statementPath.node.specifiers) {
      if (
        t.isImportSpecifier(specifier) &&
        t.isIdentifier(specifier.imported, { name: "css" })
      ) {
        return t.cloneNode(specifier.local);
      }
    }
  }
  return null;
}

function programHasPlaceholder(programPath, placeholder) {
  let found = false;
  programPath.traverse({
    TemplateElement(templatePath) {
      if (templatePath.node.value?.raw?.includes(placeholder)) {
        found = true;
        templatePath.stop();
      }
    },
  });
  return found;
}

/**
 * Create the low-level Babel output plugin used by the UnoCSS adapter.
 *
 * The plugin contributes one shared CSSResult per compiled module and attaches
 * it to every generated LitSX component class. UnoCSS's shadow-dom mode then
 * replaces the placeholder with the utilities extracted from that module.
 */
export function createUnoCssOutputPlugin(options = {}) {
  const placeholder =
    typeof options.placeholder === "string" && options.placeholder
      ? options.placeholder
      : DEFAULT_PLACEHOLDER;
  const preflightModule =
    typeof options.preflightModule === "string" && options.preflightModule
      ? options.preflightModule
      : null;

  return function litsxUnoCssOutputPlugin(api) {
    api.assertVersion?.(7);
    const t = api.types;

    return {
      name: "litsx-unocss-output",
      visitor: {
        Program: {
          exit(programPath, state) {
            if (programHasPlaceholder(programPath, placeholder)) {
              return;
            }

            const componentClasses = [];
            programPath.traverse({
              ClassDeclaration(classPath) {
                if (isLitsxComponentClass(classPath, t)) {
                  componentClasses.push(classPath);
                }
              },
            });

            if (componentClasses.length === 0) {
              return;
            }

            const importedCssIdentifier = findImportedCssIdentifier(
              programPath,
              t,
            );
            const cssIdentifier =
              importedCssIdentifier ??
              programPath.scope.generateUidIdentifier("litsxUnoCss");
            const stylesIdentifier =
              programPath.scope.generateUidIdentifier("litsxUnoCssStyles");
            const preflightIdentifier = preflightModule
              ? programPath.scope.generateUidIdentifier("litsxUnoCssPreflight")
              : null;
            const stylesDeclaration = t.variableDeclaration("const", [
              t.variableDeclarator(
                t.cloneNode(stylesIdentifier),
                t.taggedTemplateExpression(
                  t.cloneNode(cssIdentifier),
                  t.templateLiteral(
                    [
                      t.templateElement(
                        { raw: placeholder, cooked: placeholder },
                        true,
                      ),
                    ],
                    [],
                  ),
                ),
              ),
            ]);

            const insertedNodes = [];
            if (!importedCssIdentifier) {
              insertedNodes.push(
                t.importDeclaration(
                  [
                    t.importSpecifier(
                      t.cloneNode(cssIdentifier),
                      t.identifier("css"),
                    ),
                  ],
                  t.stringLiteral("@litsx/core"),
                ),
              );
            }
            if (preflightIdentifier) {
              insertedNodes.push(
                t.importDeclaration(
                  [
                    t.importSpecifier(
                      t.cloneNode(preflightIdentifier),
                      t.identifier(UNO_CSS_PREFLIGHT_EXPORT),
                    ),
                  ],
                  t.stringLiteral(preflightModule),
                ),
              );
            }
            insertedNodes.push(stylesDeclaration);
            insertAfterImports(programPath, insertedNodes);

            const components = [];
            for (const classPath of componentClasses) {
              appendStyleReference(
                classPath,
                stylesIdentifier,
                preflightIdentifier,
                t,
              );
              if (classPath.node.id?.name) {
                components.push(classPath.node.id.name);
              }
            }

            state.file.metadata.litsxStyleIntegrations ??= [];
            state.file.metadata.litsxStyleIntegrations.push({
              name: "unocss",
              strategy: preflightIdentifier
                ? "shared-preflight-module-utilities"
                : "module-shared",
              components,
            });
          },
        },
      },
    };
  };
}

/** Add the UnoCSS output contribution without replacing existing integrations. */
export function withUnoCssCompiler(options = {}, integrationOptions = {}) {
  return {
    ...options,
    outputPlugins: [
      ...(Array.isArray(options.outputPlugins) ? options.outputPlugins : []),
      createUnoCssOutputPlugin(integrationOptions),
    ],
  };
}

export const UNO_CSS_PLACEHOLDER = DEFAULT_PLACEHOLDER;
