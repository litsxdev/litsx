import {
  classPatternValues,
  collectUtilityClassCandidates,
  combineUtilityStringParts as combineStringParts,
  containsLightDomMixin,
  createStaticGuardResolver,
  finiteStringValues,
  getStaticRuntimeMetadataString,
  inlineConstantBindings,
  isLitsxComponentClass,
  isSymbolFor,
  LITSX_LIGHT_DOM_SCOPE_ATTRIBUTE,
  LITSX_LIGHT_DOM_SCOPE_SYMBOL,
  unwrapStringExpression,
} from "@litsx/compiler/utility-css";
import {
  createUnoCssGuardMarker,
  decodeUnoCssGuardPayload,
  UNO_CSS_COMPONENT_MODULE_MARKER,
  UNO_CSS_DYNAMIC_WILDCARD,
  UNO_CSS_GUARD_PATTERN,
  UNO_CSS_PREFLIGHT_EXPORT,
  UNO_CSS_PREFLIGHT_MODULE_ID,
} from "./protocol.js";

function scopeGuardMarkers(classPath, scope, t) {
  const pattern = new RegExp(UNO_CSS_GUARD_PATTERN.source, "g");
  classPath.traverse({
    TemplateElement(templatePath) {
      const raw = templatePath.node.value?.raw;
      if (typeof raw !== "string" || !raw.includes("__LITSX_UNOCSS_GUARD_")) {
        return;
      }
      const nextRaw = raw.replace(pattern, (_match, encoded) =>
        createUnoCssGuardMarker({
          ...decodeUnoCssGuardPayload(encoded),
          scope,
        }),
      );
      templatePath.node.value.raw = nextRaw;
      templatePath.node.value.cooked = nextRaw;
    },
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
    ...(existingStyle
      ? t.isArrayExpression(existingStyle)
        ? existingStyle.elements.map((element) => t.cloneNode(element, true))
        : [t.cloneNode(existingStyle, true)]
      : []),
    t.cloneNode(styleIdentifier),
  ]);
}

function inheritedStylesExpression(t) {
  return t.logicalExpression(
    "??",
    t.memberExpression(t.super(), t.identifier("styles")),
    t.arrayExpression([]),
  );
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
                inheritedStylesExpression(t),
                styleIdentifier,
                preflightIdentifier,
                t,
              )
            : composeStyleReferences(
                inheritedStylesExpression(t),
                styleIdentifier,
                null,
                t,
              ),
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

function getReplaceStylesArgument(path, t) {
  if (!path?.isCallExpression?.() || path.node.arguments.length !== 1) {
    return null;
  }
  const calleePath = path.get("callee");
  if (calleePath.isIdentifier()) {
    const binding = path.scope.getBinding(calleePath.node.name);
    if (
      binding?.path?.isImportSpecifier?.() &&
      t.isIdentifier(binding.path.node.imported, { name: "replaceStyles" }) &&
      binding.path.parentPath?.node?.source?.value === "@litsx/core"
    ) {
      return path.get("arguments.0");
    }
  }
  if (
    calleePath.isMemberExpression() &&
    !calleePath.node.computed &&
    t.isIdentifier(calleePath.node.property, { name: "replaceStyles" }) &&
    t.isIdentifier(calleePath.node.object)
  ) {
    const binding = path.scope.getBinding(calleePath.node.object.name);
    if (
      binding?.path?.isImportNamespaceSpecifier?.() &&
      binding.path.parentPath?.node?.source?.value === "@litsx/core"
    ) {
      return path.get("arguments.0");
    }
  }
  return null;
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
  if (name !== "styles") return null;
  const rightPath = path.get("expression.right");
  return {
    componentName: expression.left.object.name,
    stylePath: getReplaceStylesArgument(rightPath, t) ?? rightPath,
  };
}

function collectLightDomComponents(programPath, t, defaultDomMode) {
  const names = new Set();
  if (defaultDomMode === "light") {
    for (const statementPath of programPath.get("body")) {
      if (
        statementPath.isFunctionDeclaration() &&
        statementPath.node.id?.name
      ) {
        names.add(statementPath.node.id.name);
      }
      if (statementPath.isVariableDeclaration()) {
        for (const declaration of statementPath.node.declarations) {
          if (
            t.isIdentifier(declaration.id) &&
            /^[A-Z]/.test(declaration.id.name)
          ) {
            names.add(declaration.id.name);
          }
        }
      }
    }
  }
  for (const statementPath of programPath.get("body")) {
    if (!statementPath.isExpressionStatement()) continue;
    const expression = statementPath.node.expression;
    if (
      t.isAssignmentExpression(expression, { operator: "=" }) &&
      t.isMemberExpression(expression.left) &&
      t.isIdentifier(expression.left.object) &&
      t.isIdentifier(expression.left.property, { name: "lightDom" }) &&
      t.isBooleanLiteral(expression.right, { value: true })
    ) {
      names.add(expression.left.object.name);
    }
  }
  return names;
}

/**
 * Consume static utility guards from authored Component.styles assignments.
 * The replacement is already a CSSResult, so no non-Lit value can leak into
 * the native component lowering or the browser runtime.
 */
export {
  appendStyleReference,
  classPatternValues,
  combineStringParts,
  composeStyleReferences,
  containsLightDomMixin,
  findImportedCssIdentifier,
  findStaticStylesMember,
  finiteStringValues,
  getStaticRuntimeMetadataString,
  guardTemplate,
  inheritedStylesExpression,
  inlineConstantBindings,
  insertAfterImports,
  isLitsxComponentClass,
  isSymbolFor,
  scopeGuardMarkers,
  unwrapStringExpression,
};

export function createUnoCssAuthoringPlugin(options = {}) {
  return function litsxUnoCssAuthoringPlugin(api) {
    api.assertVersion("^8.0.0");
    const t = api.types;
    return {
      name: "litsx-unocss-authoring-guards",
      visitor: {
        Program: {
          exit(programPath, state) {
            const assignments = programPath
              .get("body")
              .map((path) => getStylesAssignment(path, t))
              .filter(Boolean);
            if (assignments.length === 0) return;
            const strategy =
              options.lightDomStyles?.strategy ??
              options.lightDomStyles ??
              "scoped";
            const lightDomComponents = collectLightDomComponents(
              programPath,
              t,
              options.defaultDomMode,
            );

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

            const consume = (
              stylePath,
              replacementPath = stylePath,
              emit = "component",
              owner = null,
            ) => {
              const node = stylePath.node;
              if (t.isArrayExpression(node)) {
                for (const elementPath of stylePath.get("elements")) {
                  if (!elementPath.node) continue;
                  if (elementPath.isSpreadElement()) {
                    consume(
                      elementPath.get("argument"),
                      elementPath,
                      emit,
                      owner,
                    );
                  } else {
                    consume(elementPath, elementPath, emit, owner);
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
                    emit,
                    owner,
                  },
                  ensureCssIdentifier(),
                  t,
                ),
              );
            };

            for (const { componentName, stylePath } of assignments) {
              const isLightDom = lightDomComponents.has(componentName);
              const emit =
                isLightDom && strategy !== "scoped" ? strategy : "component";
              consume(stylePath, stylePath, emit, componentName);
            }
          },
        },
      },
    };
  };
}

/**
 * Create the low-level Babel output plugin used by the UnoCSS adapter.
 *
 * The plugin contributes one CSSResult per compiled component. Its marker owns
 * only utilities statically reachable from that component's class/className
 * bindings; non-finite values are contributed through explicit guards or a
 * matching safelist.
 */
export function createUnoCssOutputPlugin(options = {}) {
  const globalCssModule =
    typeof options.globalCssModule === "string" && options.globalCssModule
      ? options.globalCssModule
      : null;
  const preflightModule =
    typeof options.preflightModule === "string" && options.preflightModule
      ? options.preflightModule
      : null;

  return function litsxUnoCssOutputPlugin(api) {
    api.assertVersion("^8.0.0");
    const t = api.types;

    return {
      name: "litsx-unocss-output",
      visitor: {
        Program: {
          exit(programPath, state) {
            if (
              state.file.metadata.litsxStyleIntegrations?.some(
                (integration) => integration.name === "unocss",
              )
            ) {
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

            const filename = state.filename || state.file.opts.filename;
            const staticResolver = createStaticGuardResolver({
              source: state.file.code || "",
              filename,
              ast: state.file.ast,
            });

            const componentInfos = componentClasses.map((classPath) => ({
              classPath,
              lightDomScope: getStaticRuntimeMetadataString(
                classPath,
                LITSX_LIGHT_DOM_SCOPE_SYMBOL,
                t,
              ),
              lightDom: containsLightDomMixin(classPath.node.superClass, t),
            }));
            const hasComponentStyles = componentInfos.some(
              ({ lightDom, lightDomScope }) =>
                !lightDom || Boolean(lightDomScope),
            );

            const importedCssIdentifier = findImportedCssIdentifier(
              programPath,
              t,
            );
            const cssIdentifier =
              importedCssIdentifier ??
              programPath.scope.generateUidIdentifier("litsxUnoCss");
            const preflightIdentifier = preflightModule
              ? programPath.scope.generateUidIdentifier("litsxUnoCssPreflight")
              : null;
            const insertedNodes = [];
            if (globalCssModule) {
              insertedNodes.push(
                t.importDeclaration([], t.stringLiteral(globalCssModule)),
              );
            }
            insertedNodes.push(
              t.expressionStatement(
                t.unaryExpression(
                  "void",
                  t.stringLiteral(UNO_CSS_COMPONENT_MODULE_MARKER),
                ),
              ),
            );
            if (!importedCssIdentifier && hasComponentStyles) {
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
            if (preflightIdentifier && hasComponentStyles) {
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
            insertAfterImports(programPath, insertedNodes);

            const components = [];
            for (const {
              classPath,
              lightDomScope,
              lightDom,
            } of componentInfos) {
              const owner = classPath.node.id?.name ?? null;
              const {
                candidates,
                dynamicPatterns,
                dependencies,
                staticSources,
              } = collectUtilityClassCandidates(
                classPath,
                t,
                staticResolver,
                filename,
                { dynamicWildcard: UNO_CSS_DYNAMIC_WILDCARD },
              );
              if (lightDomScope) {
                const scope = `[${LITSX_LIGHT_DOM_SCOPE_ATTRIBUTE}="${lightDomScope}"]`;
                scopeGuardMarkers(classPath, scope, t);
                const scopedIdentifier =
                  programPath.scope.generateUidIdentifier(
                    "litsxUnoCssScopedStyles",
                  );
                const scopedMarker = createUnoCssGuardMarker({
                  candidates,
                  dynamicPatterns,
                  dependencies,
                  staticSources,
                  owner,
                  scope,
                });
                const scopedDeclaration = t.variableDeclaration("const", [
                  t.variableDeclarator(
                    t.cloneNode(scopedIdentifier),
                    t.taggedTemplateExpression(
                      t.cloneNode(cssIdentifier),
                      t.templateLiteral(
                        [
                          t.templateElement(
                            { raw: scopedMarker, cooked: scopedMarker },
                            true,
                          ),
                        ],
                        [],
                      ),
                    ),
                  ),
                ]);
                classPath.insertBefore(scopedDeclaration);
                appendStyleReference(
                  classPath,
                  scopedIdentifier,
                  preflightIdentifier,
                  t,
                );
                if (classPath.node.id?.name)
                  components.push(classPath.node.id.name);
                continue;
              }
              if (lightDom) {
                const lightDomStrategy =
                  options.lightDomStyles?.strategy ?? options.lightDomStyles;
                classPath.insertBefore(
                  t.expressionStatement(
                    t.unaryExpression(
                      "void",
                      t.stringLiteral(
                        createUnoCssGuardMarker({
                          candidates,
                          dynamicPatterns,
                          dependencies,
                          staticSources,
                          emit:
                            lightDomStrategy === "global" ? "global" : "none",
                          owner,
                        }),
                      ),
                    ),
                  ),
                );
                continue;
              }
              const stylesIdentifier =
                programPath.scope.generateUidIdentifier("litsxUnoCssStyles");
              const marker = createUnoCssGuardMarker({
                candidates,
                dynamicPatterns,
                dependencies,
                staticSources,
                owner,
              });
              classPath.insertBefore(
                t.variableDeclaration("const", [
                  t.variableDeclarator(
                    t.cloneNode(stylesIdentifier),
                    t.taggedTemplateExpression(
                      t.cloneNode(cssIdentifier),
                      t.templateLiteral(
                        [
                          t.templateElement(
                            { raw: marker, cooked: marker },
                            true,
                          ),
                        ],
                        [],
                      ),
                    ),
                  ),
                ]),
              );
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
                ? "shared-preflight-component-utilities"
                : "component-isolated",
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
  const reactCompatDomMode = options.reactCompat
    ? typeof options.reactCompat === "object"
      ? (options.reactCompat.domMode ?? "light")
      : "light"
    : null;
  const resolvedIntegrationOptions = {
    ...integrationOptions,
    defaultDomMode: reactCompatDomMode ?? options.defaultDomMode,
    lightDomStyles: options.reactCompat
      ? "global"
      : (options.lightDomStyles ?? integrationOptions.lightDomStyles),
  };
  return {
    ...options,
    ...(resolvedIntegrationOptions.lightDomStyles
      ? { lightDomStyles: resolvedIntegrationOptions.lightDomStyles }
      : {}),
    authoringPlugins: [
      ...(Array.isArray(options.authoringPlugins)
        ? options.authoringPlugins
        : []),
      createUnoCssAuthoringPlugin(resolvedIntegrationOptions),
    ],
    outputPlugins: [
      ...(Array.isArray(options.outputPlugins) ? options.outputPlugins : []),
      createUnoCssOutputPlugin(resolvedIntegrationOptions),
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
  UNO_CSS_PREFLIGHT_EXPORT,
  UNO_CSS_PREFLIGHT_MODULE_ID,
} from "./protocol.js";
