export const STATIC_HOIST_CALL_RE = /\b(__litsx_static_[A-Za-z_$][\w$]*)\s*\(/g;
export const NATIVE_STATIC_HOISTS = new Set([
  "styles",
  "properties",
  "shadowRootOptions",
  "lightDom",
]);

function isPascalCaseName(name) {
  return typeof name === "string" && /^[A-Z]/.test(name);
}

function isComponentLikeFunction(node, parent) {
  if (!node || typeof node !== "object") {
    return false;
  }

  if (
    node.type === "FunctionDeclaration" ||
    node.type === "FunctionExpression"
  ) {
    return isPascalCaseName(node.id?.name ?? "");
  }

  if (node.type === "ArrowFunctionExpression") {
    if (parent?.type === "VariableDeclarator" && parent.id?.type === "Identifier") {
      return isPascalCaseName(parent.id.name);
    }

    if (parent?.type === "AssignmentExpression" && parent.left?.type === "Identifier") {
      return isPascalCaseName(parent.left.name);
    }
  }

  return false;
}

export function collectComponentLikeFunctions(ast) {
  const functions = [];

  function collect(node, parent = null) {
    if (!node || typeof node !== "object") {
      return;
    }

    if (isComponentLikeFunction(node, parent)) {
      functions.push({ node, parent });
    }

    for (const [key, value] of Object.entries(node)) {
      if (key === "loc" || key === "leadingComments" || key === "innerComments" || key === "trailingComments") {
        continue;
      }
      if (Array.isArray(value)) {
        for (const child of value) {
          if (child && typeof child.type === "string") {
            collect(child, node);
          }
        }
      } else if (value && typeof value.type === "string") {
        collect(value, node);
      }
    }
  }

  collect(ast.program ?? ast, null);
  return functions;
}

function walk(node, visitor, state = null) {
  if (!node || typeof node !== "object") {
    return;
  }

  visitor(node, state);

  for (const value of Object.values(node)) {
    if (Array.isArray(value)) {
      value.forEach((child) => walk(child, visitor, state));
    } else {
      walk(value, visitor, state);
    }
  }
}

function getJsxOpeningElementTagName(nameNode) {
  if (nameNode?.type === "JSXIdentifier") {
    return nameNode.name;
  }

  if (nameNode?.type === "JSXNamespacedName") {
    return `${nameNode.namespace.name}:${nameNode.name.name}`;
  }

  if (nameNode?.type === "JSXMemberExpression") {
    return nameNode.property?.name ?? null;
  }

  return null;
}

export function collectNativeClassNameWarnings(ast) {
  const warnings = [];

  function visit(node, currentTagName = null) {
    if (!node || typeof node !== "object") {
      return;
    }

    let nextTagName = currentTagName;
    if (node.type === "JSXOpeningElement") {
      const tagName = getJsxOpeningElementTagName(node.name);
      if (typeof tagName === "string" && /^[a-z]/.test(tagName)) {
        nextTagName = tagName;
      }
    }

    if (
      node.type === "JSXAttribute" &&
      nextTagName &&
      node.name?.type === "JSXIdentifier" &&
      node.name.name === "className"
    ) {
      warnings.push({
        code: 91008,
        message:
          '`className` is not native LitSX syntax. Use `class` in native LitSX, or add the React compatibility layer to rewrite `className`.',
        attributeName: "className",
        tagName: nextTagName,
        start: node.name.start ?? node.start ?? 0,
        length: Math.max(0, (node.name.end ?? node.end ?? node.name.start ?? node.start ?? 0) - (node.name.start ?? node.start ?? 0)),
        line: node.name.loc?.start?.line ?? null,
        column: node.name.loc?.start?.column ?? null,
      });
    }

    for (const value of Object.values(node)) {
      if (Array.isArray(value)) {
        value.forEach((child) => visit(child, nextTagName));
      } else {
        visit(value, nextTagName);
      }
    }
  }

  visit(ast.program ?? ast, null);
  return warnings;
}

export function collectReactMemoWarnings(ast) {
  const warnings = [];
  const reactMemoLocalNames = new Set();
  const reactNamespaceNames = new Set();

  const body = ast?.program?.body ?? ast?.body ?? [];
  for (const node of body) {
    if (node?.type !== "ImportDeclaration" || node.source?.value !== "react") {
      continue;
    }

    for (const specifier of node.specifiers || []) {
      if (
        specifier?.type === "ImportSpecifier" &&
        specifier.imported?.type === "Identifier" &&
        specifier.imported.name === "memo" &&
        specifier.local?.type === "Identifier"
      ) {
        reactMemoLocalNames.add(specifier.local.name);
      }

      if (
        (specifier?.type === "ImportDefaultSpecifier" ||
          specifier?.type === "ImportNamespaceSpecifier") &&
        specifier.local?.type === "Identifier"
      ) {
        reactNamespaceNames.add(specifier.local.name);
      }
    }
  }

  walk(ast.program ?? ast, (node) => {
    if (node?.type !== "CallExpression") {
      return;
    }

    const callee = node.callee;
    const isImportedMemo =
      callee?.type === "Identifier" && reactMemoLocalNames.has(callee.name);
    const isNamespacedMemo =
      callee?.type === "MemberExpression" &&
      callee.computed === false &&
      callee.object?.type === "Identifier" &&
      reactNamespaceNames.has(callee.object.name) &&
      callee.property?.type === "Identifier" &&
      callee.property.name === "memo";

    if (!isImportedMemo && !isNamespacedMemo) {
      return;
    }

    warnings.push({
      code: 91016,
      message:
        "`memo(...)` is removed during LitSX lowering. LitSX does not use React-style parent re-render bailout semantics, so `memo` is treated as a migration wrapper only.",
      start: node.start ?? 0,
      length: Math.max(0, (node.end ?? node.start ?? 0) - (node.start ?? 0)),
      line: node.loc?.start?.line ?? null,
      column: node.loc?.start?.column ?? null,
    });

    if ((node.arguments || []).length > 1) {
      warnings.push({
        code: 91017,
        message:
          "`memo(Component, areEqual)` ignores the comparator during LitSX lowering because LitSX does not use React-style parent re-render bailout semantics.",
        start: node.start ?? 0,
        length: Math.max(0, (node.end ?? node.start ?? 0) - (node.start ?? 0)),
        line: node.loc?.start?.line ?? null,
        column: node.loc?.start?.column ?? null,
      });
    }
  });

  return warnings;
}
