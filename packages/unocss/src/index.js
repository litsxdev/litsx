import fs from "node:fs";
import { createStaticGuardResolver } from "./static-guards.js";
import {
  createUnoCssGuardMarker,
  decodeUnoCssGuardPayload,
  UNO_CSS_COMPONENT_MODULE_MARKER,
  UNO_CSS_DYNAMIC_WILDCARD,
  UNO_CSS_GUARD_PATTERN,
  UNO_CSS_PREFLIGHT_EXPORT,
  UNO_CSS_PREFLIGHT_MODULE_ID,
} from "./protocol.js";

const COMPONENT_SYMBOL = "litsx.component";
const LIGHT_DOM_SCOPE_SYMBOL = "litsx.lightDomStyleScope";
const LIGHT_DOM_SCOPE_ATTRIBUTE = "data-litsx-style-scope";

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

function containsLightDomMixin(node, t) {
  if (!t.isCallExpression(node)) return false;
  if (t.isIdentifier(node.callee, { name: "LightDomMixin" })) return true;
  return node.arguments.some((argument) => containsLightDomMixin(argument, t));
}

function getStaticRuntimeMetadataString(classPath, symbolKey, t) {
  for (const memberPath of classPath.get("body.body")) {
    const member = memberPath.node;
    if (
      member?.static === true &&
      member?.computed === true &&
      isSymbolFor(member.key, symbolKey, t) &&
      t.isStringLiteral(member.value)
    ) {
      return member.value.value;
    }
  }
  return null;
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

function unwrapStringExpression(node, t) {
  while (
    node &&
    (t.isTSAsExpression(node) ||
      t.isTSSatisfiesExpression(node) ||
      t.isTSNonNullExpression(node) ||
      t.isParenthesizedExpression(node))
  ) {
    node = node.expression;
  }
  return node;
}

function combineStringParts(parts, limit = 4096) {
  let values = [""];
  for (const choices of parts) {
    const next = [];
    for (const prefix of values) {
      for (const choice of choices) {
        next.push(prefix + choice);
        if (next.length > limit) return null;
      }
    }
    values = next;
  }
  return values;
}

function inlineConstantBindings(
  node,
  scope,
  t,
  resolving = new Set(),
  parent = null,
) {
  if (!node) return node;
  if (t.isIdentifier(node)) {
    const binding = scope.getBinding(node.name);
    const isReference = !parent || t.isReferenced(node, parent);
    const declaration = binding?.path?.isVariableDeclarator()
      ? binding.path
      : binding?.path?.parentPath;
    if (
      isReference &&
      binding.constant &&
      binding.constantViolations.length === 0 &&
      declaration?.isVariableDeclarator() &&
      declaration.node.init &&
      !resolving.has(binding)
    ) {
      const nextResolving = new Set(resolving).add(binding);
      return inlineConstantBindings(
        declaration.node.init,
        declaration.scope,
        t,
        nextResolving,
        null,
      );
    }
    return t.cloneNode(node);
  }

  const clone = t.cloneNode(node, false);
  for (const key of t.VISITOR_KEYS[node.type] || []) {
    const value = node[key];
    if (Array.isArray(value)) {
      clone[key] = value.map((child) =>
        child
          ? inlineConstantBindings(child, scope, t, resolving, node)
          : child,
      );
    } else if (value) {
      clone[key] = inlineConstantBindings(value, scope, t, resolving, node);
    }
  }
  return clone;
}

function finiteStringValues(node, t) {
  node = unwrapStringExpression(node, t);
  if (!node) return null;
  if (t.isStringLiteral(node)) return [node.value];
  if (t.isTemplateLiteral(node)) {
    const parts = [];
    for (let index = 0; index < node.quasis.length; index += 1) {
      parts.push([
        node.quasis[index].value.cooked ?? node.quasis[index].value.raw,
      ]);
      if (index < node.expressions.length) {
        const values = finiteStringValues(node.expressions[index], t);
        if (!values) return null;
        parts.push(values);
      }
    }
    return combineStringParts(parts);
  }
  if (t.isConditionalExpression(node)) {
    const consequent = finiteStringValues(node.consequent, t);
    const alternate = finiteStringValues(node.alternate, t);
    return consequent && alternate ? [...consequent, ...alternate] : null;
  }
  if (t.isLogicalExpression(node)) {
    const left = finiteStringValues(node.left, t);
    const right = finiteStringValues(node.right, t);
    return left && right ? [...left, ...right] : null;
  }
  if (t.isBinaryExpression(node, { operator: "+" })) {
    const left = finiteStringValues(node.left, t);
    const right = finiteStringValues(node.right, t);
    return left && right ? combineStringParts([left, right]) : null;
  }
  return null;
}

function classPatternValues(node, t, resolveStatic) {
  const finite = finiteStringValues(node, t);
  if (finite) return finite;
  const resolved = resolveStatic?.(node);
  if (resolved) return resolved;
  node = unwrapStringExpression(node, t);
  if (t.isTemplateLiteral(node)) {
    const parts = [];
    for (let index = 0; index < node.quasis.length; index += 1) {
      parts.push([
        node.quasis[index].value.cooked ?? node.quasis[index].value.raw,
      ]);
      if (index < node.expressions.length) {
        parts.push(
          classPatternValues(node.expressions[index], t, resolveStatic),
        );
      }
    }
    return combineStringParts(parts) ?? [UNO_CSS_DYNAMIC_WILDCARD];
  }
  if (t.isConditionalExpression(node)) {
    return [
      ...classPatternValues(node.consequent, t, resolveStatic),
      ...classPatternValues(node.alternate, t, resolveStatic),
    ];
  }
  if (t.isLogicalExpression(node)) {
    return [
      ...classPatternValues(node.left, t, resolveStatic),
      ...classPatternValues(node.right, t, resolveStatic),
    ];
  }
  if (t.isBinaryExpression(node, { operator: "+" })) {
    return (
      combineStringParts([
        classPatternValues(node.left, t, resolveStatic),
        classPatternValues(node.right, t, resolveStatic),
      ]) ?? [UNO_CSS_DYNAMIC_WILDCARD]
    );
  }
  return [UNO_CSS_DYNAMIC_WILDCARD];
}

function collectMarkupCandidates(classPath, t, staticResolver, filename) {
  const candidates = new Set();
  const dynamicPatterns = new Set();
  const staticCandidates = new Set();
  const staticDependencies = new Set();
  const staticSources = new Map();

  const resolveStatic = (node, scope) => {
    if (!staticResolver) return null;
    let result;
    let refreshable = true;
    try {
      result = staticResolver.resolveNode(node);
    } catch {
      refreshable = false;
      try {
        result = staticResolver.resolveNode(
          inlineConstantBindings(node, scope, t),
        );
      } catch {
        return null;
      }
    }
    if (result.kind !== "static") return null;
    for (const dependency of result.dependencies || []) {
      staticDependencies.add(dependency);
    }
    if (filename && fs.existsSync(filename) && refreshable) {
      const expressionNode = t.removePropertiesDeep(t.cloneNode(node, true));
      const descriptor = { file: filename, node: expressionNode };
      staticSources.set(JSON.stringify(descriptor), descriptor);
      for (const candidate of result.candidates) {
        staticCandidates.add(candidate);
      }
    }
    return result.candidates;
  };

  classPath.traverse({
    TaggedTemplateExpression(templatePath) {
      const tagPath = templatePath.get("tag");
      if (!tagPath.isIdentifier()) return;
      const binding = tagPath.scope.getBinding(tagPath.node.name);
      const importedHtml = Boolean(
        binding?.path?.isImportSpecifier?.() &&
        t.isIdentifier(binding.path.node.imported, { name: "html" }) &&
        ["lit", "@litsx/ssr"].includes(
          binding.path.parentPath?.node?.source?.value,
        ),
      );
      if (tagPath.node.name !== "html" && !importedHtml) {
        return;
      }
      const quasi = templatePath.node.quasi;
      if (!t.isTemplateLiteral(quasi)) return;
      const marker = (index) => `\u0001${index}\u0002`;
      let source = "";
      for (let index = 0; index < quasi.quasis.length; index += 1) {
        source +=
          quasi.quasis[index].value.cooked ?? quasi.quasis[index].value.raw;
        if (index < quasi.expressions.length) source += marker(index);
      }
      const attributePattern =
        /(?:^|[\s<])(?:class|className)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gu;
      for (const match of source.matchAll(attributePattern)) {
        const value = match[1] ?? match[2] ?? match[3] ?? "";
        const parts = [];
        let offset = 0;
        for (const placeholder of value.matchAll(/\u0001(\d+)\u0002/gu)) {
          const expressionIndex = Number(placeholder[1]);
          const expressionPath = templatePath.get(
            `quasi.expressions.${expressionIndex}`,
          );
          parts.push([value.slice(offset, placeholder.index)]);
          parts.push(
            classPatternValues(quasi.expressions[expressionIndex], t, (node) =>
              resolveStatic(node, expressionPath.scope),
            ),
          );
          offset = placeholder.index + placeholder[0].length;
        }
        parts.push([value.slice(offset)]);
        for (const expanded of combineStringParts(parts) ?? [
          UNO_CSS_DYNAMIC_WILDCARD,
        ]) {
          for (const candidate of expanded.split(/\s+/u)) {
            if (!candidate) continue;
            if (candidate.includes(UNO_CSS_DYNAMIC_WILDCARD)) {
              if (candidate !== UNO_CSS_DYNAMIC_WILDCARD) {
                dynamicPatterns.add(candidate);
              }
            } else candidates.add(candidate);
          }
        }
      }
    },
  });
  for (const candidate of staticCandidates) candidates.delete(candidate);
  return {
    candidates: [...candidates],
    dynamicPatterns: [...dynamicPatterns],
    dependencies: [...staticDependencies],
    staticSources: [...staticSources.values()],
  };
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
                LIGHT_DOM_SCOPE_SYMBOL,
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
              } = collectMarkupCandidates(
                classPath,
                t,
                staticResolver,
                filename,
              );
              if (lightDomScope) {
                const scope = `[${LIGHT_DOM_SCOPE_ATTRIBUTE}="${lightDomScope}"]`;
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
