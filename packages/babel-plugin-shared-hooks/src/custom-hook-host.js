export const HOST_TYPE_RENDER = 'render';
export const HOST_TYPE_CUSTOM = 'custom';

export function getFunctionName(path, t) {
  if (path.isFunctionDeclaration() && path.node.id?.name) {
    return path.node.id.name;
  }
  if (
    (path.isFunctionExpression() || path.isArrowFunctionExpression()) &&
    path.parentPath.isVariableDeclarator() &&
    t.isIdentifier(path.parentPath.node.id)
  ) {
    return path.parentPath.node.id.name;
  }
  return null;
}

export function isCustomHookFunction(path, t) {
  const name = getFunctionName(path, t);
  return typeof name === 'string' && /^use[A-Z0-9]/.test(name);
}

export function resolveHostInfo(callPath, t) {
  const funcPath = callPath.getFunctionParent();
  if (!funcPath) return null;

  if (
    typeof funcPath.isArrowFunctionExpression === "function" &&
    funcPath.isArrowFunctionExpression() &&
    funcPath.parentPath?.isCallExpression() &&
    funcPath.parentPath.get("callee").isIdentifier({ name: "renderWithHooks" }) &&
    funcPath.parentPath.get("arguments.0").isThisExpression()
  ) {
    const wrapperFuncPath = funcPath.parentPath.getFunctionParent();
    if (
      wrapperFuncPath?.isClassMethod({ kind: "method" }) &&
      t.isIdentifier(wrapperFuncPath.node.key, { name: "render" })
    ) {
      return {
        expression: t.thisExpression(),
        type: HOST_TYPE_RENDER,
        functionPath: wrapperFuncPath,
      };
    }
  }

  if (
    funcPath.isClassMethod({ kind: 'method' }) &&
    t.isIdentifier(funcPath.node.key, { name: 'render' })
  ) {
    return {
      expression: t.thisExpression(),
      type: HOST_TYPE_RENDER,
      functionPath: funcPath,
    };
  }

  if (isCustomHookFunction(funcPath, t)) {
    return {
      expression: null,
      type: HOST_TYPE_CUSTOM,
      functionPath: funcPath,
    };
  }

  return null;
}

export function findCurrentCallPath(programPath, callPath) {
  const targetNode = callPath?.node;
  if (!programPath || !targetNode) return callPath;
  const targetStart = targetNode.start;
  const targetEnd = targetNode.end;

  let currentPath = null;
  programPath.traverse({
    CallExpression(path) {
      const isSameSourceNode =
        Number.isInteger(targetStart) &&
        Number.isInteger(targetEnd) &&
        path.node.start === targetStart &&
        path.node.end === targetEnd;
      if (path.node !== targetNode && !isSameSourceNode) return;
      currentPath = path;
      path.stop();
    },
  });

  return currentPath;
}
