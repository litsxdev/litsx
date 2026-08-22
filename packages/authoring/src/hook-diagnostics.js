export const LITSX_HOOK_ASYNC_SCOPE_CODE = "LITSX_HOOK_ASYNC_SCOPE";
export const LITSX_HOOK_AFTER_EARLY_RETURN_CODE = "LITSX_HOOK_AFTER_EARLY_RETURN";
export const LITSX_HOOK_CONDITIONAL_CODE = "LITSX_HOOK_CONDITIONAL";
export const LITSX_HOOK_DEFERRED_ACTION_CODE = "LITSX_HOOK_DEFERRED_ACTION";
export const LITSX_HOOK_INVALID_SCOPE_CODE = "LITSX_HOOK_INVALID_SCOPE";
export const LITSX_HOOK_LOOP_CODE = "LITSX_HOOK_LOOP";
export const LITSX_HOOK_TRY_BLOCK_CODE = "LITSX_HOOK_TRY_BLOCK";
export const LITSX_NESTED_HOOK_DEFINITION_CODE = "LITSX_NESTED_HOOK_DEFINITION";

const FUNCTION_TYPES = new Set([
  "ArrowFunctionExpression",
  "FunctionDeclaration",
  "FunctionExpression",
  "ObjectMethod",
  "ClassMethod",
  "ClassPrivateMethod",
]);
const CONDITIONAL_TYPES = new Set([
  "IfStatement",
  "ConditionalExpression",
  "LogicalExpression",
  "SwitchCase",
]);
const LOOP_TYPES = new Set([
  "DoWhileStatement",
  "ForInStatement",
  "ForOfStatement",
  "ForStatement",
  "WhileStatement",
]);
const SKIPPED_KEYS = new Set([
  "comments",
  "errors",
  "extra",
  "innerComments",
  "leadingComments",
  "loc",
  "parent",
  "tokens",
  "trailingComments",
]);

function isHookName(name) {
  return typeof name === "string" && /^use[A-Z0-9]/.test(name);
}

function propertyName(node) {
  if (node?.type === "Identifier" || node?.type === "JSXIdentifier") return node.name;
  if (node?.type === "StringLiteral" || node?.type === "Literal") return node.value;
  return null;
}

function functionName(node, parent) {
  if (node?.id?.type === "Identifier") return node.id.name;
  if (parent?.type === "VariableDeclarator" && parent.id?.type === "Identifier") {
    return parent.id.name;
  }
  if (parent?.type === "AssignmentExpression" && parent.left?.type === "Identifier") {
    return parent.left.name;
  }
  if (node?.type === "ObjectMethod" || node?.type === "ClassMethod" || node?.type === "ClassPrivateMethod") {
    return propertyName(node.key);
  }
  return null;
}

function calleeName(callee, importedHooks, hookNamespaces) {
  if (callee?.type === "Identifier") {
    return importedHooks.get(callee.name) ?? (isHookName(callee.name) ? callee.name : null);
  }
  if (
    callee?.type === "MemberExpression" &&
    callee.computed !== true &&
    callee.object?.type === "Identifier" &&
    hookNamespaces.has(callee.object.name)
  ) {
    const name = propertyName(callee.property);
    return isHookName(name) ? name : null;
  }
  return null;
}

function isDefineHookReader(node, ancestors, importedDefineHooks, hookNamespaces) {
  const directMethod = node?.type === "ObjectMethod" && propertyName(node.key) === "use";
  const property = ancestors.at(-1);
  const propertyFunction =
    property?.type === "ObjectProperty" &&
    property.value === node &&
    propertyName(property.key) === "use";
  if (!directMethod && !propertyFunction) return false;
  const object = propertyFunction ? ancestors.at(-2) : ancestors.at(-1);
  const call = propertyFunction ? ancestors.at(-3) : ancestors.at(-2);
  if (object?.type !== "ObjectExpression" || call?.type !== "CallExpression" || call.arguments?.[0] !== object) {
    return false;
  }
  if (call.callee?.type === "Identifier") return importedDefineHooks.has(call.callee.name);
  return (
    call.callee?.type === "MemberExpression" &&
    call.callee.computed !== true &&
    call.callee.object?.type === "Identifier" &&
    hookNamespaces.has(call.callee.object.name) &&
    propertyName(call.callee.property) === "defineHook"
  );
}

function isAllowedHookScope(node, parent, ancestors, importedDefineHooks, hookNamespaces) {
  const name = functionName(node, parent);
  if (isHookName(name) || (typeof name === "string" && /^[A-Z]/.test(name))) return true;
  if ((node?.type === "ClassMethod" || node?.type === "ClassPrivateMethod") && name === "render") return true;
  if (isDefineHookReader(node, ancestors, importedDefineHooks, hookNamespaces)) return true;
  const call = parent?.type === "CallExpression" ? parent : null;
  return (
    call?.arguments?.includes(node) &&
    call.callee?.type === "Identifier" &&
    call.callee.name === "renderWithHooks"
  );
}

function createDiagnostic(code, message, node, hookName = null) {
  return {
    code,
    severity: "error",
    message,
    hookName,
    node,
    start: node?.start ?? 0,
    length: Math.max(0, (node?.end ?? node?.start ?? 0) - (node?.start ?? 0)),
    line: node?.loc?.start?.line ?? null,
    column: node?.loc?.start?.column ?? null,
  };
}

function walk(node, ancestors, visit) {
  if (!node || typeof node !== "object" || typeof node.type !== "string") return;
  visit(node, ancestors);
  const nextAncestors = [...ancestors, node];
  for (const [key, value] of Object.entries(node)) {
    if (SKIPPED_KEYS.has(key)) continue;
    if (Array.isArray(value)) {
      for (const child of value) walk(child, nextAncestors, visit);
    } else {
      walk(value, nextAncestors, visit);
    }
  }
}

function containsReturn(node) {
  function visit(entry, root = false) {
    if (!entry || typeof entry !== "object" || typeof entry.type !== "string") return false;
    if (!root && FUNCTION_TYPES.has(entry.type)) return false;
    if (entry.type === "ReturnStatement") return true;
    for (const [key, value] of Object.entries(entry)) {
      if (SKIPPED_KEYS.has(key)) continue;
      if (Array.isArray(value) && value.some((child) => visit(child))) return true;
      if (!Array.isArray(value) && visit(value)) return true;
    }
    return false;
  }
  return visit(node, true);
}

function followsConditionalReturn(functionNode, hookNode) {
  if (functionNode?.body?.type !== "BlockStatement") return false;
  for (const statement of functionNode.body.body ?? []) {
    if ((statement.start ?? Number.POSITIVE_INFINITY) >= (hookNode.start ?? 0)) break;
    if (
      (
        statement.type === "IfStatement" ||
        statement.type === "SwitchStatement" ||
        statement.type === "TryStatement" ||
        LOOP_TYPES.has(statement.type)
      ) &&
      containsReturn(statement)
    ) {
      return true;
    }
  }
  return false;
}

export function collectHookDiagnostics(ast) {
  const root = ast?.program ?? ast;
  const importedHooks = new Map();
  const importedDefineHooks = new Set(["defineHook"]);
  const hookNamespaces = new Set();
  const diagnostics = [];

  for (const statement of root?.body ?? []) {
    if (statement?.type !== "ImportDeclaration") continue;
    const source = statement.source?.value;
    const isHookRuntime = source === "react" || source === "@litsx/core" || source === "@litsx/react";
    if (!isHookRuntime) continue;
    for (const specifier of statement.specifiers ?? []) {
      if (specifier.type === "ImportNamespaceSpecifier" || specifier.type === "ImportDefaultSpecifier") {
        hookNamespaces.add(specifier.local.name);
        continue;
      }
      if (specifier.type !== "ImportSpecifier") continue;
      const importedName = propertyName(specifier.imported);
      if (isHookName(importedName)) importedHooks.set(specifier.local.name, importedName);
      if (importedName === "defineHook") importedDefineHooks.add(specifier.local.name);
    }
  }

  walk(root, [], (node, ancestors) => {
    const parent = ancestors.at(-1) ?? null;

    if (FUNCTION_TYPES.has(node.type)) {
      const name = functionName(node, parent);
      const enclosingFunction = [...ancestors].reverse().find((entry) => FUNCTION_TYPES.has(entry.type));
      if (isHookName(name) && enclosingFunction) {
        diagnostics.push(createDiagnostic(
          LITSX_NESTED_HOOK_DEFINITION_CODE,
          `Custom hook "${name}" is declared inside another function. Declare hooks at module scope so their identity and hook order remain stable.`,
          node,
          name,
        ));
      }
      return;
    }

    if (node.type !== "CallExpression") return;
    const hookName = calleeName(node.callee, importedHooks, hookNamespaces);
    if (!hookName) return;

    let functionIndex = -1;
    for (let index = ancestors.length - 1; index >= 0; index -= 1) {
      if (FUNCTION_TYPES.has(ancestors[index].type)) {
        functionIndex = index;
        break;
      }
    }
    const functionNode = functionIndex >= 0 ? ancestors[functionIndex] : null;
    const functionParent = functionIndex > 0 ? ancestors[functionIndex - 1] : null;
    const functionAncestors = functionIndex >= 0 ? ancestors.slice(0, functionIndex) : [];

    if (
      functionNode &&
      functionParent?.type === "CallExpression" &&
      functionParent.arguments?.[1] === functionNode &&
      calleeName(functionParent.callee, importedHooks, hookNamespaces) === "useAsyncState"
    ) {
      diagnostics.push(createDiagnostic(
        LITSX_HOOK_DEFERRED_ACTION_CODE,
        `${hookName}() is executed by a deferred useAsyncState action. Hooks must run synchronously during render; capture the required value before creating the action.`,
        node,
        hookName,
      ));
      return;
    }

    if (!functionNode || !isAllowedHookScope(
      functionNode,
      functionParent,
      functionAncestors,
      importedDefineHooks,
      hookNamespaces,
    )) {
      diagnostics.push(createDiagnostic(
        LITSX_HOOK_INVALID_SCOPE_CODE,
        `${hookName}() is called outside a component render or custom hook. Hooks cannot run in handlers, effects, deferred callbacks, or ordinary helper functions.`,
        node,
        hookName,
      ));
      return;
    }

    if (functionNode.async) {
      diagnostics.push(createDiagnostic(
        LITSX_HOOK_ASYNC_SCOPE_CODE,
        `${hookName}() is called from an async component or custom hook. Hook registration must complete synchronously before any Promise continuation.`,
        node,
        hookName,
      ));
      return;
    }

    if (followsConditionalReturn(functionNode, node)) {
      diagnostics.push(createDiagnostic(
        LITSX_HOOK_AFTER_EARLY_RETURN_CODE,
        `${hookName}() is called after a conditional early return. Hooks must execute in the same order on every render.`,
        node,
        hookName,
      ));
      return;
    }

    const controlAncestors = ancestors.slice(functionIndex + 1);
    if (controlAncestors.some((entry) => LOOP_TYPES.has(entry.type))) {
      diagnostics.push(createDiagnostic(
        LITSX_HOOK_LOOP_CODE,
        `${hookName}() is called inside a loop. Hooks must execute in the same order on every render.`,
        node,
        hookName,
      ));
      return;
    }
    if (controlAncestors.some((entry) => CONDITIONAL_TYPES.has(entry.type))) {
      diagnostics.push(createDiagnostic(
        LITSX_HOOK_CONDITIONAL_CODE,
        `${hookName}() is called conditionally. Hooks must execute in the same order on every render.`,
        node,
        hookName,
      ));
      return;
    }
    if (controlAncestors.some((entry) => entry.type === "TryStatement" || entry.type === "CatchClause")) {
      diagnostics.push(createDiagnostic(
        LITSX_HOOK_TRY_BLOCK_CODE,
        `${hookName}() is called inside try/catch. Exception control flow can change hook order between renders.`,
        node,
        hookName,
      ));
    }
  });

  return diagnostics;
}
