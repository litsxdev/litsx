import { declare } from "@babel/helper-plugin-utils";
import { ensureHooksRenderWrapper } from "@litsx/babel-plugin-shared-hooks";
let t;

const RUNTIME_MODULE = "@litsx/core";

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
const REACT_COMPAT_RUNTIME_MODULE = "@litsx/core/context";
const REACT_COMPAT_SUPPORTED_HOOKS = new Set(["useContext"]);

const IGNORED_CUSTOM_HOOK_SOURCES = new Set(["react", "@litsx/core"]);

export function isCustomHookName(name) {
  return typeof name === "string" && /^use[A-Z0-9]/.test(name);
}

export function isSupportedCustomHookBinding(bindingPath) {
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

export function pushHostExpression(state, expression) {
  if (!state.hostExpressions) {
    state.hostExpressions = [];
  }
  state.hostExpressions.push(expression);
}

export function popHostExpression(state) {
  if (!state.hostExpressions) return;
  state.hostExpressions.pop();
}

export function getFunctionFromBinding(binding) {
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

export function isCompatUseContextBinding(binding) {
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

export function createRuntimeCall(state, hookType, callbackNode, depNodes) {
  const calleeName = hookType === "useLayoutEffect" ? "useOnCommit" : "useAfterUpdate";
  const args = [t.cloneNode(callbackNode, true)];

  if (Array.isArray(depNodes)) {
    args.push(t.arrayExpression(depNodes.map((node) => t.cloneNode(node, true))));
  }

  return t.callExpression(t.identifier(calleeName), args);
}

export function createMemoRuntimeCall(state, factoryNode, depNodes) {
  const args = [t.cloneNode(factoryNode, true)];
  if (Array.isArray(depNodes)) {
    args.push(t.arrayExpression(depNodes.map((node) => t.cloneNode(node, true))));
  }
  return t.callExpression(t.identifier("useMemoValue"), args);
}

export function createCallbackRuntimeCall(state, callbackNode, depNodes) {
  const args = [t.cloneNode(callbackNode, true)];
  if (Array.isArray(depNodes)) {
    args.push(t.arrayExpression(depNodes.map((node) => t.cloneNode(node, true))));
  }
  return t.callExpression(t.identifier("useStableCallback"), args);
}

export function createReducerRuntimeCall(state, argNodes) {
  const args = [];

  if (Array.isArray(argNodes)) {
    argNodes.forEach((node) => {
      if (typeof node !== "undefined") {
        args.push(t.cloneNode(node, true));
      }
    });
  }

  return t.callExpression(t.identifier("useReducedState"), args);
}

export function createImperativeRuntimeCall(state, _refNode, factoryNode, depNodes) {
  const args = [
    t.callExpression(
      t.identifier(state.reactRefAdapterLocal || "toLitRef"),
      [t.cloneNode(_refNode, true)],
    ),
    t.cloneNode(factoryNode, true),
  ];

  if (Array.isArray(depNodes)) {
    args.push(t.arrayExpression(depNodes.map((node) => t.cloneNode(node, true))));
  }

  return t.callExpression(t.identifier("useExpose"), args);
}

export function ensureReactRefAdapterImport(programPath, state) {
  if (!state.imperativeNeeded) return;
  const moduleName = "@litsx/core/react-compat";
  const existing = programPath.get("body").find(
    (child) => child.isImportDeclaration() && child.node.source.value === moduleName
  );
  const present = existing?.node.specifiers.some(
    (specifier) => t.isImportSpecifier(specifier) &&
      t.isIdentifier(specifier.imported, { name: "toLitRef" }) &&
      t.isIdentifier(specifier.local, { name: state.reactRefAdapterLocal })
  );
  if (present) return;
  const specifier = t.importSpecifier(
    t.identifier(state.reactRefAdapterLocal),
    t.identifier("toLitRef"),
  );
  if (existing) existing.node.specifiers.push(specifier);
  else programPath.unshiftContainer(
    "body",
    t.importDeclaration([specifier], t.stringLiteral(moduleName)),
  );
}

export function createExternalStoreRuntimeCall(state, subscribeNode, getSnapshotNode, getServerSnapshotNode) {
  const args = [
    t.cloneNode(subscribeNode, true),
    t.cloneNode(getSnapshotNode, true),
  ];

  if (getServerSnapshotNode) {
    args.push(t.cloneNode(getServerSnapshotNode, true));
  }

  return t.callExpression(t.identifier("useExternalStore"), args);
}

export function parseDependencies(argPath) {
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

  state.processedCustomHooks.add(fnPath.node);
  if (binding.identifier?.name) {
    state.compiledCustomHookNames.add(binding.identifier.name);
  }

  pushHostExpression(state, t.booleanLiteral(true));

  fnPath.traverse({
    CallExpression(innerPath) {
      processHookCall(innerPath, state);
    },
  });

  popHostExpression(state);
}

export function attachCompiledCustomHookMetadata(programPath, state) {
  for (const hookName of state.compiledCustomHookNames || []) {
    const binding = programPath.scope.getBinding(hookName);
    if (!binding?.path?.node) continue;
    let alreadyMarked = false;
    for (const statement of programPath.node.body) {
      const expression = statement?.type === "ExpressionStatement" ? statement.expression : null;
      const left = expression?.type === "AssignmentExpression" ? expression.left : null;
      if (
        left?.type === "MemberExpression" &&
        left.computed === true &&
        left.object?.type === "Identifier" &&
        left.object.name === hookName &&
        left.property?.type === "CallExpression" &&
        left.property.callee?.type === "MemberExpression" &&
        left.property.callee.object?.type === "Identifier" &&
        left.property.callee.object.name === "Symbol" &&
        left.property.callee.property?.type === "Identifier" &&
        left.property.callee.property.name === "for" &&
        left.property.arguments?.[0]?.type === "StringLiteral" &&
        left.property.arguments[0].value === "litsx.hook"
      ) {
        alreadyMarked = true;
        break;
      }
    }
    if (alreadyMarked) continue;

    const statement = t.expressionStatement(
      t.assignmentExpression(
        "=",
        t.memberExpression(
          t.identifier(hookName),
          t.callExpression(
            t.memberExpression(t.identifier("Symbol"), t.identifier("for")),
            [t.stringLiteral("litsx.hook")],
          ),
          true,
        ),
        t.booleanLiteral(true),
      ),
    );
    if (binding.path.isFunctionDeclaration()) {
      binding.path.insertAfter(statement);
    } else if (binding.path.isVariableDeclarator()) {
      binding.path.getStatementParent()?.insertAfter(statement);
    }
  }
}

function processHookCall(callPath, state) {
  if (callPath.node.__litsxCompatUseContext) {
    const hostStack = state.hostExpressions || [];
    if (hostStack.length === 0) {
      return false;
    }

    state.runtimeNeeded = true;
    return true;
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
  if (callKind === "custom") {
    if (!hostExprNode) {
      return false;
    }
    state.runtimeNeeded = true;
    if (customBinding && customBinding.path && !customNamespace) {
      transformCustomHookDefinition(customBinding, state);
    }
    return true;
  }

  if (callKind === "compat") {
    if (!hostExprNode) {
      return false;
    }
    state.runtimeNeeded = true;
    return true;
  }

  const isRuntimeCall = false;

  switch (hookType) {
    case "useEffect":
    case "useLayoutEffect": {
      if (isRuntimeCall) return false;
      if (args.length === 0) return false;
      const depsResult = parseDependencies(args[1]);
      if (!depsResult.ok) return false;

      let expressionPath = callPath;
      while (expressionPath.parentPath?.isSequenceExpression()) {
        expressionPath = expressionPath.parentPath;
      }
      if (!expressionPath.parentPath?.isExpressionStatement()) return false;

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

      callPath.replaceWith(runtimeCall);
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
        t.callExpression(t.identifier("useId"), [])
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
      const callArgs = [];
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
      const callArgs = [];
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

export function removeHookImports(programPath, state) {
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

export function ensureRuntimeImport(programPath, state) {
  if (!state.runtimeNeeded) return;

  let existingImport = null;
  programPath.get("body").forEach((child) => {
    if (!child.isImportDeclaration()) return;
    if (child.node.source.value !== RUNTIME_MODULE) return;
    existingImport = child;
  });

  const requiredSpecifiers = new Map();
  if (state.renderBoundaryNeeded) {
    requiredSpecifiers.set("renderWithHooks", true);
  }
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

export default declare((api, options = {}) => {
  api.assertVersion("^8.0.0");
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
          state.customHookLocals = new Set();
          state.customHookNamespaces = new Set();
          state.compiledCustomHookNames = new Set();
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
          state.renderBoundaryNeeded = false;
          state.reactRefAdapterLocal = path.scope.hasBinding("toLitRef")
            ? path.scope.generateUidIdentifier("toLitRef").name
            : "toLitRef";
        },
        exit(path, state) {
          processDeclaredCustomHooks(path, state);
          attachCompiledCustomHookMetadata(path, state);
          removeHookImports(path, state);
          ensureRuntimeImport(path, state);
          ensureReactRefAdapterImport(path, state);
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

        if (
          IGNORED_CUSTOM_HOOK_SOURCES.has(source) ||
          options.transformImportedCustomHooks === false
        ) {
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

export function transformClass(classPath, state) {
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
  ensureHooksRenderWrapper(renderMethodPath, t);
  state.renderBoundaryNeeded = true;
}
