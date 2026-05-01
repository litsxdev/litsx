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

export function inferHostIdentifier(path, t) {
  if (!path) return null;
  if (path.node.__litsxHostIdentifier) {
    return path.node.__litsxHostIdentifier;
  }
  const [firstParam] = path.node.params;
  if (t.isIdentifier(firstParam) && /^_?host/.test(firstParam.name)) {
    return firstParam.name;
  }
  return null;
}

export function ensureHostParam(functionPath, t) {
  const existingHostName = inferHostIdentifier(functionPath, t);
  if (existingHostName) {
    functionPath.node.__litsxHostIdentifier = existingHostName;
    return t.identifier(existingHostName);
  }

  let hostId = t.identifier('_host');
  if (functionPath.scope.hasBinding(hostId.name)) {
    hostId = functionPath.scope.generateUidIdentifier('host');
  }

  functionPath.node.params.unshift(hostId);
  functionPath.node.__litsxHostIdentifier = hostId.name;
  return hostId;
}

export function resolveHostInfo(callPath, t) {
  const funcPath = callPath.getFunctionParent();
  if (!funcPath) return null;

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
    const hostId = ensureHostParam(funcPath, t);
    return {
      expression: t.identifier(hostId.name),
      type: HOST_TYPE_CUSTOM,
      functionPath: funcPath,
    };
  }

  return null;
}
