const RESERVED_CUSTOM_ELEMENT_NAMES = new Set([
  "annotation-xml",
  "color-profile",
  "font-face",
  "font-face-src",
  "font-face-uri",
  "font-face-format",
  "font-face-name",
  "missing-glyph",
]);

// https://html.spec.whatwg.org/multipage/custom-elements.html#valid-custom-element-name
const PCEN_CHAR = "[.0-9_a-z\\-\\u00B7\\u00C0-\\u00D6\\u00D8-\\u00F6\\u00F8-\\u037D\\u037F-\\u1FFF\\u200C-\\u200D\\u203F-\\u2040\\u2070-\\u218F\\u2C00-\\u2FEF\\u3001-\\uD7FF\\uF900-\\uFDCF\\uFDF0-\\uFFFD]";
const VALID_CUSTOM_ELEMENT_NAME = new RegExp(`^[a-z]${PCEN_CHAR}*-${PCEN_CHAR}*$`, "u");

export const LITSX_INVALID_COMPONENT_NAME_CODE = "LITSX_INVALID_COMPONENT_NAME";

export function toKebabCase(value) {
  return String(value ?? "")
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/([A-Z])([A-Z][a-z])/g, "$1-$2")
    .toLowerCase();
}

export function isValidCustomElementName(value) {
  return (
    typeof value === "string" &&
    VALID_CUSTOM_ELEMENT_NAME.test(value) &&
    !RESERVED_CUSTOM_ELEMENT_NAMES.has(value)
  );
}

export function componentNameToTagName(value) {
  const componentName = Array.isArray(value) ? value.join(".") : String(value ?? "");
  const tagName = componentName
    .split(".")
    .filter(Boolean)
    .map(toKebabCase)
    .join("-");

  if (!isValidCustomElementName(tagName)) {
    const error = new SyntaxError(
      `Component "${componentName}" maps to invalid custom-element name "${tagName}". ` +
      "LitSX does not invent prefixes or suffixes; use a component name with at least two words, or a namespace member such as Controls.Switch.",
    );
    error.code = LITSX_INVALID_COMPONENT_NAME_CODE;
    error.componentName = componentName;
    error.tagName = tagName;
    throw error;
  }

  return tagName;
}

function componentFunctionName(node, parent) {
  if (
    (node?.type === "FunctionDeclaration" || node?.type === "FunctionExpression") &&
    node.id?.type === "Identifier"
  ) {
    return node.id.name;
  }
  if (
    node?.type === "ArrowFunctionExpression" &&
    parent?.type === "VariableDeclarator" &&
    parent.id?.type === "Identifier"
  ) {
    return parent.id.name;
  }
  return null;
}

function jsxComponentNameParts(node) {
  if (node?.type === "JSXIdentifier") {
    return /^[A-Z]/.test(node.name) ? [node.name] : null;
  }
  if (node?.type !== "JSXMemberExpression") return null;
  const objectParts = jsxComponentNameParts(node.object);
  const property = node.property?.name;
  return objectParts && typeof property === "string" ? [...objectParts, property] : null;
}

function walk(node, parent, visit) {
  if (!node || typeof node !== "object" || typeof node.type !== "string") return;
  visit(node, parent);
  for (const [key, value] of Object.entries(node)) {
    if (["loc", "parent", "extra", "tokens", "comments", "leadingComments", "innerComments", "trailingComments"].includes(key)) {
      continue;
    }
    if (Array.isArray(value)) {
      for (const child of value) walk(child, node, visit);
    } else {
      walk(value, node, visit);
    }
  }
}

export { componentFunctionName, jsxComponentNameParts, walk };

export function createInvalidComponentNameDiagnostic(componentName, node) {
  let tagName;
  try {
    return componentNameToTagName(componentName), null;
  } catch (error) {
    tagName = error.tagName ?? toKebabCase(componentName);
  }
  return {
    code: LITSX_INVALID_COMPONENT_NAME_CODE,
    severity: "error",
    message:
      `Component "${componentName}" maps to invalid custom-element name "${tagName}". ` +
      "Use a component name with at least two words, or a namespace member such as Controls.Switch.",
    componentName,
    tagName,
    node,
    start: node?.start ?? 0,
    length: Math.max(0, (node?.end ?? node?.start ?? 0) - (node?.start ?? 0)),
    line: node?.loc?.start?.line ?? null,
    column: node?.loc?.start?.column ?? null,
  };
}

export function collectComponentNameDiagnostics(ast) {
  const root = ast?.program ?? ast;
  const localComponents = new Set();
  const ignoredJsxNames = new Set(["Fragment"]);
  const reactIntrinsicComponents = new Set([
    "Fragment",
    "StrictMode",
    "Suspense",
    "SuspenseList",
  ]);
  const diagnostics = [];
  const reportedExternalComponents = new Set();

  for (const statement of root?.body ?? []) {
    if (statement?.type !== "ImportDeclaration" || statement.source?.value !== "react") continue;
    for (const specifier of statement.specifiers ?? []) {
      const imported = specifier.imported?.name ?? specifier.imported?.value;
      if (reactIntrinsicComponents.has(imported)) ignoredJsxNames.add(specifier.local.name);
    }
  }

  walk(root, null, (node, parent) => {
    const functionName = componentFunctionName(node, parent);
    if (functionName && /^[A-Z]/.test(functionName)) {
      localComponents.add(functionName);
    }
  });

  walk(root, null, (node, parent) => {
    const functionName = componentFunctionName(node, parent);
    if (functionName && /^[A-Z]/.test(functionName)) {
      const diagnostic = createInvalidComponentNameDiagnostic(functionName, node.id ?? parent?.id ?? node);
      if (diagnostic) diagnostics.push(diagnostic);
      return;
    }

    if (node.type !== "JSXOpeningElement") return;
    const parts = jsxComponentNameParts(node.name);
    if (!parts || (parts.length === 1 && (localComponents.has(parts[0]) || ignoredJsxNames.has(parts[0])))) {
      return;
    }
    const componentName = parts.join(".");
    if (reportedExternalComponents.has(componentName)) return;
    reportedExternalComponents.add(componentName);
    const diagnostic = createInvalidComponentNameDiagnostic(componentName, node.name);
    if (diagnostic) diagnostics.push(diagnostic);
  });

  return diagnostics;
}
