import {
  collectUtilityClassCandidates,
  containsLightDomMixin,
  createStaticGuardResolver,
  getStaticRuntimeMetadataString,
  isLitsxComponentClass,
  LITSX_LIGHT_DOM_SCOPE_ATTRIBUTE,
  LITSX_LIGHT_DOM_SCOPE_SYMBOL,
  UTILITY_CSS_DYNAMIC_WILDCARD,
} from "@litsx/compiler/utility-css";
import {
  createTailwindGuardMarker,
  decodeTailwindGuardPayload,
  TAILWIND_COMPONENT_MODULE_PREFIX,
  TAILWIND_GUARD_PATTERN,
  TAILWIND_INFRASTRUCTURE_MODULE_ID,
  TAILWIND_PREFLIGHT_MODULE_ID,
} from "./protocol.js";

function insertAfterImports(programPath, nodes) {
  if (nodes.length === 0) return;
  const lastImport = [...programPath.get("body")]
    .reverse()
    .find((path) => path.isImportDeclaration());
  if (lastImport) lastImport.insertAfter(nodes);
  else programPath.unshiftContainer("body", nodes);
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

function inheritedStylesExpression(t) {
  return t.logicalExpression(
    "??",
    t.memberExpression(t.super(), t.identifier("styles")),
    t.arrayExpression([]),
  );
}

function composeStyles(existing, before, after, t) {
  return t.arrayExpression([
    ...before.filter(Boolean).map((addition) => t.cloneNode(addition)),
    ...(existing
      ? t.isArrayExpression(existing)
        ? existing.elements.map((element) => t.cloneNode(element, true))
        : [t.cloneNode(existing, true)]
      : []),
    ...after.filter(Boolean).map((addition) => t.cloneNode(addition)),
  ]);
}

function appendStyles(classPath, preflight, utility, t) {
  const stylesPath = findStaticStylesMember(classPath, t);
  if (!stylesPath) {
    classPath
      .get("body")
      .unshiftContainer(
        "body",
        t.classProperty(
          t.identifier("styles"),
          composeStyles(
            inheritedStylesExpression(t),
            [preflight],
            [utility],
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
        (statement) => statement.isReturnStatement() && statement.node.argument,
      );
    if (returnPath) {
      returnPath
        .get("argument")
        .replaceWith(
          composeStyles(returnPath.node.argument, [preflight], [utility], t),
        );
    }
    return;
  }
  if (stylesPath.isClassProperty() && stylesPath.node.value) {
    stylesPath
      .get("value")
      .replaceWith(
        composeStyles(stylesPath.node.value, [preflight], [utility], t),
      );
  }
}

function getReplaceStylesArgument(path, t) {
  if (!path?.isCallExpression?.() || path.node.arguments.length !== 1)
    return null;
  const calleePath = path.get("callee");
  if (calleePath.isIdentifier()) {
    const binding = path.scope.getBinding(calleePath.node.name);
    if (
      binding?.path?.isImportSpecifier?.() &&
      t.isIdentifier(binding.path.node.imported, { name: "replaceStyles" }) &&
      binding.path.parentPath?.node?.source?.value === "@litsx/core"
    )
      return path.get("arguments.0");
  }
  return null;
}

function getStylesAssignment(path, t) {
  if (!path.isExpressionStatement()) return null;
  const expression = path.node.expression;
  if (
    !t.isAssignmentExpression(expression, { operator: "=" }) ||
    !t.isMemberExpression(expression.left) ||
    !t.isIdentifier(expression.left.object)
  )
    return null;
  const property = expression.left.computed
    ? expression.left.property.value
    : expression.left.property.name;
  if (property !== "styles") return null;
  const rightPath = path.get("expression.right");
  return {
    owner: expression.left.object.name,
    stylePath: getReplaceStylesArgument(rightPath, t) ?? rightPath,
  };
}

function findCssImport(programPath, t) {
  for (const statement of programPath.get("body")) {
    if (
      !statement.isImportDeclaration() ||
      statement.node.source.value !== "@litsx/core"
    )
      continue;
    for (const specifier of statement.node.specifiers) {
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
  const marker = createTailwindGuardMarker(payload);
  return t.taggedTemplateExpression(
    t.cloneNode(cssIdentifier),
    t.templateLiteral(
      [t.templateElement({ raw: marker, cooked: marker }, true)],
      [],
    ),
  );
}

function consumeGuard(stylePath, resolver, ensureCss, owner, t) {
  if (stylePath.isArrayExpression()) {
    for (const elementPath of stylePath.get("elements")) {
      if (!elementPath.node) continue;
      consumeGuard(
        elementPath.isSpreadElement()
          ? elementPath.get("argument")
          : elementPath,
        resolver,
        ensureCss,
        owner,
        t,
      );
    }
    return;
  }
  let result;
  try {
    result = stylePath.isIdentifier()
      ? resolver.resolveLocal(stylePath.node.name)
      : resolver.resolveNode(stylePath.node);
  } catch (error) {
    throw stylePath.buildCodeFrameError(
      `@litsx/tailwind could not statically resolve this styles guard: ${error.message}`,
    );
  }
  if (result.kind === "runtime" || result.kind === "external") return;
  if (result.kind !== "static") {
    throw stylePath.buildCodeFrameError(
      "@litsx/tailwind styles guards must be finite static strings, arrays, objects, or imports.",
    );
  }
  stylePath.replaceWith(
    guardTemplate(
      {
        candidates: result.candidates,
        dependencies: result.dependencies,
        descriptor: result.descriptor,
        owner,
      },
      ensureCss(),
      t,
    ),
  );
}

export function createTailwindAuthoringPlugin() {
  return function tailwindAuthoring(api) {
    api.assertVersion("^8.0.0");
    const t = api.types;
    return {
      name: "litsx-tailwind-authoring-guards",
      visitor: {
        Program: {
          exit(programPath, state) {
            const assignments = programPath
              .get("body")
              .map((path) => getStylesAssignment(path, t))
              .filter(Boolean);
            if (assignments.length === 0) return;
            const resolver = createStaticGuardResolver({
              source: state.file.code || "",
              filename: state.filename || state.file.opts.filename,
              ast: state.file.ast,
            });
            let cssIdentifier = findCssImport(programPath, t);
            const ensureCss = () => {
              if (cssIdentifier) return cssIdentifier;
              cssIdentifier =
                programPath.scope.generateUidIdentifier("litsxTailwindGuard");
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
            for (const { owner, stylePath } of assignments) {
              consumeGuard(stylePath, resolver, ensureCss, owner, t);
            }
          },
        },
      },
    };
  };
}

function collectGuardCandidates(classPath) {
  const candidates = new Set();
  const dependencies = new Set();
  classPath.traverse({
    TemplateElement(path) {
      const raw = path.node.value?.raw;
      if (!raw?.includes("__LITSX_TAILWIND_GUARD_")) return;
      const next = raw.replace(
        new RegExp(TAILWIND_GUARD_PATTERN.source, "g"),
        (_match, encoded) => {
          const payload = decodeTailwindGuardPayload(encoded);
          for (const candidate of payload.candidates ?? [])
            candidates.add(candidate);
          for (const dependency of payload.dependencies ?? [])
            dependencies.add(dependency);
          return "";
        },
      );
      path.node.value.raw = next;
      path.node.value.cooked = next;
    },
  });
  return { candidates: [...candidates], dependencies: [...dependencies] };
}

function wildcardPattern(pattern) {
  return new RegExp(
    `^${pattern
      .split(UTILITY_CSS_DYNAMIC_WILDCARD)
      .map((part) => part.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"))
      .join(".+")}$`,
    "u",
  );
}

export function createTailwindOutputPlugin(context, options = {}) {
  return function tailwindOutput(api) {
    api.assertVersion("^8.0.0");
    const t = api.types;
    return {
      name: "litsx-tailwind-output",
      visitor: {
        Program: {
          exit(programPath, state) {
            const classes = [];
            programPath.traverse({
              ClassDeclaration(classPath) {
                if (isLitsxComponentClass(classPath, t))
                  classes.push(classPath);
              },
            });
            const filename =
              state.filename || state.file.opts.filename || "unknown.tsx";
            const resolver = createStaticGuardResolver({
              source: state.file.code || "",
              filename,
              ast: state.file.ast,
            });
            const globalUtilities = collectUtilityClassCandidates(
              programPath,
              t,
              resolver,
              filename,
              {
                excludeClassBodies: true,
                retainStaticCandidates: true,
              },
            );
            const globalPatterns =
              globalUtilities.dynamicPatterns.map(wildcardPattern);
            const globalCandidates = new Set(globalUtilities.candidates);
            for (const safeCandidate of context.safelist) {
              if (
                globalPatterns.some((pattern) => pattern.test(safeCandidate))
              ) {
                globalCandidates.add(safeCandidate);
              }
            }
            if (classes.length === 0 && globalCandidates.size === 0) return;
            const imports = [
              t.importDeclaration(
                [],
                t.stringLiteral(TAILWIND_INFRASTRUCTURE_MODULE_ID),
              ),
            ];
            if (globalCandidates.size > 0) {
              const key = context.register(filename, "@global", {
                candidates: [...globalCandidates].sort(),
                dependencies: [...new Set(globalUtilities.dependencies)],
                mode: "global",
                scope: null,
              });
              imports.push(
                t.importDeclaration(
                  [],
                  t.stringLiteral(
                    `${TAILWIND_COMPONENT_MODULE_PREFIX}${key}.css`,
                  ),
                ),
              );
            }
            let unsafeCssIdentifier;
            let preflightResultIdentifier;
            const ensureUnsafeCss = () => {
              if (unsafeCssIdentifier) return unsafeCssIdentifier;
              unsafeCssIdentifier = programPath.scope.generateUidIdentifier(
                "litsxTailwindUnsafeCss",
              );
              imports.push(
                t.importDeclaration(
                  [
                    t.importSpecifier(
                      t.cloneNode(unsafeCssIdentifier),
                      t.identifier("unsafeCSS"),
                    ),
                  ],
                  t.stringLiteral("lit"),
                ),
              );
              return unsafeCssIdentifier;
            };
            const ensurePreflight = () => {
              if (preflightResultIdentifier) return preflightResultIdentifier;
              const unsafeCss = ensureUnsafeCss();
              const preflightText = programPath.scope.generateUidIdentifier(
                "litsxTailwindPreflightText",
              );
              preflightResultIdentifier =
                programPath.scope.generateUidIdentifier(
                  "litsxTailwindPreflight",
                );
              imports.push(
                t.importDeclaration(
                  [t.importDefaultSpecifier(t.cloneNode(preflightText))],
                  t.stringLiteral(`${TAILWIND_PREFLIGHT_MODULE_ID}?inline`),
                ),
                t.variableDeclaration("const", [
                  t.variableDeclarator(
                    t.cloneNode(preflightResultIdentifier),
                    t.callExpression(t.cloneNode(unsafeCss), [
                      t.cloneNode(preflightText),
                    ]),
                  ),
                ]),
              );
              return preflightResultIdentifier;
            };

            for (const classPath of classes) {
              const owner = classPath.node.id?.name ?? "Component";
              const extracted = collectUtilityClassCandidates(
                classPath,
                t,
                resolver,
                filename,
                { retainStaticCandidates: true },
              );
              const guards = collectGuardCandidates(classPath);
              const patterns = extracted.dynamicPatterns.map(wildcardPattern);
              const candidates = new Set([
                ...extracted.candidates,
                ...guards.candidates,
              ]);
              for (const safeCandidate of context.safelist) {
                if (patterns.some((pattern) => pattern.test(safeCandidate))) {
                  candidates.add(safeCandidate);
                }
              }
              const lightDomScope = getStaticRuntimeMetadataString(
                classPath,
                LITSX_LIGHT_DOM_SCOPE_SYMBOL,
                t,
              );
              const lightDom = containsLightDomMixin(
                classPath.node.superClass,
                t,
              );
              const mode = lightDom
                ? lightDomScope
                  ? "scoped"
                  : "global"
                : "shadow";
              const scope = lightDomScope
                ? `[${LITSX_LIGHT_DOM_SCOPE_ATTRIBUTE}="${lightDomScope}"]`
                : null;
              const key = context.register(filename, owner, {
                candidates: [...candidates].sort(),
                dependencies: [
                  ...new Set([
                    ...extracted.dependencies,
                    ...guards.dependencies,
                  ]),
                ],
                mode,
                scope,
              });
              const moduleId = `${TAILWIND_COMPONENT_MODULE_PREFIX}${key}.css`;
              if (mode === "shadow" || mode === "scoped") {
                const unsafeCss = ensureUnsafeCss();
                const cssText = programPath.scope.generateUidIdentifier(
                  "litsxTailwindCssText",
                );
                const cssResult = programPath.scope.generateUidIdentifier(
                  "litsxTailwindStyles",
                );
                imports.push(
                  t.importDeclaration(
                    [t.importDefaultSpecifier(t.cloneNode(cssText))],
                    t.stringLiteral(`${moduleId}?inline`),
                  ),
                );
                classPath.insertBefore(
                  t.variableDeclaration("const", [
                    t.variableDeclarator(
                      t.cloneNode(cssResult),
                      t.callExpression(t.cloneNode(unsafeCss), [
                        mode === "scoped"
                          ? t.templateLiteral(
                              [
                                t.templateElement(
                                  {
                                    raw: `@scope (${scope}) to ([data-litsx-style-scope]) {\n`,
                                    cooked: `@scope (${scope}) to ([data-litsx-style-scope]) {\n`,
                                  },
                                ),
                                t.templateElement(
                                  { raw: "\n}", cooked: "\n}" },
                                  true,
                                ),
                              ],
                              [t.cloneNode(cssText)],
                            )
                          : t.cloneNode(cssText),
                      ]),
                    ),
                  ]),
                );
                appendStyles(
                  classPath,
                  mode === "shadow" ? ensurePreflight() : null,
                  cssResult,
                  t,
                );
              } else {
                imports.push(
                  t.importDeclaration([], t.stringLiteral(moduleId)),
                );
              }
            }
            insertAfterImports(programPath, imports);
            state.file.metadata.litsxStyleIntegrations ??= [];
            state.file.metadata.litsxStyleIntegrations.push({
              name: "tailwind",
              strategy: "component-isolated",
            });
          },
        },
      },
    };
  };
}

export function withTailwindCompiler(
  options,
  context,
  integrationOptions = {},
) {
  const reactCompatDomMode = options.reactCompat
    ? typeof options.reactCompat === "object"
      ? (options.reactCompat.domMode ?? "light")
      : "light"
    : null;
  return {
    ...options,
    ...(reactCompatDomMode ? { lightDomStyles: "global" } : {}),
    authoringPlugins: [
      ...(Array.isArray(options.authoringPlugins)
        ? options.authoringPlugins
        : []),
      createTailwindAuthoringPlugin(integrationOptions),
    ],
    outputPlugins: [
      ...(Array.isArray(options.outputPlugins) ? options.outputPlugins : []),
      createTailwindOutputPlugin(context, integrationOptions),
    ],
  };
}

export {
  appendStyles,
  collectGuardCandidates,
  composeStyles,
  consumeGuard,
  findCssImport,
  findStaticStylesMember,
  getReplaceStylesArgument,
  getStylesAssignment,
  guardTemplate,
  inheritedStylesExpression,
  insertAfterImports,
  wildcardPattern,
};
