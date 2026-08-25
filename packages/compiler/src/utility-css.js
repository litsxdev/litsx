import fs from "node:fs";
export {
  createStaticGuardResolver,
  resolveStaticClassExpression,
  resolveStaticGuardExport,
  runtimeStyleExpression,
} from "./utility-css-static.js";

export const LITSX_COMPONENT_SYMBOL = "litsx.component";
export const LITSX_LIGHT_DOM_SCOPE_SYMBOL = "litsx.lightDomStyleScope";
export const LITSX_LIGHT_DOM_SCOPE_ATTRIBUTE = "data-litsx-style-scope";
export const UTILITY_CSS_DYNAMIC_WILDCARD = "\u0000";

export function isSymbolFor(node, name, t) {
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

export function isLitsxComponentClass(classPath, t) {
  return classPath.get("body.body").some((memberPath) => {
    const member = memberPath.node;
    return Boolean(
      member?.static === true &&
      member?.computed === true &&
      isSymbolFor(member.key, LITSX_COMPONENT_SYMBOL, t),
    );
  });
}

export function containsLightDomMixin(node, t) {
  if (!t.isCallExpression(node)) return false;
  if (t.isIdentifier(node.callee, { name: "LightDomMixin" })) return true;
  return node.arguments.some((argument) => containsLightDomMixin(argument, t));
}

export function getStaticRuntimeMetadataString(classPath, symbolKey, t) {
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

export function combineUtilityStringParts(parts, limit = 4096) {
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

export function unwrapStringExpression(node, t) {
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

export function inlineConstantBindings(
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
      binding?.constant &&
      binding.constantViolations.length === 0 &&
      declaration?.isVariableDeclarator() &&
      declaration.node.init &&
      !resolving.has(binding)
    ) {
      return inlineConstantBindings(
        declaration.node.init,
        declaration.scope,
        t,
        new Set(resolving).add(binding),
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

export function finiteStringValues(node, t) {
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
    return combineUtilityStringParts(parts);
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
    return left && right ? combineUtilityStringParts([left, right]) : null;
  }
  return null;
}

export function classPatternValues(
  node,
  t,
  resolveStatic,
  wildcard = UTILITY_CSS_DYNAMIC_WILDCARD,
) {
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
          classPatternValues(
            node.expressions[index],
            t,
            resolveStatic,
            wildcard,
          ),
        );
      }
    }
    return combineUtilityStringParts(parts) ?? [wildcard];
  }
  if (t.isConditionalExpression(node)) {
    return [
      ...classPatternValues(node.consequent, t, resolveStatic, wildcard),
      ...classPatternValues(node.alternate, t, resolveStatic, wildcard),
    ];
  }
  if (t.isLogicalExpression(node)) {
    return [
      ...classPatternValues(node.left, t, resolveStatic, wildcard),
      ...classPatternValues(node.right, t, resolveStatic, wildcard),
    ];
  }
  if (t.isBinaryExpression(node, { operator: "+" })) {
    return (
      combineUtilityStringParts([
        classPatternValues(node.left, t, resolveStatic, wildcard),
        classPatternValues(node.right, t, resolveStatic, wildcard),
      ]) ?? [wildcard]
    );
  }
  return [wildcard];
}

/** Collect exact and finite utility candidates owned by one lowered component. */
export function collectUtilityClassCandidates(
  classPath,
  t,
  staticResolver,
  filename,
  options = {},
) {
  const wildcard = options.dynamicWildcard ?? UTILITY_CSS_DYNAMIC_WILDCARD;
  const candidates = new Set();
  const dynamicPatterns = new Set();
  const staticCandidates = new Set();
  const dependencies = new Set();
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
      dependencies.add(dependency);
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
    "ClassDeclaration|ClassExpression"(nestedClassPath) {
      if (
        options.excludeLitsxComponentClasses === true &&
        isLitsxComponentClass(nestedClassPath, t)
      ) {
        nestedClassPath.skip();
      }
    },
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
      if (tagPath.node.name !== "html" && !importedHtml) return;
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
            classPatternValues(
              quasi.expressions[expressionIndex],
              t,
              (node) => resolveStatic(node, expressionPath.scope),
              wildcard,
            ),
          );
          offset = placeholder.index + placeholder[0].length;
        }
        parts.push([value.slice(offset)]);
        for (const expanded of combineUtilityStringParts(parts) ?? [wildcard]) {
          for (const candidate of expanded.split(/\s+/u)) {
            if (!candidate) continue;
            if (candidate.includes(wildcard)) {
              if (candidate !== wildcard) dynamicPatterns.add(candidate);
            } else {
              candidates.add(candidate);
            }
          }
        }
      }
    },
  });

  for (const candidate of staticCandidates) candidates.delete(candidate);
  return {
    candidates: [...candidates],
    dynamicPatterns: [...dynamicPatterns],
    dependencies: [...dependencies],
    staticSources: [...staticSources.values()],
  };
}
