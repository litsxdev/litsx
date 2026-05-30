import { collectComponentLikeFunctions } from "./authored-semantics.js";

export const LITSX_IMPLICIT_CHILDREN_UNSUPPORTED_CODE = 91021;
export const LITSX_IMPLICIT_CHILDREN_DUPLICATE_CODE = 91022;

export const LITSX_IMPLICIT_CHILDREN_UNSUPPORTED_MESSAGE =
  "Implicit `children` projection is only supported as a direct JSX child expression like `{children}` or `{props.children}`. Use explicit `<slot>` markup for other patterns.";

export const LITSX_IMPLICIT_CHILDREN_DUPLICATE_MESSAGE =
  "Implicit `children` projection can only appear once per component render. Use explicit `<slot>` markup for more complex slot distribution.";

function walk(node, visitor, parent = null, context = { nestedFunctionDepth: 0 }) {
  if (!node || typeof node !== "object") {
    return;
  }

  const shouldContinue = visitor(node, parent, context);
  if (shouldContinue === false) {
    return;
  }

  let nextContext = context;
  if (
    parent &&
    (node.type === "FunctionDeclaration" ||
      node.type === "FunctionExpression" ||
      node.type === "ArrowFunctionExpression")
  ) {
    nextContext = {
      ...context,
      nestedFunctionDepth: context.nestedFunctionDepth + 1,
    };
  }

  if (nextContext.nestedFunctionDepth > 0) {
    return;
  }

  for (const [key, value] of Object.entries(node)) {
    if (key === "loc" || key === "leadingComments" || key === "innerComments" || key === "trailingComments") {
      continue;
    }

    if (Array.isArray(value)) {
      for (const child of value) {
        walk(child, visitor, node, nextContext);
      }
    } else {
      walk(value, visitor, node, nextContext);
    }
  }
}

function createPropsObjectBinding() {
  return { kind: "props-object" };
}

function createChildrenBinding() {
  return { kind: "prop", propName: "children" };
}

function registerChildrenBindingsFromObjectPattern(pattern, bindings) {
  let changed = false;

  for (const property of pattern?.properties ?? []) {
    if (property?.type !== "ObjectProperty") {
      continue;
    }

    const keyName = property.key?.type === "Identifier"
      ? property.key.name
      : property.key?.type === "StringLiteral"
      ? property.key.value
      : null;

    if (keyName !== "children") {
      continue;
    }

    if (property.value?.type === "Identifier") {
      if (!bindings.has(property.value.name)) {
        bindings.set(property.value.name, createChildrenBinding());
        changed = true;
      }
      continue;
    }

    if (
      property.value?.type === "AssignmentPattern" &&
      property.value.left?.type === "Identifier" &&
      !bindings.has(property.value.left.name)
    ) {
      bindings.set(property.value.left.name, createChildrenBinding());
      changed = true;
    }
  }

  return changed;
}

function inferImplicitChildrenBindings(functionNode) {
  const bindings = new Map();
  const firstParam = functionNode?.params?.[0];

  if (firstParam?.type === "Identifier") {
    bindings.set(firstParam.name, createPropsObjectBinding());
  } else if (firstParam?.type === "ObjectPattern") {
    registerChildrenBindingsFromObjectPattern(firstParam, bindings);
  } else if (firstParam?.type === "AssignmentPattern") {
    if (firstParam.left?.type === "Identifier") {
      bindings.set(firstParam.left.name, createPropsObjectBinding());
    } else if (firstParam.left?.type === "ObjectPattern") {
      registerChildrenBindingsFromObjectPattern(firstParam.left, bindings);
    }
  }

  let changed = true;
  while (changed) {
    changed = false;

    walk(functionNode.body, (node) => {
      if (node?.type !== "VariableDeclarator") {
        return;
      }

      if (node.id?.type === "Identifier" && node.init?.type === "Identifier") {
        const binding = bindings.get(node.init.name);
        if (binding && !bindings.has(node.id.name)) {
          bindings.set(node.id.name, binding.kind === "props-object" ? createPropsObjectBinding() : createChildrenBinding());
          changed = true;
        }
        return;
      }

      if (
        node.id?.type === "Identifier" &&
        node.init?.type === "MemberExpression" &&
        node.init.computed === false &&
        node.init.object?.type === "Identifier" &&
        node.init.property?.type === "Identifier" &&
        node.init.property.name === "children"
      ) {
        const binding = bindings.get(node.init.object.name);
        if (binding?.kind === "props-object" && !bindings.has(node.id.name)) {
          bindings.set(node.id.name, createChildrenBinding());
          changed = true;
        }
        return;
      }

      if (node.id?.type === "ObjectPattern" && node.init?.type === "Identifier") {
        const binding = bindings.get(node.init.name);
        if (binding?.kind === "props-object") {
          changed = registerChildrenBindingsFromObjectPattern(node.id, bindings) || changed;
        }
      }
    });
  }

  return bindings;
}

function isChildrenIdentifierReference(node, parent, bindings) {
  if (node?.type !== "Identifier") {
    return false;
  }

  const binding = bindings.get(node.name);
  if (binding?.kind !== "prop" || binding.propName !== "children") {
    return false;
  }

  if (!parent) {
    return false;
  }

  if (
    (parent.type === "VariableDeclarator" && parent.id === node) ||
    (parent.type === "FunctionDeclaration" && parent.id === node) ||
    (parent.type === "FunctionExpression" && parent.id === node) ||
    (parent.type === "ObjectProperty" && parent.key === node && parent.computed !== true) ||
    (parent.type === "MemberExpression" && parent.property === node && parent.computed === false) ||
    (parent.type === "AssignmentPattern" && parent.left === node)
  ) {
    return false;
  }

  return true;
}

function isChildrenMemberExpression(node, bindings) {
  return (
    node?.type === "MemberExpression" &&
    node.computed === false &&
    node.object?.type === "Identifier" &&
    node.property?.type === "Identifier" &&
    node.property.name === "children" &&
    bindings.get(node.object.name)?.kind === "props-object"
  );
}

function isDirectJsxChildExpression(node, parent) {
  return (
    node?.type === "JSXExpressionContainer" &&
    (parent?.type === "JSXElement" || parent?.type === "JSXFragment")
  );
}

export function collectImplicitChildrenProjectionIssues(ast) {
  const issues = [];

  for (const { node: functionNode } of collectComponentLikeFunctions(ast)) {
    const bindings = inferImplicitChildrenBindings(functionNode);
    if (bindings.size === 0) {
      continue;
    }

    let projectionCount = 0;

    walk(functionNode.body, (node, parent) => {
      if (
        isDirectJsxChildExpression(node, parent) &&
        (
          isChildrenIdentifierReference(node.expression, node, bindings) ||
          isChildrenMemberExpression(node.expression, bindings)
        )
      ) {
        projectionCount += 1;
        if (projectionCount > 1) {
          issues.push({
            kind: "implicit-children-duplicate",
            severity: "error",
            code: LITSX_IMPLICIT_CHILDREN_DUPLICATE_CODE,
            message: LITSX_IMPLICIT_CHILDREN_DUPLICATE_MESSAGE,
            start: node.expression.start ?? node.start ?? 0,
            length: Math.max(0, (node.expression.end ?? node.end ?? node.start ?? 0) - (node.expression.start ?? node.start ?? 0)),
            node: node.expression,
          });
        }
        return false;
      }

      if (isChildrenMemberExpression(node, bindings)) {
        issues.push({
          kind: "implicit-children-unsupported",
          severity: "error",
          code: LITSX_IMPLICIT_CHILDREN_UNSUPPORTED_CODE,
          message: LITSX_IMPLICIT_CHILDREN_UNSUPPORTED_MESSAGE,
          start: node.start ?? 0,
          length: Math.max(0, (node.end ?? node.start ?? 0) - (node.start ?? 0)),
          node,
        });
        return false;
      }

      if (isChildrenIdentifierReference(node, parent, bindings)) {
        issues.push({
          kind: "implicit-children-unsupported",
          severity: "error",
          code: LITSX_IMPLICIT_CHILDREN_UNSUPPORTED_CODE,
          message: LITSX_IMPLICIT_CHILDREN_UNSUPPORTED_MESSAGE,
          start: node.start ?? 0,
          length: Math.max(0, (node.end ?? node.start ?? 0) - (node.start ?? 0)),
          node,
        });
      }

      return true;
    });
  }

  return issues;
}
