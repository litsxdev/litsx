import postcss from "postcss";

function cssString(value) {
  return String(value).replaceAll("\\", "\\\\").replaceAll('"', '\\"');
}

export function referenceDirective(entry) {
  return `@reference "${cssString(entry)}";`;
}

export function importDirective(entry) {
  return entry === "tailwindcss"
    ? '@import "tailwindcss" source(none);'
    : `@import "${cssString(entry)}";`;
}

function inlineSources(candidates) {
  return candidates
    .map((candidate) => `@source inline("${cssString(candidate)}");`)
    .join("\n");
}

export function componentCss(context, payload) {
  return [
    referenceDirective(context.entry),
    "@tailwind utilities source(none);",
    inlineSources(payload.candidates ?? []),
  ].join("\n");
}

export function infrastructureCss(context) {
  return [
    importDirective(context.entry),
    referenceDirective(context.entry),
    "#litsx-tailwind-infrastructure {",
    "  @tailwind utilities source(none);",
    "}",
    ...context.sources.map((source) => `@source "${cssString(source)}";`),
  ].join("\n");
}

export function removeTailwindProperties(code, from = undefined) {
  if (!code.includes("@property") && !code.includes("@layer properties")) {
    return code;
  }
  const root = postcss.parse(code, { from });
  root.walkAtRules((rule) => {
    if (
      rule.name === "property" ||
      (rule.name === "layer" && rule.params.trim() === "properties")
    ) {
      rule.remove();
    }
  });
  return root.toString();
}

export function componentPreflightCss(code, from = undefined) {
  const root = postcss.parse(removeTailwindProperties(code, from), { from });
  root.walkAtRules("layer", (rule) => {
    if (rule.params.trim() === "theme") rule.remove();
  });
  return root.toString();
}

export function extractTailwindProperties(code, from = undefined) {
  const source = postcss.parse(code, { from });
  const result = postcss.root();
  for (const node of source.nodes) {
    if (
      node.type === "atrule" &&
      (node.name === "property" ||
        (node.name === "layer" && node.params.trim() === "properties"))
    ) {
      result.append(node.clone());
    }
  }
  return result.toString();
}

export function synchronizeTailwindTheme(
  baseCode,
  expandedCode,
  from = undefined,
) {
  const base = postcss.parse(baseCode, { from });
  const expanded = postcss.parse(expandedCode, { from });
  const expandedTheme = expanded.nodes.find(
    (node) =>
      node.type === "atrule" &&
      node.name === "layer" &&
      node.params.trim() === "theme" &&
      Array.isArray(node.nodes),
  );
  if (!expandedTheme) return base.toString();
  const baseTheme = base.nodes.find(
    (node) =>
      node.type === "atrule" &&
      node.name === "layer" &&
      node.params.trim() === "theme" &&
      Array.isArray(node.nodes),
  );
  if (baseTheme) baseTheme.replaceWith(expandedTheme.clone());
  else base.prepend(expandedTheme.clone());
  return base.toString();
}
