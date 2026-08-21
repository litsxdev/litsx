import { createStaticGuardResolver } from "./static-guards.js";
import {
  createUnoCssGuardMarker,
  decodeUnoCssGuardPayload,
  UNO_CSS_GUARD_PATTERN,
  UNO_CSS_PLACEHOLDER,
  UNO_CSS_PREFLIGHT_EXPORT,
  UNO_CSS_PREFLIGHT_MODULE_ID,
} from "./protocol.js";

const COMPONENT_SYMBOL = "litsx.component";

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

function guardTemplate(payload, cssIdentifier, t) {
  const marker = createUnoCssGuardMarker(payload);
  return t.taggedTemplateExpression(
    t.cloneNode(cssIdentifier),
    t.templateLiteral(
      [t.templateElement({ raw: marker, cooked: marker }, true)],
      [],
    ),
  );
}

function getStylesAssignment(path, t) {
  if (!path.isExpressionStatement()) return null;
  const expression = path.node.expression;
  if (!t.isAssignmentExpression(expression, { operator: "=" })) return null;
  if (
    !t.isMemberExpression(expression.left) ||
    !t.isIdentifier(expression.left.object) ||
    !/^[A-Z]/.test(expression.left.object.name)
  )
    return null;
  const name = expression.left.computed
    ? t.isStringLiteral(expression.left.property)
      ? expression.left.property.value
      : null
    : t.isIdentifier(expression.left.property)
      ? expression.left.property.name
      : null;
  return name === "styles" ? path.get("expression.right") : null;
}

/**
 * Consume static utility guards from authored Component.styles assignments.
 * The replacement is already a CSSResult, so no non-Lit value can leak into
 * the native component lowering or the browser runtime.
 */
export function createUnoCssAuthoringPlugin() {
  return function litsxUnoCssAuthoringPlugin(api) {
    api.assertVersion?.(7);
    const t = api.types;
    return {
      name: "litsx-unocss-authoring-guards",
      visitor: {
        Program: {
          exit(programPath, state) {
            const assignmentPaths = programPath
              .get("body")
              .map((path) => getStylesAssignment(path, t))
              .filter(Boolean);
            if (assignmentPaths.length === 0) return;

            const filename = state.filename || state.file.opts.filename;
            const resolver = createStaticGuardResolver({
              source: state.file.code || "",
              filename,
              ast: state.file.ast,
            });
            let cssIdentifier = findImportedCssIdentifier(programPath, t);
            const ensureCssIdentifier = () => {
              if (cssIdentifier) return cssIdentifier;
              cssIdentifier =
                programPath.scope.generateUidIdentifier("litsxUnoCssGuard");
              insertAfterImports(programPath, [
                t.importDeclaration(
                  [
                    t.importSpecifier(
                      t.cloneNode(cssIdentifier),
                      t.identifier("css"),
                    ),
                  ],
                  t.stringLiteral("@litsx/core"),
                ),
              ]);
              return cssIdentifier;
            };

            const consume = (stylePath, replacementPath = stylePath) => {
              const node = stylePath.node;
              if (t.isArrayExpression(node)) {
                for (const elementPath of stylePath.get("elements")) {
                  if (!elementPath.node) continue;
                  if (elementPath.isSpreadElement()) {
                    consume(elementPath.get("argument"), elementPath);
                  } else {
                    consume(elementPath);
                  }
                }
                return;
              }

              let result;
              try {
                result = t.isIdentifier(node)
                  ? resolver.resolveLocal(node.name)
                  : resolver.resolveNode(node);
              } catch (error) {
                throw stylePath.buildCodeFrameError(
                  `@litsx/unocss could not statically resolve this Component.styles guard: ${error.message}. ` +
                    "Guards must be finite static strings, arrays, objects, or resolvable local exports.",
                );
              }

              if (result.kind === "runtime" || result.kind === "external")
                return;
              if (result.kind !== "static") {
                throw stylePath.buildCodeFrameError(
                  "@litsx/unocss did not consume this Component.styles value; it would not be a valid Lit CSSResultGroup at runtime.",
                );
              }
              replacementPath.replaceWith(
                guardTemplate(
                  {
                    candidates: result.candidates,
                    descriptor: result.descriptor,
                    dependencies: result.dependencies,
                  },
                  ensureCssIdentifier(),
                  t,
                ),
              );
            };

            for (const assignmentPath of assignmentPaths)
              consume(assignmentPath);
          },
        },
      },
    };
  };
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
      : UNO_CSS_PLACEHOLDER;
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
    authoringPlugins: [
      ...(Array.isArray(options.authoringPlugins)
        ? options.authoringPlugins
        : []),
      createUnoCssAuthoringPlugin(integrationOptions),
    ],
    outputPlugins: [
      ...(Array.isArray(options.outputPlugins) ? options.outputPlugins : []),
      createUnoCssOutputPlugin(integrationOptions),
    ],
  };
}

export {
  createUnoCssBuildEngine,
  createUnoCssIntegration,
} from "./build-engine.js";
export {
  decodeUnoCssGuardPayload,
  UNO_CSS_GUARD_PATTERN,
  UNO_CSS_PLACEHOLDER,
  UNO_CSS_PREFLIGHT_EXPORT,
  UNO_CSS_PREFLIGHT_MODULE_ID,
} from "./protocol.js";
