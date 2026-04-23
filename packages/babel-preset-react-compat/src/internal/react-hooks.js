import helperPluginUtils from "@babel/helper-plugin-utils";

const { declare } = helperPluginUtils;
let t;

const RUNTIME_MODULE = "litsx";

const SUPPORTED_HOOKS = new Set([
  "useEffect",
  "useLayoutEffect",
  "useMemo",
  "useCallback",
  "useReducer",
  "useId",
  "useImperativeHandle",
  "useSyncExternalStore",
  "useOptimistic",
  "useTransition",
  "useDeferredValue",
  "startTransition",
]);
const REACT_COMPAT_RUNTIME_MODULE = "litsx/context";
const REACT_COMPAT_SUPPORTED_HOOKS = new Set(["useContext"]);

const IGNORED_CUSTOM_HOOK_SOURCES = new Set(["react", "litsx"]);

function ensurePrepareCall(renderMethodPath) {
  const bodyPath = renderMethodPath.get("body");
  if (!bodyPath.isBlockStatement()) return;

  const statements = bodyPath.get("body");
  if (statements.length > 0) {
    const first = statements[0];
    if (
      first.isExpressionStatement() &&
      t.isCallExpression(first.node.expression) &&
      t.isIdentifier(first.node.expression.callee, { name: "prepareEffects" }) &&
      first.node.expression.arguments.length === 1 &&
      t.isThisExpression(first.node.expression.arguments[0])
    ) {
      return;
    }
  }

  const prepareCall = t.expressionStatement(
    t.callExpression(t.identifier("prepareEffects"), [t.thisExpression()])
  );

  bodyPath.unshiftContainer("body", prepareCall);
}

function isCustomHookName(name) {
  return typeof name === "string" && /^use[A-Z0-9]/.test(name);
}

function isSupportedCustomHookBinding(bindingPath) {
  if (!bindingPath) return false;
  if (bindingPath.isFunctionDeclaration() || bindingPath.isFunctionExpression()) {
    return true;
  }
  if (bindingPath.isVariableDeclarator()) {
    const initPath = bindingPath.get("init");
    return (
      initPath &&
      (initPath.isFunctionExpression() || initPath.isArrowFunctionExpression())
    );
  }
  return false;
}

function pushHostExpression(state, expression) {
  if (!state.hostExpressions) {
    state.hostExpressions = [];
  }
  state.hostExpressions.push(expression);
}

function popHostExpression(state) {
  if (!state.hostExpressions) return;
  state.hostExpressions.pop();
}

function getHostExpression(state) {
  const stack = state.hostExpressions;
  if (!stack || stack.length === 0) {
    throw new Error("transform-react-hooks: missing host expression context.");
  }
  return stack[stack.length - 1];
}

function cloneHostExpression(state) {
  return t.cloneNode(getHostExpression(state), true);
}

function ensureHostParamIdentifier(fnPath, state) {
  if (!state.customHookHostParams) {
    state.customHookHostParams = new WeakMap();
  }
  let hostId = state.customHookHostParams.get(fnPath.node);
  if (hostId) return hostId;

  const [firstParam] = fnPath.node.params;
  if (t.isIdentifier(firstParam) && /^_?host/.test(firstParam.name)) {
    hostId = firstParam;
    state.customHookHostParams.set(fnPath.node, hostId);
    fnPath.node.__litsxHostIdentifier = hostId.name;
    return hostId;
  }

  if (fnPath.node.__litsxHostIdentifier) {
    hostId = t.identifier(fnPath.node.__litsxHostIdentifier);
    if (!fnPath.scope.hasBinding(hostId.name)) {
      fnPath.node.params.unshift(hostId);
    }
    state.customHookHostParams.set(fnPath.node, hostId);
    return hostId;
  }

  hostId = t.identifier("_host");
  if (fnPath.scope.hasBinding(hostId.name)) {
    hostId = fnPath.scope.generateUidIdentifier("host");
  }
  fnPath.node.params.unshift(hostId);
  state.customHookHostParams.set(fnPath.node, hostId);
  fnPath.node.__litsxHostIdentifier = hostId.name;
  return hostId;
}

function getFunctionFromBinding(binding) {
  const bindingPath = binding.path;
  if (!bindingPath) return null;

  if (
    bindingPath.isFunctionDeclaration() ||
    bindingPath.isFunctionExpression() ||
    bindingPath.isArrowFunctionExpression()
  ) {
    return bindingPath;
  }

  if (bindingPath.isVariableDeclarator()) {
    const initPath = bindingPath.get("init");
    if (
      initPath &&
      (initPath.isFunctionExpression() || initPath.isArrowFunctionExpression())
    ) {
      return initPath;
    }
  }

  return null;
}

function isCompatUseContextBinding(binding) {
  if (!binding?.path?.isImportSpecifier()) {
    return false;
  }

  const importDecl = binding.path.parentPath;
  if (!importDecl?.isImportDeclaration()) {
    return false;
  }

  return (
    (importDecl.node.source.value === "react" ||
      importDecl.node.source.value === REACT_COMPAT_RUNTIME_MODULE) &&
    t.isIdentifier(binding.path.node.imported, { name: "useContext" })
  );
}

function createRuntimeCall(state, hookType, callbackNode, depNodes) {
  const calleeName = hookType === "useLayoutEffect" ? "useOnCommit" : "useAfterUpdate";
  const args = [cloneHostExpression(state), t.cloneNode(callbackNode, true)];

  if (Array.isArray(depNodes)) {
    args.push(t.arrayExpression(depNodes.map((node) => t.cloneNode(node, true))));
  }

  return t.callExpression(t.identifier(calleeName), args);
}

function createMemoRuntimeCall(state, factoryNode, depNodes) {
  const args = [cloneHostExpression(state), t.cloneNode(factoryNode, true)];
  if (Array.isArray(depNodes)) {
    args.push(t.arrayExpression(depNodes.map((node) => t.cloneNode(node, true))));
  }
  return t.callExpression(t.identifier("useMemoValue"), args);
}

function createCallbackRuntimeCall(state, callbackNode, depNodes) {
  const args = [cloneHostExpression(state), t.cloneNode(callbackNode, true)];
  if (Array.isArray(depNodes)) {
    args.push(t.arrayExpression(depNodes.map((node) => t.cloneNode(node, true))));
  }
  return t.callExpression(t.identifier("useStableCallback"), args);
}

function createReducerRuntimeCall(state, argNodes) {
  const args = [cloneHostExpression(state)];

  if (Array.isArray(argNodes)) {
    argNodes.forEach((node) => {
      if (typeof node !== "undefined") {
        args.push(t.cloneNode(node, true));
      }
    });
  }

  return t.callExpression(t.identifier("useReducedState"), args);
}

function createImperativeRuntimeCall(state, refNode, factoryNode, depNodes) {
  const args = [
    cloneHostExpression(state),
    t.cloneNode(refNode, true),
    t.cloneNode(factoryNode, true),
  ];

  if (Array.isArray(depNodes)) {
    args.push(t.arrayExpression(depNodes.map((node) => t.cloneNode(node, true))));
  }

  return t.callExpression(t.identifier("useExpose"), args);
}

function createExternalStoreRuntimeCall(state, subscribeNode, getSnapshotNode, getServerSnapshotNode) {
  const args = [
    cloneHostExpression(state),
    t.cloneNode(subscribeNode, true),
    t.cloneNode(getSnapshotNode, true),
  ];

  if (getServerSnapshotNode) {
    args.push(t.cloneNode(getServerSnapshotNode, true));
  }

  return t.callExpression(t.identifier("useExternalStore"), args);
}

function parseDependencies(argPath) {
  if (!argPath) return { ok: true, deps: null };
  const arg = argPath.node;
  if (!t.isArrayExpression(arg)) return { ok: false };

  const deps = [];
  for (const element of arg.elements) {
    if (!element) return { ok: false };
    if (t.isSpreadElement(element)) return { ok: false };
    deps.push(t.cloneNode(element, true));
  }

  return { ok: true, deps };
}

function transformCustomHookDefinition(binding, state) {
  const fnPath = getFunctionFromBinding(binding);
  if (!fnPath) return;

  if (!state.processedCustomHooks) {
    state.processedCustomHooks = new WeakSet();
  }

  if (state.processedCustomHooks.has(fnPath.node)) {
    return;
  }

  const hostId = ensureHostParamIdentifier(fnPath, state);
  state.processedCustomHooks.add(fnPath.node);

  pushHostExpression(state, hostId);

  fnPath.traverse({
    CallExpression(innerPath) {
      processHookCall(innerPath, state);
    },
  });

  popHostExpression(state);
}

function processHookCall(callPath, state) {
  if (callPath.node.__litsxCompatUseContext) {
    const args = callPath.get("arguments");
    const hostStack = state.hostExpressions || [];
    const hostExprNode = hostStack.length > 0 ? hostStack[hostStack.length - 1] : null;
    const firstArg = args[0];
    const hasHostArg =
      Boolean(hostExprNode) &&
      firstArg &&
      t.isNodesEquivalent(firstArg.node, hostExprNode);

    if (!hostExprNode) {
      return false;
    }

    if (!hasHostArg) {
      callPath.unshiftContainer("arguments", cloneHostExpression(state));
    }

    state.runtimeNeeded = true;
    return !hasHostArg;
  }

  const callee = callPath.get("callee");
  const args = callPath.get("arguments");

  let hookType = null;
  let callKind = null;
  let customBinding = null;
  let customNamespace = null;

  if (callee.isIdentifier()) {
    const localName = callee.node.name;
    const binding = callPath.scope.getBinding(localName);
    const isCompatUseContext =
      state.compatHookIdentifiers.has(localName) ||
      isCompatUseContextBinding(binding);

    if (isCompatUseContext) {
      hookType = localName;
      callKind = "compat";
    } else {
      const importedHook = state.hookIdentifiers.get(localName);
      if (importedHook) {
        hookType = importedHook;
        callKind = "builtin";
      } else if (!binding) {
        // no-op
      } else if (
        state.customHookLocals.has(localName) &&
        (binding.path.isImportSpecifier() || binding.path.isImportDefaultSpecifier())
      ) {
        callKind = "custom";
        customBinding = binding;
      } else if (
        isCustomHookName(localName) &&
        isSupportedCustomHookBinding(binding.path)
      ) {
        callKind = "custom";
        customBinding = binding;
      }
    }
  } else if (callee.isMemberExpression({ computed: false })) {
    const property = callee.get("property");
    const object = callee.get("object");
    if (
      property.isIdentifier({ name: "useContext" }) &&
      object.isIdentifier() &&
      state.reactNamespaceBindings.has(object.node.name)
    ) {
      hookType = property.node.name;
      callKind = "compat";
    } else if (
      property.isIdentifier() &&
      SUPPORTED_HOOKS.has(property.node.name) &&
      object.isIdentifier() &&
      state.reactNamespaceBindings.has(object.node.name)
    ) {
      hookType = property.node.name;
      callKind = "builtin";
    } else if (
      property.isIdentifier() &&
      isCustomHookName(property.node.name) &&
      object.isIdentifier() &&
      state.customHookNamespaces.has(object.node.name)
    ) {
      callKind = "custom";
      customBinding = callPath.scope.getBinding(object.node.name);
      customNamespace = object;
    }
  }

  if (!callKind) {
    return false;
  }

  const hostStack = state.hostExpressions || [];
  const hostExprNode = hostStack.length > 0 ? hostStack[hostStack.length - 1] : null;
  const firstArg = args[0];
  const hasHostArg =
    Boolean(hostExprNode) &&
    firstArg &&
    t.isNodesEquivalent(firstArg.node, hostExprNode);

  if (callKind === "custom") {
    if (!hostExprNode) {
      return false;
    }
    if (!hasHostArg) {
      callPath.unshiftContainer("arguments", cloneHostExpression(state));
    }
    state.runtimeNeeded = true;
    if (customBinding && customBinding.path && !customNamespace) {
      transformCustomHookDefinition(customBinding, state);
    }
    return !hasHostArg;
  }

  if (callKind === "compat") {
    if (!hostExprNode) {
      return false;
    }
    if (!hasHostArg) {
      callPath.unshiftContainer("arguments", cloneHostExpression(state));
    }
    state.runtimeNeeded = true;
    return !hasHostArg;
  }

  const isRuntimeCall = hasHostArg;

  switch (hookType) {
    case "useEffect":
    case "useLayoutEffect": {
      if (isRuntimeCall) return false;
      if (args.length === 0) return false;
      const depsResult = parseDependencies(args[1]);
      if (!depsResult.ok) return false;

      const parent = callPath.parentPath;
      if (!parent.isExpressionStatement()) return false;

      state.runtimeNeeded = true;
      if (hookType === "useLayoutEffect") {
        state.layoutNeeded = true;
      } else {
        state.effectNeeded = true;
      }

      const runtimeCall = createRuntimeCall(
        state,
        hookType,
        args[0].node,
        depsResult.deps
      );

      parent.replaceWith(t.expressionStatement(runtimeCall));
      if (callee.isIdentifier()) {
        state.hookLocals.add(callee.node.name);
      }
      return true;
    }
    case "useMemo": {
      if (isRuntimeCall) return false;
      if (args.length === 0) return false;
      const depsResult = parseDependencies(args[1]);
      if (!depsResult.ok) return false;

      const runtimeCall = createMemoRuntimeCall(
        state,
        args[0].node,
        depsResult.deps
      );

      callPath.replaceWith(runtimeCall);
      callPath.skip();
      state.runtimeNeeded = true;
      state.memoNeeded = true;
      if (callee.isIdentifier()) {
        state.hookLocals.add(callee.node.name);
      }
      return true;
    }
    case "useCallback": {
      if (isRuntimeCall) return false;
      if (args.length === 0) return false;
      const depsResult = parseDependencies(args[1]);
      if (!depsResult.ok) return false;

      const runtimeCall = createCallbackRuntimeCall(
        state,
        args[0].node,
        depsResult.deps
      );

      callPath.replaceWith(runtimeCall);
      callPath.skip();
      state.runtimeNeeded = true;
      state.callbackNeeded = true;
      if (callee.isIdentifier()) {
        state.hookLocals.add(callee.node.name);
      }
      return true;
    }
    case "useReducer": {
      if (isRuntimeCall) return false;
      if (args.length === 0) return false;

      const runtimeCall = createReducerRuntimeCall(
        state,
        args.map((arg) => arg.node)
      );

      callPath.replaceWith(runtimeCall);
      callPath.skip();
      state.runtimeNeeded = true;
      state.reducerNeeded = true;
      if (callee.isIdentifier()) {
        state.hookLocals.add(callee.node.name);
      }
      return true;
    }
    case "useId": {
      if (isRuntimeCall) return false;
      callPath.replaceWith(
        t.callExpression(t.identifier("useId"), [cloneHostExpression(state)])
      );
      callPath.skip();
      state.runtimeNeeded = true;
      state.idNeeded = true;
      if (callee.isIdentifier()) {
        state.hookLocals.add(callee.node.name);
      }
      return true;
    }
    case "useImperativeHandle": {
      if (isRuntimeCall) return false;
      if (args.length < 2) return false;
      const depsResult = parseDependencies(args[2]);
      if (!depsResult.ok) return false;

      const parent = callPath.parentPath;
      if (!parent.isExpressionStatement()) return false;

      const runtimeCall = createImperativeRuntimeCall(
        state,
        args[0].node,
        args[1].node,
        depsResult.deps
      );

      parent.replaceWith(t.expressionStatement(runtimeCall));
      state.runtimeNeeded = true;
      state.imperativeNeeded = true;
      if (callee.isIdentifier()) {
        state.hookLocals.add(callee.node.name);
      }
      return true;
    }
    case "useSyncExternalStore": {
      if (isRuntimeCall) return false;
      if (args.length < 2) return false;

      const runtimeCall = createExternalStoreRuntimeCall(
        state,
        args[0].node,
        args[1].node,
        args[2] ? args[2].node : null
      );

      callPath.replaceWith(runtimeCall);
      callPath.skip();
      state.runtimeNeeded = true;
      state.externalStoreNeeded = true;
      if (callee.isIdentifier()) {
        state.hookLocals.add(callee.node.name);
      }
      return true;
    }
    case "useOptimistic": {
      if (isRuntimeCall) return false;
      if (args.length === 0) return false;
      const callArgs = [cloneHostExpression(state)];
      if (args[0]) {
        callArgs.push(t.cloneNode(args[0].node, true));
      }
      if (args[1]) {
        callArgs.push(t.cloneNode(args[1].node, true));
      }
      callPath.replaceWith(
        t.callExpression(t.identifier("useOptimistic"), callArgs)
      );
      callPath.skip();
      state.runtimeNeeded = true;
      state.optimisticNeeded = true;
      if (callee.isIdentifier()) {
        state.hookLocals.add(callee.node.name);
      }
      return true;
    }
    case "useTransition": {
      if (isRuntimeCall) return false;
      const runtimeCall = t.callExpression(t.identifier("useTransition"), [
        cloneHostExpression(state),
      ]);
      callPath.replaceWith(runtimeCall);
      callPath.skip();
      state.runtimeNeeded = true;
      state.transitionNeeded = true;
      if (callee.isIdentifier()) {
        state.hookLocals.add(callee.node.name);
      }
      return true;
    }
    case "useDeferredValue": {
      if (isRuntimeCall) return false;
      const callArgs = [cloneHostExpression(state)];
      if (args[0]) {
        callArgs.push(args[0].node);
      }
      if (args[1]) {
        callArgs.push(args[1].node);
      }
      callPath.replaceWith(
        t.callExpression(t.identifier("useDeferredValue"), callArgs)
      );
      callPath.skip();
      state.runtimeNeeded = true;
      state.deferredNeeded = true;
      if (callee.isIdentifier()) {
        state.hookLocals.add(callee.node.name);
      }
      return true;
    }
    case "startTransition": {
      if (isRuntimeCall) return false;
      if (args.length === 0) return false;
      callPath.replaceWith(
        t.callExpression(t.identifier("startTransition"), [
          cloneHostExpression(state),
          ...args.map((arg) => t.cloneNode(arg.node, true)),
        ])
      );
      callPath.skip();
      state.runtimeNeeded = true;
      state.startTransitionNeeded = true;
      if (callee.isIdentifier()) {
        state.hookLocals.add(callee.node.name);
      }
      return true;
    }
    default:
      break;
  }

  return false;
}

function processDeclaredCustomHooks(programPath, state) {
  const bindings = programPath.scope.getAllBindings();
  for (const name of Object.keys(bindings)) {
    if (!isCustomHookName(name)) continue;
    const binding = bindings[name];
    if (!binding || !isSupportedCustomHookBinding(binding.path)) continue;
    transformCustomHookDefinition(binding, state);
  }
}

function removeHookImports(programPath, state) {
  if (!state.hookIdentifiers || state.hookIdentifiers.size === 0) return;

  programPath.scope.crawl();

  programPath.get("body").forEach((child) => {
    if (!child.isImportDeclaration()) return;
    if (child.node.source.value !== "react") return;

    let removed = false;

    child.get("specifiers").forEach((specifierPath) => {
      if (!specifierPath.isImportSpecifier()) return;

      const localName = specifierPath.node.local.name;
      if (!state.hookIdentifiers.has(localName)) return;

      const binding = programPath.scope.getBinding(localName);
      const wasTransformed = state.hookLocals && state.hookLocals.has(localName);
      const isUnused = !binding || binding.references === 0;

      if (wasTransformed || isUnused) {
        specifierPath.remove();
        removed = true;
      }
    });

    if (removed && child.node.specifiers.length === 0) {
      child.remove();
    }
  });
}

function ensureRuntimeImport(programPath, state) {
  if (!state.runtimeNeeded) return;

  let existingImport = null;
  programPath.get("body").forEach((child) => {
    if (!child.isImportDeclaration()) return;
    if (child.node.source.value !== RUNTIME_MODULE) return;
    existingImport = child;
  });

  const requiredSpecifiers = new Map();
  requiredSpecifiers.set("prepareEffects", true);
  if (state.effectNeeded) {
    requiredSpecifiers.set("useAfterUpdate", true);
  }
  if (state.layoutNeeded) {
    requiredSpecifiers.set("useOnCommit", true);
  }
  if (state.memoNeeded) {
    requiredSpecifiers.set("useMemoValue", true);
  }
  if (state.callbackNeeded) {
    requiredSpecifiers.set("useStableCallback", true);
  }
  if (state.reducerNeeded) {
    requiredSpecifiers.set("useReducedState", true);
  }
  if (state.idNeeded) {
    requiredSpecifiers.set("useId", true);
  }
  if (state.imperativeNeeded) {
    requiredSpecifiers.set("useExpose", true);
  }
  if (state.externalStoreNeeded) {
    requiredSpecifiers.set("useExternalStore", true);
  }
  if (state.optimisticNeeded) {
    requiredSpecifiers.set("useOptimistic", true);
  }
  if (state.transitionNeeded) {
    requiredSpecifiers.set("useTransition", true);
  }
  if (state.deferredNeeded) {
    requiredSpecifiers.set("useDeferredValue", true);
  }
  if (state.startTransitionNeeded) {
    requiredSpecifiers.set("startTransition", true);
  }

  if (existingImport) {
    const present = new Set(
      existingImport.node.specifiers
        .filter((spec) => t.isImportSpecifier(spec) && t.isIdentifier(spec.imported))
        .map((spec) => spec.imported.name)
    );

    requiredSpecifiers.forEach((_, name) => {
      if (!present.has(name)) {
        existingImport.node.specifiers.push(
          t.importSpecifier(t.identifier(name), t.identifier(name))
        );
      }
    });
  } else {
    const specifiers = [];
    requiredSpecifiers.forEach((_, name) => {
      specifiers.push(
        t.importSpecifier(t.identifier(name), t.identifier(name))
      );
    });

    const newImport = t.importDeclaration(specifiers, t.stringLiteral(RUNTIME_MODULE));
    const firstImport = programPath
      .get("body")
      .find((child) => child.isImportDeclaration());

    if (firstImport) {
      firstImport.insertBefore(newImport);
    } else {
      programPath.unshiftContainer("body", newImport);
    }
  }
}

export default declare((api) => {
  api.assertVersion(7);
  t = api.types;

  return {
    name: "transform-react-hooks",
    visitor: {
      Program: {
        enter(path, state) {
          state.hookIdentifiers = new Map();
          state.compatHookIdentifiers = new Set();
          state.hookLocals = new Set();
          state.reactNamespaceBindings = new Set();
          state.hostExpressions = [];
          state.processedCustomHooks = new WeakSet();
          state.customHookHostParams = new WeakMap();
          state.customHookLocals = new Set();
          state.customHookNamespaces = new Set();
          state.runtimeNeeded = false;
          state.effectNeeded = false;
          state.layoutNeeded = false;
          state.memoNeeded = false;
          state.callbackNeeded = false;
          state.reducerNeeded = false;
          state.idNeeded = false;
          state.imperativeNeeded = false;
          state.externalStoreNeeded = false;
          state.optimisticNeeded = false;
          state.transitionNeeded = false;
          state.deferredNeeded = false;
          state.startTransitionNeeded = false;
        },
        exit(path, state) {
          processDeclaredCustomHooks(path, state);
          removeHookImports(path, state);
          ensureRuntimeImport(path, state);
        },
      },
      ImportDeclaration(path, state) {
        const source = path.node.source.value;

        if (source === "react") {
          path.node.specifiers.forEach((specifier) => {
            if (t.isImportSpecifier(specifier)) {
              const imported = specifier.imported.name;
              if (!SUPPORTED_HOOKS.has(imported)) return;
              state.hookIdentifiers.set(specifier.local.name, imported);
              return;
            }

            if (
              t.isImportDefaultSpecifier(specifier) ||
              t.isImportNamespaceSpecifier(specifier)
            ) {
              state.reactNamespaceBindings.add(specifier.local.name);
            }
          });
          return;
        }

        if (source === REACT_COMPAT_RUNTIME_MODULE) {
          path.node.specifiers.forEach((specifier) => {
            if (!t.isImportSpecifier(specifier)) return;
            const imported = specifier.imported.name;
            if (!REACT_COMPAT_SUPPORTED_HOOKS.has(imported)) return;
            state.compatHookIdentifiers.add(specifier.local.name);
          });
          return;
        }

        if (IGNORED_CUSTOM_HOOK_SOURCES.has(source)) {
          return;
        }

        path.node.specifiers.forEach((specifier) => {
          if (
            (t.isImportSpecifier(specifier) || t.isImportDefaultSpecifier(specifier)) &&
            isCustomHookName(specifier.local.name)
          ) {
            state.customHookLocals.add(specifier.local.name);
          } else if (t.isImportNamespaceSpecifier(specifier)) {
            state.customHookNamespaces.add(specifier.local.name);
          }
        });
      },
      ClassDeclaration(path, state) {
        transformClass(path, state);
      },
      ClassExpression(path, state) {
        transformClass(path, state);
      },
    },
  };
});

function transformClass(classPath, state) {
  const classBodyPaths = classPath.get("body.body");
  const renderMethodPath = classBodyPaths.find(
    (bodyPath) =>
      bodyPath.isClassMethod({ kind: "method" }) &&
      t.isIdentifier(bodyPath.node.key, { name: "render" })
  );

  if (!renderMethodPath) return;

  let transformed = false;

  pushHostExpression(state, t.thisExpression());

  renderMethodPath.traverse({
    CallExpression(callPath) {
      if (processHookCall(callPath, state)) {
        transformed = true;
      }
    },
  });

  popHostExpression(state);

  if (!transformed) return;

  ensurePrepareCall(renderMethodPath);
}
