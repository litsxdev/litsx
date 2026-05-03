import {
  ensureHostParam,
  getFunctionName,
  isCustomHookFunction,
} from './custom-hook-host.js';

export function initializeUseStateCustomHookBridge(state) {
  state.sourceUseStateLocals = new Set();
  state.runtimeUseStateLocals = new Set();
  state.localCustomHooks = new Set();
}

export function collectUseStateImports(path, state, options = {}) {
  const importSources = new Set(options.importSources || ['react']);
  if (!importSources.has(path.node.source.value)) return;
  path.get('specifiers').forEach((specifierPath) => {
    if (!specifierPath.isImportSpecifier()) return;
    if (specifierPath.node.imported.name !== 'useState') return;
    state.sourceUseStateLocals.add(specifierPath.node.local.name);
  });
}

export function finalizeUseStateImports(programPath, state, t, options = {}) {
  const importSources = new Set(options.importSources || ['react']);
  const runtimeModule = options.runtimeModule || '@litsx/litsx';
  programPath.scope.crawl();

  if (state.runtimeUseStateLocals.size > 0) {
    ensureLitsxUseStateImport(
      programPath,
      Array.from(state.runtimeUseStateLocals),
      t,
      runtimeModule
    );
  }

  programPath.get('body').forEach((nodePath) => {
    if (!nodePath.isImportDeclaration()) return;
    const source = nodePath.node.source.value;
    if (!importSources.has(source)) return;

    nodePath.get('specifiers').forEach((specifierPath) => {
      if (!specifierPath.isImportSpecifier()) return;
      if (specifierPath.node.imported.name !== 'useState') return;

      const localName = specifierPath.node.local.name;
      if (source !== runtimeModule && state.runtimeUseStateLocals.has(localName)) {
        specifierPath.remove();
        return;
      }

      const binding = programPath.scope.getBinding(localName);
      if (!binding || binding.referencePaths.length === 0) {
        specifierPath.remove();
      }
    });

    if (nodePath.node.specifiers.length === 0) {
      nodePath.remove();
    }
  });
}

export function transformLocalUseStateCustomHook(functionPath, state, t) {
  if (!isCustomHookFunction(functionPath, t)) return;

  const hookCalls = [];
  functionPath.traverse({
    CallExpression(callPath) {
      if (!t.isIdentifier(callPath.node.callee)) return;
      if (!state.sourceUseStateLocals.has(callPath.node.callee.name)) return;
      hookCalls.push(callPath);
    },
  });

  if (hookCalls.length === 0) return;

  state.localCustomHooks.add(getFunctionName(functionPath, t));

  const hostId = ensureHostParam(functionPath, t);
  hookCalls.forEach((callPath) => {
    const [firstArg] = callPath.node.arguments;
    if (t.isIdentifier(firstArg, { name: hostId.name })) {
      return;
    }
    callPath.node.arguments.unshift(t.identifier(hostId.name));
    state.runtimeUseStateLocals.add(callPath.node.callee.name);
  });
}

export function injectCustomHookHostArguments(classPath, state, t) {
  classPath.traverse(
    {
      CallExpression(innerPath) {
        const callee = innerPath.node.callee;
        if (!t.isIdentifier(callee)) return;
        if (!state.localCustomHooks.has(callee.name)) return;
        const methodParent = innerPath.getFunctionParent();
        if (!methodParent?.isClassMethod({ kind: 'method' })) return;
        if (!t.isIdentifier(methodParent.node.key, { name: 'render' })) return;
        const [firstArg] = innerPath.node.arguments;
        if (t.isThisExpression(firstArg)) return;
        innerPath.node.arguments.unshift(t.thisExpression());
      },
    },
    state
  );
}

function ensureLitsxUseStateImport(programPath, localNames, t, runtimeModule = '@litsx/litsx') {
  if (localNames.length === 0) return;

  let existingImport = null;
  programPath.get('body').forEach((child) => {
    if (!child.isImportDeclaration()) return;
    if (child.node.source.value !== runtimeModule) return;
    existingImport = child;
  });

  if (existingImport) {
    const present = new Set(
      existingImport.node.specifiers
        .filter((spec) => t.isImportSpecifier(spec))
        .map((spec) => `${spec.imported.name}:${spec.local.name}`)
    );

    localNames.forEach((localName) => {
      const key = `useState:${localName}`;
      if (present.has(key)) return;
      existingImport.node.specifiers.push(
        t.importSpecifier(t.identifier(localName), t.identifier('useState'))
      );
    });
    return;
  }

  const importDeclaration = t.importDeclaration(
    localNames.map((localName) =>
      t.importSpecifier(t.identifier(localName), t.identifier('useState'))
    ),
    t.stringLiteral(runtimeModule)
  );

  const firstImport = programPath.get('body').find((child) => child.isImportDeclaration());
  if (firstImport) {
    firstImport.insertBefore(importDeclaration);
  } else {
    programPath.unshiftContainer('body', importDeclaration);
  }
}

export function collectReactUseStateImports(path, state) {
  collectUseStateImports(path, state, { importSources: ['react'] });
}

export function finalizeReactUseStateImports(programPath, state, t) {
  finalizeUseStateImports(programPath, state, t, {
    importSources: ['react'],
    runtimeModule: '@litsx/litsx',
  });
}
