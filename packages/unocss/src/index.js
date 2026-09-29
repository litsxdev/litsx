import fs from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { parse } from "@babel/parser";
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
import { loadConfig } from "@unocss/config";
import { createUnoCssIntegration } from "./build-engine.js";

const CONFIG_MODULE_EXTENSIONS = [
  "",
  ".mjs",
  ".js",
  ".mts",
  ".ts",
  ".cjs",
  ".cts",
  ".json",
];

async function existingConfigModule(specifier, importer) {
  if (!specifier.startsWith(".")) return null;
  const unresolved = path.resolve(path.dirname(importer), specifier);
  for (const extension of CONFIG_MODULE_EXTENSIONS) {
    const candidate = `${unresolved}${extension}`;
    try {
      if ((await fs.stat(candidate)).isFile()) return candidate;
    } catch {}
  }
  for (const extension of CONFIG_MODULE_EXTENSIONS.slice(1)) {
    const candidate = path.join(unresolved, `index${extension}`);
    try {
      if ((await fs.stat(candidate)).isFile()) return candidate;
    } catch {}
  }
  return null;
}

async function createFreshConfigSnapshot(entryPath, identity) {
  const records = new Map();
  const reversePaths = new Map();

  async function snapshotModule(sourcePath) {
    const normalizedSource = path.resolve(sourcePath);
    const existing = records.get(normalizedSource);
    if (existing) return existing.temporaryPath;
    const extension = path.extname(normalizedSource) || ".js";
    const temporaryPath = path.join(
      path.dirname(normalizedSource),
      `.litsx-unocss-reload-${process.pid}-${identity}-${records.size}${extension}`,
    );
    const record = { sourcePath: normalizedSource, temporaryPath };
    records.set(normalizedSource, record);
    reversePaths.set(temporaryPath, normalizedSource);

    let source = await fs.readFile(normalizedSource, "utf8");
    if (extension !== ".json") {
      const ast = parse(source, {
        sourceType: "unambiguous",
        plugins: ["typescript", "jsx", "importAttributes"],
      });
      const replacements = [];
      const sourceNodes = [];
      for (const statement of ast.program.body) {
        const sourceNode =
          statement.type === "ImportDeclaration" ||
          statement.type === "ExportAllDeclaration" ||
          statement.type === "ExportNamedDeclaration"
            ? statement.source
            : null;
        if (sourceNode && typeof sourceNode.value === "string") {
          sourceNodes.push(sourceNode);
        }
      }
      const visited = new Set();
      function collectStaticRequires(node) {
        if (!node || typeof node !== "object" || visited.has(node)) return;
        visited.add(node);
        if (
          node.type === "CallExpression" &&
          node.callee?.type === "Identifier" &&
          node.callee.name === "require" &&
          node.arguments?.length === 1 &&
          node.arguments[0]?.type === "StringLiteral"
        ) {
          sourceNodes.push(node.arguments[0]);
        }
        for (const value of Object.values(node)) {
          if (Array.isArray(value)) {
            for (const child of value) collectStaticRequires(child);
          } else if (value && typeof value === "object") {
            collectStaticRequires(value);
          }
        }
      }
      collectStaticRequires(ast.program);
      for (const sourceNode of sourceNodes) {
        const dependency = await existingConfigModule(
          sourceNode.value,
          normalizedSource,
        );
        if (!dependency) continue;
        const temporaryDependency = await snapshotModule(dependency);
        let relative = path.relative(
          path.dirname(temporaryPath),
          temporaryDependency,
        );
        if (!relative.startsWith("./") && !relative.startsWith("../")) {
          relative = `./${relative}`;
        }
        replacements.push({
          start: sourceNode.start,
          end: sourceNode.end,
          value: JSON.stringify(relative.split(path.sep).join("/")),
        });
      }
      for (const replacement of replacements.sort((a, b) => b.start - a.start)) {
        source = `${source.slice(0, replacement.start)}${replacement.value}${source.slice(replacement.end)}`;
      }
    }
    await fs.writeFile(temporaryPath, source);
    return temporaryPath;
  }

  async function cleanup() {
    await Promise.all(
      [...records.values()].map(({ temporaryPath }) =>
        fs.rm(temporaryPath, { force: true }),
      ),
    );
  }

  let temporaryEntry;
  try {
    temporaryEntry = await snapshotModule(entryPath);
  } catch (error) {
    await cleanup();
    throw error;
  }
  return {
    entryPath: temporaryEntry,
    sources: [...records.keys()],
    originalPath(file) {
      return reversePaths.get(path.resolve(file)) ?? path.resolve(file);
    },
    cleanup,
  };
}

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
            const globalUtilities = collectUtilityClassCandidates(
              programPath,
              t,
              staticResolver,
              filename,
              {
                dynamicWildcard: UNO_CSS_DYNAMIC_WILDCARD,
                excludeClassBodies: true,
              },
            );

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
            if (
              globalUtilities.candidates.length > 0 ||
              globalUtilities.dynamicPatterns.length > 0 ||
              globalUtilities.staticSources.length > 0
            ) {
              insertedNodes.push(
                t.expressionStatement(
                  t.unaryExpression(
                    "void",
                    t.stringLiteral(
                      createUnoCssGuardMarker({
                        ...globalUtilities,
                        emit: "global",
                      }),
                    ),
                  ),
                ),
              );
            }
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

/**
 * Create one build-tool-neutral LitSX integration descriptor.
 *
 * Hosts consume the descriptor structurally: they create one instance per
 * build/runtime, merge `compiler`, process compiled modules, observe returned
 * dependencies and publish the declared outputs at graph finalization.
 */
export function litsxUnoCss(options = {}) {
  const integrationOptions = options.integration ?? {};
  const configOrPath = options.config;
  const preflightSpecifier =
    integrationOptions.preflightModule ?? UNO_CSS_PREFLIGHT_MODULE_ID;
  const preflightEnabled = preflightSpecifier !== false;
  const preflightOutputId = options.preflightOutput ?? "preflight.js";
  const globalCssOutputId = options.globalCssOutput ?? "global.css";

  return Object.freeze({
    name: "unocss",
    async create(context) {
      let disposed = false;
      let engine;
      let configSources = [];
      let knownModules = new Set();
      let primaryConfigSource = null;
      let reloadRevision = 0;
      const reloadIdentity = randomUUID();
      const resolvedConfigOrPath = typeof configOrPath === "string"
        ? path.resolve(context.projectRoot, configOrPath)
        : configOrPath;

      async function loadEngine(forceFresh = false, configPathHint = null) {
        let snapshot = null;
        let loaded;
        const freshSource = primaryConfigSource ?? configPathHint;
        if (forceFresh && freshSource) {
          try {
            await fs.access(freshSource);
            snapshot = await createFreshConfigSnapshot(
              freshSource,
              `${reloadIdentity}-${reloadRevision++}`,
            );
          } catch (error) {
            if (error?.code !== "ENOENT") throw error;
          }
        }
        try {
          loaded = snapshot || resolvedConfigOrPath != null
            ? await loadConfig(
              context.projectRoot,
              snapshot?.entryPath ?? resolvedConfigOrPath,
            )
            : await loadConfig(context.projectRoot);
        } finally {
          if (snapshot) await snapshot.cleanup();
        }
        const loadedSources = [
          ...(loaded.sources ?? []),
          ...(loaded.dependencies ?? []),
          ...(snapshot?.sources ?? []),
        ].map((source) => snapshot?.originalPath(source) ??
          path.resolve(context.projectRoot, source));
        primaryConfigSource = snapshot
          ? freshSource
          : (loaded.sources?.[0]
              ? path.resolve(context.projectRoot, loaded.sources[0])
              : null);
        configSources = [...new Set(loadedSources)];
        engine = await createUnoCssIntegration(loaded.config, {
          preflightLayers: integrationOptions.preflightLayers,
        });
      }

      function assertActive() {
        if (disposed) {
          throw new Error("This @litsx/unocss integration instance has been disposed.");
        }
      }

      await loadEngine();

      return {
        compiler: withUnoCssCompiler(
          { reactCompat: false },
          {
            ...integrationOptions,
            globalCssModule: false,
            preflightModule: preflightSpecifier,
          },
        ),
        async resolveModule({ specifier }) {
          assertActive();
          if (!preflightEnabled || specifier !== preflightSpecifier) return null;
          return {
            code: engine.createPreflightModuleSource(
              await engine.generatePreflight(),
            ),
            dependencies: configSources,
          };
        },
        async processModule({ result, sourcePath }) {
          assertActive();
          const materialized = await engine.materializeModule(
            result.code,
            sourcePath,
          );
          if (!materialized) return { dependencies: configSources };
          knownModules.add(sourcePath);
          return {
            code: materialized.code,
            map: materialized.map,
            dependencies: [
              ...new Set([...configSources, ...materialized.dependencies]),
            ],
          };
        },
        async finalize() {
          assertActive();
          const [preflightCss, globalCss] = await Promise.all([
            engine.generatePreflight(),
            engine.generateGlobalCss(),
          ]);
          return {
            dependencies: configSources,
            outputs: [
              ...(preflightEnabled ? [{
                id: preflightOutputId,
                kind: "module",
                content: engine.createPreflightModuleSource(preflightCss),
                specifier: preflightSpecifier,
              }] : []),
              {
                id: globalCssOutputId,
                kind: "style",
                content: globalCss,
                document: true,
              },
            ],
          };
        },
        async invalidate({ paths }) {
          assertActive();
          if (!Array.isArray(paths)) {
            knownModules = new Set();
            await loadEngine(true);
            return;
          }
          const normalizedPaths = paths.map((file) => path.resolve(file));
          const configPathHint = normalizedPaths.find((file) =>
            /^(?:uno|unocss)\.config(?:\.(?:mts|cts|ts|mjs|cjs|js|json))?$/.test(
              path.basename(file),
            ));
          if (
            configPathHint ||
            normalizedPaths.some((file) => configSources.includes(file))
          ) {
            knownModules = new Set();
            await loadEngine(true, configPathHint);
            return;
          }
          for (const file of normalizedPaths) {
            for (const importer of engine.invalidate(file)) {
              engine.forgetModule(importer);
              knownModules.delete(importer);
            }
          }
        },
        forget({ moduleId }) {
          assertActive();
          engine.forgetModule(moduleId);
          knownModules.delete(moduleId);
        },
        dispose() {
          if (disposed) return;
          disposed = true;
          for (const moduleId of knownModules) engine.forgetModule(moduleId);
          knownModules.clear();
          engine = null;
          configSources = [];
        },
      };
    },
  });
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
