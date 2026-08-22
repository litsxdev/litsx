import {
  ensurePrepareEffectsCall,
  ensureSoftSuspenseRenderWrapper,
} from "./prepare-effects.js";
import { ensureRuntimeNamedImports } from "./runtime-imports.js";

const HOST_PARAM_PATTERN = /^_?host/;
const BLOCKED_CUSTOM_HOOK_SOURCES = new Set(["react"]);

function isCustomHookName(name) {
  return typeof name === "string" && /^use[A-Z0-9]/.test(name);
}

function cloneForClassEntry(node, t) {
  return t.cloneNode(node, true);
}

function createStructuralHookExpression(entry, t) {
  if (entry?.type === "spread") {
    return t.spreadElement(t.cloneNode(entry.argument, true));
  }
  return cloneForClassEntry(entry.definition, t);
}

function createRuntimeMetadataSymbolExpression(t, symbolKey) {
  return t.callExpression(
    t.memberExpression(t.identifier("Symbol"), t.identifier("for")),
    [t.stringLiteral(symbolKey)],
  );
}

function isRuntimeMetadataSymbolFor(node, t, symbolKey) {
  return (
    t.isCallExpression(node) &&
    t.isMemberExpression(node.callee) &&
    !node.callee.computed &&
    t.isIdentifier(node.callee.object, { name: "Symbol" }) &&
    t.isIdentifier(node.callee.property, { name: "for" }) &&
    node.arguments.length === 1 &&
    t.isStringLiteral(node.arguments[0], { value: symbolKey })
  );
}

function addStructuralHookToCurrentPlan(state, entry) {
  if (state.activeStructuralHooks) {
    state.activeStructuralHooks.push(entry);
  }
  if (state.activeCustomHookBinding?.identifier?.name) {
    const deps =
      state.structuralCustomHookDependencies.get(
        state.activeCustomHookBinding.identifier.name,
      ) || [];
    deps.push(entry);
    state.structuralCustomHookDependencies.set(
      state.activeCustomHookBinding.identifier.name,
      deps,
    );
  }
  if (state.activeStructuralDefinitionName) {
    const deps =
      state.structuralHookDependencies.get(
        state.activeStructuralDefinitionName,
      ) || [];
    deps.push(entry);
    state.structuralHookDependencies.set(
      state.activeStructuralDefinitionName,
      deps,
    );
  }
}

function getImportedStructuralCustomHookDependencyArgument(
  calleePath,
  state,
  t,
) {
  if (calleePath.isIdentifier()) {
    const binding = calleePath.scope.getBinding(calleePath.node.name);
    if (!binding?.path?.isImportSpecifier()) {
      return null;
    }
    return isStructuralCustomHookCall(calleePath, state)
      ? t.identifier(calleePath.node.name)
      : null;
  }

  if (calleePath.isMemberExpression({ computed: false })) {
    return isStructuralCustomHookCall(calleePath, state)
      ? t.cloneNode(calleePath.node, true)
      : null;
  }

  return null;
}

function addCustomHookStructuralDependenciesToCurrentPlan(
  calleePath,
  state,
  t,
) {
  if (calleePath.isIdentifier()) {
    const localDeps = state.structuralCustomHookDependencies.get(
      calleePath.node.name,
    );
    if (localDeps?.length) {
      for (const dependency of localDeps) {
        addStructuralHookToCurrentPlan(state, dependency);
      }
      return;
    }
  }

  const importedDependencyArg =
    getImportedStructuralCustomHookDependencyArgument(calleePath, state, t);
  if (!importedDependencyArg) {
    return;
  }

  addStructuralHookToCurrentPlan(state, {
    type: "spread",
    argument: t.logicalExpression(
      "||",
      t.memberExpression(
        importedDependencyArg,
        createRuntimeMetadataSymbolExpression(t, "litsx.structuralHooks"),
        true,
      ),
      t.arrayExpression([]),
    ),
  });
}

function createDefineStructuralHookEntriesStatement(
  hookName,
  entries,
  t,
  includeSelf = false,
) {
  return t.expressionStatement(
    t.assignmentExpression(
      "=",
      t.memberExpression(
        t.identifier(hookName),
        createRuntimeMetadataSymbolExpression(t, "litsx.structuralHooks"),
        true,
      ),
      t.arrayExpression([
        ...(includeSelf ? [t.identifier(hookName)] : []),
        ...entries.map((entry) => createStructuralHookExpression(entry, t)),
      ]),
    ),
  );
}

function createMarkLitsxHookStatement(hookName, t) {
  return t.expressionStatement(
    t.assignmentExpression(
      "=",
      t.memberExpression(
        t.identifier(hookName),
        createRuntimeMetadataSymbolExpression(t, "litsx.hook"),
        true,
      ),
      t.booleanLiteral(true),
    ),
  );
}

function isHookMarkerAssignmentStatement(statementPath, hookName, state, t) {
  if (!statementPath?.isExpressionStatement()) {
    return false;
  }

  const expression = statementPath.node.expression;
  if (!t.isAssignmentExpression(expression, { operator: "=" })) {
    return false;
  }
  if (
    !t.isMemberExpression(expression.left, { computed: true }) ||
    !t.isIdentifier(expression.left.object, { name: hookName }) ||
    !isRuntimeMetadataSymbolFor(expression.left.property, t, "litsx.hook")
  ) {
    return false;
  }

  return t.isBooleanLiteral(expression.right, { value: true });
}

function isCompiledCustomHookBinding(binding, state, t) {
  if (!binding?.identifier?.name) {
    return false;
  }

  const hookName = binding.identifier.name;
  const statementPath = binding.path.getStatementParent?.();
  if (!statementPath?.parentPath?.isProgram?.()) {
    return false;
  }

  const bodyPaths = statementPath.parentPath.get("body");
  const statementIndex = statementPath.key;
  for (let index = statementIndex + 1; index < bodyPaths.length; index += 1) {
    const siblingPath = bodyPaths[index];
    if (isHookMarkerAssignmentStatement(siblingPath, hookName, state, t)) {
      return true;
    }
    if (
      siblingPath.isFunctionDeclaration() ||
      siblingPath.isVariableDeclaration() ||
      siblingPath.isClassDeclaration() ||
      siblingPath.isExportNamedDeclaration() ||
      siblingPath.isExportDefaultDeclaration()
    ) {
      break;
    }
  }

  return false;
}

function isCompiledLitsxComponentClass(classPath, state, t) {
  if (classPath.node?.__litsxGeneratedComponent === true) {
    return false;
  }
  const bodyPaths = classPath.get("body.body");
  return bodyPaths.some((memberPath) => {
    if (!memberPath.isClassProperty()) {
      return false;
    }
    const keyPath = memberPath.get("key");
    const valuePath = memberPath.get("value");
    return (
      memberPath.node.static === true &&
      memberPath.node.computed === true &&
      isRuntimeMetadataSymbolFor(keyPath.node, t, "litsx.component") &&
      valuePath.isBooleanLiteral({ value: true })
    );
  });
}

function attachStructuralCustomHookMetadata(programPath, state, t) {
  for (const [hookName, entries] of state.structuralCustomHookDependencies) {
    if (!entries || entries.length === 0) {
      continue;
    }
    const binding = programPath.scope.getBinding(hookName);
    if (!binding?.path?.node) {
      continue;
    }
    const statement = createDefineStructuralHookEntriesStatement(
      hookName,
      entries,
      t,
    );
    if (binding.path.isFunctionDeclaration()) {
      binding.path.insertAfter(statement);
    } else if (binding.path.isVariableDeclarator()) {
      const statementPath = binding.path.getStatementParent();
      statementPath?.insertAfter(statement);
    }
  }
}

function attachStructuralHookMetadata(programPath, state, t) {
  for (const [hookName, entries] of state.structuralHookDependencies) {
    if (!entries || entries.length === 0) {
      continue;
    }
    const binding = programPath.scope.getBinding(hookName);
    if (!binding?.path?.isVariableDeclarator()) {
      continue;
    }
    const statement = createDefineStructuralHookEntriesStatement(
      hookName,
      entries,
      t,
      true,
    );
    const statementPath = binding.path.getStatementParent();
    statementPath?.insertAfter(statement);
  }
}

function attachCompiledCustomHookMetadata(programPath, state, t) {
  for (const hookName of state.compiledCustomHookNames || []) {
    const binding = programPath.scope.getBinding(hookName);
    if (!binding?.path?.node) {
      continue;
    }
    const statement = createMarkLitsxHookStatement(hookName, t);
    if (binding.path.isFunctionDeclaration()) {
      binding.path.insertAfter(statement);
    } else if (binding.path.isVariableDeclarator()) {
      const statementPath = binding.path.getStatementParent();
      statementPath?.insertAfter(statement);
    }
  }
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
    return null;
  }
  return stack[stack.length - 1];
}

function cloneHostExpression(state, t) {
  const expr = getHostExpression(state);
  if (!expr) return null;
  return t.cloneNode(expr, true);
}

function isSupportedCustomHookBinding(bindingPath) {
  if (!bindingPath) return false;
  if (
    bindingPath.isFunctionDeclaration() ||
    bindingPath.isFunctionExpression() ||
    bindingPath.isArrowFunctionExpression()
  ) {
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

function ensureHostParamIdentifier(fnPath, state, t) {
  if (!state.customHookHostParams) {
    state.customHookHostParams = new WeakMap();
  }

  let hostId = state.customHookHostParams.get(fnPath.node);
  if (hostId) return hostId;

  const [firstParam] = fnPath.node.params;
  if (t.isIdentifier(firstParam) && HOST_PARAM_PATTERN.test(firstParam.name)) {
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

function detectRuntimeHelperFromCallee(calleePath, state, t) {
  if (calleePath.isIdentifier()) {
    const helperName = state.hookIdentifiers.get(calleePath.node.name);
    return helperName === undefined ? null : helperName;
  }

  if (calleePath.isMemberExpression({ computed: false })) {
    const object = calleePath.get("object");
    const property = calleePath.get("property");
    if (!property.isIdentifier()) {
      return null;
    }

    if (object.isIdentifier()) {
      if (
        state.runtimeNamespaceBindings.has(object.node.name) ||
        state.runtimeDefaultBindings.has(object.node.name)
      ) {
        if (state.isHelperName(property.node.name)) {
          return property.node.name;
        }
      }
    }
  }

  return null;
}

function isCustomHookCall(calleePath, state, t) {
  if (calleePath.isIdentifier()) {
    const name = calleePath.node.name;
    if (state.hookIdentifiers.has(name)) {
      return false;
    }
    return isCustomHookName(name);
  }

  if (calleePath.isMemberExpression({ computed: false })) {
    const property = calleePath.get("property");
    if (!property.isIdentifier()) return false;
    if (!isCustomHookName(property.node.name)) return false;
    const object = calleePath.get("object");
    if (object.isIdentifier()) {
      if (
        state.runtimeNamespaceBindings.has(object.node.name) ||
        state.runtimeDefaultBindings.has(object.node.name)
      ) {
        // Runtime namespace handled elsewhere.
        return false;
      }
      return true;
    }
  }

  return false;
}

function transformCustomHookDefinition(binding, state, t) {
  if (!binding || !isSupportedCustomHookBinding(binding.path)) {
    return;
  }
  if (isCompiledCustomHookBinding(binding, state, t)) {
    return;
  }

  if (!state.processedCustomHooks) {
    state.processedCustomHooks = new WeakSet();
  }

  const fnPath = getFunctionFromBinding(binding);
  if (!fnPath) return;
  if (state.processedCustomHooks.has(fnPath.node)) {
    return;
  }

  const hostId = ensureHostParamIdentifier(fnPath, state, t);
  state.processedCustomHooks.add(fnPath.node);

  const previousStructuralHooks = state.activeStructuralHooks;
  const previousCustomHookBinding = state.activeCustomHookBinding;
  pushHostExpression(state, hostId);
  state.activeStructuralHooks = null;
  state.activeCustomHookBinding = binding;
  fnPath.traverse({
    CallExpression(innerPath) {
      processRuntimeCall(innerPath, state, t, {});
    },
  });
  state.activeCustomHookBinding = previousCustomHookBinding;
  state.activeStructuralHooks = previousStructuralHooks;
  popHostExpression(state);
  if (binding.identifier?.name) {
    state.compiledCustomHookNames.add(binding.identifier.name);
  }
}

function localCustomHookUsesHost(binding, state, t, seen = new WeakSet()) {
  if (!binding || !isSupportedCustomHookBinding(binding.path)) {
    return false;
  }
  if (state.structuralCustomHookIdentifiers?.has(binding.identifier?.name)) {
    return true;
  }
  if (isCompiledCustomHookBinding(binding, state, t)) {
    return true;
  }
  if (typeof state.customHookResolver !== "function") {
    return true;
  }
  const fnPath = getFunctionFromBinding(binding);
  if (!fnPath?.node) {
    return false;
  }
  if (seen.has(fnPath.node)) {
    return false;
  }

  seen.add(fnPath.node);
  let usesHost = false;
  fnPath.traverse({
    CallExpression(innerPath) {
      if (usesHost) {
        innerPath.stop();
        return;
      }
      const callee = innerPath.get("callee");
      if (detectRuntimeHelperFromCallee(callee, state, t)) {
        usesHost = true;
        innerPath.stop();
        return;
      }
      if (getStructuralHookCallInfo(innerPath, callee, state, t)) {
        usesHost = true;
        innerPath.stop();
        return;
      }
      if (!isCustomHookCall(callee, state, t)) {
        return;
      }
      if (callee.isIdentifier()) {
        const nestedBinding = innerPath.scope.getBinding(callee.node.name);
        if (nestedBinding?.path?.isImportSpecifier()) {
          const source = nestedBinding.path.parentPath?.node?.source?.value;
          const imported = nestedBinding.path.node.imported;
          const importedName =
            imported?.name ?? imported?.value ?? callee.node.name;
          const result = resolveImportedHostAwareCustomHook(
            state,
            source,
            importedName,
          );
          assertImportedCustomHookResolution(
            result,
            callee,
            callee.node.name,
            source,
          );
          if (result === true) {
            usesHost = true;
            innerPath.stop();
          }
          return;
        }
        if (
          nestedBinding &&
          localCustomHookUsesHost(nestedBinding, state, t, seen)
        ) {
          usesHost = true;
          innerPath.stop();
        }
        return;
      }
      if (callee.isMemberExpression({ computed: false })) {
        const object = callee.get("object");
        const property = callee.get("property");
        if (!object.isIdentifier() || !property.isIdentifier()) {
          return;
        }
        const objectBinding = object.scope.getBinding(object.node.name);
        if (objectBinding?.path?.isImportNamespaceSpecifier()) {
          const source = objectBinding.path.parentPath?.node?.source?.value;
          const result = resolveImportedHostAwareCustomHook(
            state,
            source,
            property.node.name,
          );
          assertImportedCustomHookResolution(
            result,
            property,
            property.node.name,
            source,
          );
          if (result === true) {
            usesHost = true;
            innerPath.stop();
          }
        }
      }
    },
  });
  return usesHost;
}

function processDeclaredCustomHooks(programPath, state, t) {
  const bindings = programPath.scope.getAllBindings();
  for (const name of Object.keys(bindings)) {
    if (!isCustomHookName(name)) continue;
    const binding = bindings[name];
    if (!localCustomHookUsesHost(binding, state, t)) continue;
    transformCustomHookDefinition(binding, state, t);
  }
}

function getImportSource(bindingPath) {
  if (!bindingPath) {
    return null;
  }

  const parentPath = bindingPath.parentPath;
  if (!parentPath || !parentPath.isImportDeclaration()) {
    return null;
  }

  const sourceNode = parentPath.node.source;
  return sourceNode ? sourceNode.value : null;
}

function assignHostArgument(callPath, state, t) {
  const hostExpr = cloneHostExpression(state, t);
  if (!hostExpr) {
    return false;
  }

  const firstArg = callPath.node.arguments[0];
  if (firstArg && t.isNodesEquivalent(firstArg, hostExpr)) {
    return false;
  }

  callPath.node.arguments.unshift(hostExpr);
  return true;
}

function createCallMetadata(callPath, state, t, helperName) {
  const factory = state.callMetadataByHelper?.get(helperName);
  if (typeof factory !== "function") {
    return null;
  }

  return factory(callPath, state, t);
}

function appendHelperMetadataArgument(callPath, state, t, helperName) {
  const metadata = createCallMetadata(callPath, state, t, helperName);
  if (!metadata) {
    return false;
  }

  const expectedIndex = 1;
  const existing = callPath.node.arguments[expectedIndex];
  if (existing && t.isNodesEquivalent(existing, metadata)) {
    return false;
  }

  callPath.node.arguments.splice(expectedIndex, 0, metadata);
  return true;
}

function isDefineHookCallee(calleePath, state) {
  if (calleePath.isIdentifier()) {
    return state.defineHookIdentifiers?.has(calleePath.node.name) === true;
  }

  if (calleePath.isMemberExpression({ computed: false })) {
    const object = calleePath.get("object");
    const property = calleePath.get("property");
    if (!property.isIdentifier({ name: "defineHook" })) {
      return false;
    }
    return (
      object.isIdentifier() &&
      (state.runtimeNamespaceBindings.has(object.node.name) ||
        state.runtimeDefaultBindings.has(object.node.name))
    );
  }

  return false;
}

function isStructuralHookBinding(binding, state) {
  if (!binding?.path?.isVariableDeclarator()) {
    return false;
  }
  const initPath = binding.path.get("init");
  if (!initPath?.isCallExpression()) {
    return false;
  }
  return isDefineHookCallee(initPath.get("callee"), state);
}

function getStructuralHookCallInfo(callPath, calleePath, state, t) {
  if (calleePath.isMemberExpression({ computed: false })) {
    const object = calleePath.get("object");
    const property = calleePath.get("property");
    if (!object.isIdentifier() || !property.isIdentifier()) {
      return null;
    }
    const source = state.structuralNamespaceImports?.get(object.node.name);
    if (!source) {
      return null;
    }
    if (!isImportedStructuralHook(state, source, property.node.name)) {
      return null;
    }
    return {
      label: property.node.name,
      calleePath,
      t,
      definition: t.memberExpression(
        t.identifier(object.node.name),
        t.identifier(property.node.name),
      ),
    };
  }

  if (!calleePath.isIdentifier()) {
    return null;
  }
  const name = calleePath.node.name;
  if (state.structuralHookIdentifiers?.has(name)) {
    return {
      label: name,
      calleePath,
      t,
      definition: t.identifier(name),
    };
  }
  const binding = callPath.scope.getBinding(name);
  if (!isStructuralHookBinding(binding, state)) {
    return null;
  }
  state.structuralHookIdentifiers.add(name);
  return {
    label: name,
    calleePath,
    t,
    definition: t.identifier(name),
  };
}

function isImportedStructuralHook(state, source, importedName) {
  const result = getImportedStructuralHookInfo(state, source, importedName);
  return (
    result === true ||
    result === "structural-hook" ||
    result?.kind === "structural-hook"
  );
}

function getImportedStructuralHookInfo(state, source, importedName) {
  const resolver = state.structuralHookResolver;
  return (
    typeof resolver === "function" &&
    resolver({
      source,
      importedName,
      filename: state.file?.opts?.filename || state.filename || "",
    })
  );
}

function isImportedStructuralCustomHook(state, source, importedName) {
  const resolver = state.structuralHookResolver;
  return (
    typeof resolver === "function" &&
    resolver({
      source,
      importedName,
      filename: state.file?.opts?.filename || state.filename || "",
    }) === "structural-custom-hook"
  );
}

function shouldTransformCustomHookCall(calleePath, state, t) {
  if (calleePath.isIdentifier()) {
    const binding = calleePath.scope.getBinding(calleePath.node.name);
    if (!binding?.path) {
      return true;
    }
    if (binding.path.isImportSpecifier()) {
      const source = binding.path.parentPath?.node?.source?.value;
      const imported = binding.path.node.imported;
      const importedName =
        imported?.name ?? imported?.value ?? calleePath.node.name;
      const result = resolveImportedHostAwareCustomHook(
        state,
        source,
        importedName,
      );
      assertImportedCustomHookResolution(
        result,
        calleePath,
        calleePath.node.name,
        source,
      );
      return result === true;
    }
    return localCustomHookUsesHost(binding, state, t);
  }

  if (calleePath.isMemberExpression({ computed: false })) {
    const object = calleePath.get("object");
    const property = calleePath.get("property");
    if (!object.isIdentifier() || !property.isIdentifier()) {
      return false;
    }
    const binding = object.scope.getBinding(object.node.name);
    if (binding?.path?.isImportNamespaceSpecifier()) {
      const source = binding.path.parentPath?.node?.source?.value;
      const result = resolveImportedHostAwareCustomHook(
        state,
        source,
        property.node.name,
      );
      assertImportedCustomHookResolution(
        result,
        property,
        property.node.name,
        source,
      );
      return result === true;
    }
    return true;
  }

  return false;
}

function resolveImportedHostAwareCustomHook(state, source, importedName) {
  if (isImportedStructuralCustomHook(state, source, importedName)) {
    return true;
  }
  const resolver = state.customHookResolver;
  if (typeof resolver !== "function") {
    return true;
  }
  return resolver({
    source,
    importedName,
    filename: state.file?.opts?.filename || state.filename || "",
  });
}

function assertImportedCustomHookResolution(result, path, localName, source) {
  if (result === "unsupported-external-hook") {
    throw path.buildCodeFrameError(
      `Cannot compile external hook "${localName}" from "${source}". Its implementation is not marked as LitSX-compatible and may depend on React's hook runtime. Use a LitSX adapter or a package compiled with LitSX hook metadata.`,
    );
  }
  if (result === "unresolved-custom-hook") {
    throw path.buildCodeFrameError(
      `Unable to resolve imported custom hook "${localName}" from "${source}". LitSX must resolve imported custom hooks to determine whether the active host must be passed.`,
    );
  }
}

function isStructuralHookReference(path, state) {
  if (path.isIdentifier()) {
    const name = path.node.name;
    if (state.structuralHookIdentifiers?.has(name)) {
      return true;
    }
    const binding = path.scope.getBinding(name);
    return isStructuralHookBinding(binding, state);
  }

  if (path.isMemberExpression({ computed: false })) {
    const object = path.get("object");
    const property = path.get("property");
    if (!object.isIdentifier() || !property.isIdentifier()) {
      return false;
    }
    const source = state.structuralNamespaceImports?.get(object.node.name);
    return Boolean(
      source && isImportedStructuralHook(state, source, property.node.name),
    );
  }

  return false;
}

function containsStructuralHookReference(path, state) {
  if (!path?.node) {
    return false;
  }
  if (isStructuralHookReference(path, state)) {
    return true;
  }
  let found = false;
  path.traverse({
    Identifier(innerPath) {
      if (innerPath.isBindingIdentifier()) {
        return;
      }
      if (isStructuralHookReference(innerPath, state)) {
        found = true;
        innerPath.stop();
      }
    },
    MemberExpression(innerPath) {
      if (isStructuralHookReference(innerPath, state)) {
        found = true;
        innerPath.stop();
      }
    },
  });
  return found;
}

function rejectStructuralHookAlias(path, state) {
  const initPath = path.get("init");
  if (!initPath?.node || isDefineHookCallee(initPath.get("callee"), state)) {
    return;
  }
  if (
    initPath.isCallExpression() &&
    initPath.get("callee").isIdentifier({ name: "readStructuralHook" })
  ) {
    return;
  }
  if (
    initPath.isCallExpression() &&
    containsStructuralHookReference(initPath.get("callee"), state)
  ) {
    return;
  }
  if (!containsStructuralHookReference(initPath, state)) {
    return;
  }

  const id = path.get("id");
  const aliasName = id.isIdentifier() ? id.node.name : "this binding";
  throw path.buildCodeFrameError(
    `Structural hook "${aliasName}" cannot be created through an alias. Call the hook directly so LitSX can discover its required host mixins.`,
  );
}

function rejectStructuralHookContainer(path, state) {
  if (!path.node?.loc) {
    return;
  }
  if (path.parentPath?.isCallExpression()) {
    const calleePath = path.parentPath.get("callee");
    if (isDefineHookCallee(calleePath, state)) {
      return;
    }
    if (calleePath.isIdentifier({ name: "readStructuralHook" })) {
      return;
    }
  }

  const values = path.isObjectExpression()
    ? path.get("properties").flatMap((propertyPath) => {
        if (propertyPath.isObjectProperty()) {
          return [propertyPath.get("value")];
        }
        if (propertyPath.isSpreadElement()) {
          return [propertyPath.get("argument")];
        }
        return [];
      })
    : path.isArrayExpression()
      ? path.get("elements").filter((elementPath) => elementPath?.node)
      : [];

  if (
    !values.some((valuePath) =>
      containsStructuralHookReference(valuePath, state),
    )
  ) {
    return;
  }

  throw path.buildCodeFrameError(
    "Structural hooks cannot be stored in object or array containers. Call them directly so LitSX can discover their required host mixins.",
  );
}

function rejectDynamicStructuralNamespaceAccess(path, state) {
  if (!path.isMemberExpression({ computed: true })) {
    return;
  }
  const object = path.get("object");
  if (!object.isIdentifier()) {
    return;
  }
  if (!state.structuralNamespaceImports?.has(object.node.name)) {
    return;
  }
  throw path.buildCodeFrameError(
    "Structural hooks imported through a namespace must use a static property such as hooks.useThing(). Computed access cannot provide a static host-mixin plan.",
  );
}

function isStructuralCustomHookCall(calleePath, state) {
  if (calleePath.isIdentifier()) {
    return state.structuralCustomHookIdentifiers.has(calleePath.node.name);
  }

  if (calleePath.isMemberExpression({ computed: false })) {
    const object = calleePath.get("object");
    const property = calleePath.get("property");
    if (!object.isIdentifier() || !property.isIdentifier()) {
      return false;
    }
    const source = state.structuralNamespaceImports?.get(object.node.name);
    return Boolean(
      source &&
      isImportedStructuralCustomHook(state, source, property.node.name),
    );
  }

  return false;
}

function collectStructuralHookDeclaration(path, state, t) {
  const initPath = path.get("init");
  if (!initPath?.isCallExpression()) {
    return;
  }
  const calleePath = initPath.get("callee");
  if (!isDefineHookCallee(calleePath, state)) {
    return;
  }
  validateStructuralHookDefinition(path);
  const id = path.get("id");
  if (id.isIdentifier()) {
    state.structuralHookIdentifiers.add(id.node.name);
    transformStructuralHookDefinitionUse(path, state, t, id.node.name);
  }
}

function validateStructuralHookDefinition(declaratorPath) {
  const objectPath = getStructuralDefinitionObjectPath(declaratorPath);
  if (!objectPath) {
    return;
  }

  const unsupportedKeys = [];
  let hasUse = false;
  for (const propertyPath of objectPath.get("properties")) {
    if (!propertyPath.isObjectProperty() && !propertyPath.isObjectMethod()) {
      continue;
    }
    const keyPath = propertyPath.get("key");
    const key =
      keyPath.isIdentifier() || keyPath.isStringLiteral()
        ? (keyPath.node.name ?? keyPath.node.value)
        : null;
    if (key === "use") {
      hasUse = true;
    } else if (key !== "mixin" && key != null) {
      unsupportedKeys.push(key);
    }
  }

  if (unsupportedKeys.length > 0) {
    throw objectPath.buildCodeFrameError(
      `defineHook() no longer accepts structural fields ${unsupportedKeys.join(
        ", ",
      )}. Implement host behavior in mixin and retain only { mixin, use }.`,
    );
  }
  if (!hasUse) {
    throw objectPath.buildCodeFrameError(
      "defineHook() requires a use(host, ...args) reader.",
    );
  }
}

function getStructuralDefinitionObjectPath(declaratorPath) {
  const initPath = declaratorPath.get("init");
  const firstArg = initPath?.get("arguments.0");
  return firstArg?.isObjectExpression() ? firstArg : null;
}

function getObjectFunctionPath(objectPath, propertyName) {
  const properties = objectPath?.get("properties") || [];
  for (const propertyPath of properties) {
    if (!propertyPath.isObjectProperty() && !propertyPath.isObjectMethod()) {
      continue;
    }
    const key = propertyPath.get("key");
    if (
      !key.isIdentifier({ name: propertyName }) &&
      !key.isStringLiteral({ value: propertyName })
    ) {
      continue;
    }
    if (propertyPath.isObjectMethod()) {
      return propertyPath;
    }
    const value = propertyPath.get("value");
    if (value.isFunctionExpression() || value.isArrowFunctionExpression()) {
      return value;
    }
  }
  return null;
}

function transformStructuralHookDefinitionUse(
  declaratorPath,
  state,
  t,
  hookName,
) {
  const objectPath = getStructuralDefinitionObjectPath(declaratorPath);
  const usePath = getObjectFunctionPath(objectPath, "use");
  if (!usePath?.node) {
    return;
  }
  if (state.processedStructuralDefinitionUses.has(usePath.node)) {
    return;
  }

  const hostId = ensureHostParamIdentifier(usePath, state, t);
  state.processedStructuralDefinitionUses.add(usePath.node);

  pushHostExpression(state, hostId);
  state.activeStructuralDefinitionName = hookName;
  usePath.traverse({
    CallExpression(innerPath) {
      processRuntimeCall(innerPath, state, t, {});
    },
  });
  state.activeStructuralDefinitionName = null;
  popHostExpression(state);
}

function transformStructuralHookCall(callPath, state, t, hookInfo) {
  const hostExpr = cloneHostExpression(state, t);
  if (!hostExpr) {
    throw callPath.buildCodeFrameError(
      "Structural hooks can only be called from a LitSX component render, a local custom hook, or a structural hook reader.",
    );
  }

  const argsArray = t.arrayExpression(
    callPath.node.arguments.map((arg) => t.cloneNode(arg, true)),
  );
  const hookReference = t.cloneNode(hookInfo.definition, true);
  const requiredHooks = t.logicalExpression(
    "||",
    t.memberExpression(
      t.cloneNode(hookReference, true),
      createRuntimeMetadataSymbolExpression(t, "litsx.structuralHooks"),
      true,
    ),
    t.arrayExpression([t.cloneNode(hookReference, true)]),
  );
  addStructuralHookToCurrentPlan(state, {
    type: "spread",
    argument: requiredHooks,
  });

  callPath.replaceWith(
    t.callExpression(t.identifier("readStructuralHook"), [
      hostExpr,
      hookReference,
      argsArray,
    ]),
  );
  callPath.skip();

  state.usedHelpers.add("readStructuralHook");
  if (state.activeCustomHookBinding?.identifier?.name) {
    state.structuralCustomHookIdentifiers.add(
      state.activeCustomHookBinding.identifier.name,
    );
  }
  return true;
}

function processRuntimeCall(callPath, state, t, options) {
  const markHelperUsage = options ? options.markHelperUsage : undefined;

  const callee = callPath.get("callee");
  const structuralHookInfo = getStructuralHookCallInfo(
    callPath,
    callee,
    state,
    t,
  );
  if (structuralHookInfo) {
    const handled = transformStructuralHookCall(
      callPath,
      state,
      t,
      structuralHookInfo,
    );
    if (handled && markHelperUsage) {
      state.prepareNeeded = true;
      markHelperUsage("structural");
    }
    return handled;
  }

  const helperName = detectRuntimeHelperFromCallee(callee, state, t);
  if (helperName) {
    if (state.usedHelpers) {
      state.usedHelpers.add(helperName);
    }
    const assigned = assignHostArgument(callPath, state, t);
    appendHelperMetadataArgument(callPath, state, t, helperName);
    if (markHelperUsage) {
      state.prepareNeeded = true;
      markHelperUsage(helperName);
    }
    return true;
  }

  if (!isCustomHookCall(callee, state, t)) {
    return false;
  }

  if (callee.isIdentifier()) {
    const binding = callPath.scope.getBinding(callee.node.name);
    if (
      binding &&
      BLOCKED_CUSTOM_HOOK_SOURCES.has(getImportSource(binding.path))
    ) {
      return false;
    }
  } else if (callee.isMemberExpression({ computed: false })) {
    const object = callee.get("object");
    if (object.isIdentifier()) {
      const binding = callPath.scope.getBinding(object.node.name);
      if (
        binding &&
        BLOCKED_CUSTOM_HOOK_SOURCES.has(getImportSource(binding.path))
      ) {
        return false;
      }
    }
  }

  if (!shouldTransformCustomHookCall(callee, state, t)) {
    return false;
  }

  const assigned = assignHostArgument(callPath, state, t);

  if (callee.isIdentifier()) {
    const binding = callPath.scope.getBinding(callee.node.name);
    if (binding) {
      transformCustomHookDefinition(binding, state, t);
    }
  } else if (callee.isMemberExpression({ computed: false })) {
    const object = callee.get("object");
    if (object.isIdentifier()) {
      const binding = callPath.scope.getBinding(object.node.name);
      if (binding && binding.path.isImportNamespaceSpecifier()) {
        // Imported namespace custom hooks cannot be rewritten here.
      }
    }
  }

  const structuralCustomHook = isStructuralCustomHookCall(callee, state);
  if (structuralCustomHook) {
    addCustomHookStructuralDependenciesToCurrentPlan(callee, state, t);
    if (state.activeCustomHookBinding?.identifier?.name) {
      state.structuralCustomHookIdentifiers.add(
        state.activeCustomHookBinding.identifier.name,
      );
    }
  }

  if (markHelperUsage) {
    state.prepareNeeded = true;
    markHelperUsage(structuralCustomHook ? "structural" : "custom");
  }
  return true;
}

function ensurePrepareImport(programPath, state, t) {
  if (!state.prepareNeeded || state.prepareImported) {
    return;
  }

  const runtimeImports = [];
  programPath.get("body").forEach((child) => {
    if (!child.isImportDeclaration()) return;
    if (child.node.source.value !== state.runtimeModule) return;
    runtimeImports.push(child);
  });

  for (const importPath of runtimeImports) {
    const hasPrepare = importPath.node.specifiers.some(
      (spec) =>
        t.isImportSpecifier(spec) &&
        t.isIdentifier(spec.imported, { name: "prepareEffects" }),
    );
    if (hasPrepare) {
      state.prepareImported = true;
      return;
    }
  }

  let attached = false;
  for (const importPath of runtimeImports) {
    if (attached) break;
    const hasNamespace = importPath.node.specifiers.some((spec) =>
      t.isImportNamespaceSpecifier(spec),
    );
    if (hasNamespace) {
      continue;
    }

    importPath.node.specifiers.push(
      t.importSpecifier(
        t.identifier("prepareEffects"),
        t.identifier("prepareEffects"),
      ),
    );
    attached = true;
    state.prepareImported = true;
  }

  if (attached) {
    return;
  }

  const specifier = t.importSpecifier(
    t.identifier("prepareEffects"),
    t.identifier("prepareEffects"),
  );
  const importDecl = t.importDeclaration(
    [specifier],
    t.stringLiteral(state.runtimeModule),
  );

  const [firstImport] = programPath
    .get("body")
    .filter((child) => child.isImportDeclaration());

  if (firstImport) {
    firstImport.insertBefore(importDecl);
  } else {
    programPath.unshiftContainer("body", importDecl);
  }

  state.prepareImported = true;
}

function mergeRuntimeImports(programPath, state, t) {
  const runtimeImports = [];
  programPath.get("body").forEach((child) => {
    if (!child.isImportDeclaration()) return;
    if (child.node.source.value !== state.runtimeModule) return;
    runtimeImports.push(child);
  });

  if (runtimeImports.length <= 1) {
    return;
  }

  const [primaryImport, ...restImports] = runtimeImports;

  const namespaceSpecifiers = [];
  const defaultSpecifiers = [];
  const namedSpecifiers = [];

  for (const spec of primaryImport.node.specifiers) {
    if (t.isImportNamespaceSpecifier(spec)) {
      namespaceSpecifiers.push(spec);
    } else if (t.isImportDefaultSpecifier(spec)) {
      defaultSpecifiers.push(spec);
    } else if (t.isImportSpecifier(spec)) {
      namedSpecifiers.push(spec);
    }
  }

  const seenNamed = new Set(
    namedSpecifiers
      .filter((spec) => t.isIdentifier(spec.imported))
      .map((spec) => spec.imported.name),
  );

  for (const importPath of restImports) {
    const specs = importPath.node.specifiers;
    for (const spec of specs) {
      if (t.isImportNamespaceSpecifier(spec)) {
        namespaceSpecifiers.push(spec);
        continue;
      }
      if (t.isImportDefaultSpecifier(spec)) {
        defaultSpecifiers.push(spec);
        continue;
      }
      if (t.isImportSpecifier(spec) && t.isIdentifier(spec.imported)) {
        const name = spec.imported.name;
        if (!seenNamed.has(name)) {
          namedSpecifiers.push(spec);
          seenNamed.add(name);
        }
      }
    }
    importPath.remove();
  }

  if (defaultSpecifiers.length > 1) {
    defaultSpecifiers.splice(1);
  }
  if (namespaceSpecifiers.length > 1) {
    namespaceSpecifiers.splice(1);
  }

  const hasDefaultOrNamespace =
    defaultSpecifiers.length > 0 || namespaceSpecifiers.length > 0;

  if (!hasDefaultOrNamespace) {
    primaryImport.node.specifiers = namedSpecifiers;
    return;
  }

  primaryImport.node.specifiers = [
    ...defaultSpecifiers,
    ...namespaceSpecifiers,
  ];

  if (namedSpecifiers.length === 0) {
    return;
  }

  primaryImport.insertAfter(
    t.importDeclaration(
      namedSpecifiers.map((spec) => t.cloneNode(spec, true)),
      t.stringLiteral(state.runtimeModule),
    ),
  );
}

function ensureHelperImports(programPath, state, t) {
  const helperNames = new Set();
  if (state.usedHelpers) {
    for (const name of state.usedHelpers) {
      helperNames.add(name);
    }
  }
  if (state.hookIdentifiers) {
    for (const mappedName of state.hookIdentifiers.values()) {
      if (typeof mappedName === "string") {
        helperNames.add(mappedName);
      }
    }
  }

  if (helperNames.size === 0) {
    return;
  }

  const runtimeImports = [];
  const availableHelpers = new Set();
  programPath.get("body").forEach((child) => {
    if (!child.isImportDeclaration()) return;
    if (!state.importSourceSet.has(child.node.source.value)) return;
    runtimeImports.push(child);
  });

  for (const importPath of runtimeImports) {
    for (const spec of importPath.node.specifiers) {
      if (t.isImportSpecifier(spec) && t.isIdentifier(spec.imported)) {
        availableHelpers.add(spec.imported.name);
      } else if (
        (t.isImportNamespaceSpecifier(spec) ||
          t.isImportDefaultSpecifier(spec)) &&
        state.preservedRuntimeImportSourceSet.has(importPath.node.source.value)
      ) {
        for (const helperName of helperNames) {
          if (state.isHelperName(helperName)) {
            availableHelpers.add(helperName);
          }
        }
      }
    }
  }

  const missingHelpers = Array.from(helperNames).filter(
    (name) => !availableHelpers.has(name),
  );
  if (missingHelpers.length === 0) {
    return;
  }
  ensureRuntimeNamedImports(
    programPath,
    state.runtimeModule,
    missingHelpers,
    t,
  );
}

function transformClass(classPath, state, t) {
  const bodyItems = classPath.get("body.body");
  const renderMethodPath = bodyItems.find(
    (memberPath) =>
      memberPath.isClassMethod({ kind: "method" }) &&
      t.isIdentifier(memberPath.node.key, { name: "render" }),
  );

  if (!renderMethodPath) return;

  let hookUsedInRender = false;
  let structuralHookUsedInRender = false;
  const structuralHooks = [];

  pushHostExpression(state, t.thisExpression());
  state.activeStructuralHooks = structuralHooks;

  renderMethodPath.traverse({
    CallExpression(callPath) {
      const handled = processRuntimeCall(callPath, state, t, {
        markHelperUsage(kind) {
          hookUsedInRender = true;
          if (kind === "structural") {
            structuralHookUsedInRender = true;
          }
        },
      });

      if (!handled) return;
    },
  });

  state.activeStructuralHooks = null;
  popHostExpression(state);

  if (hookUsedInRender) {
    ensurePrepareEffectsCall(renderMethodPath, t);
    ensureSoftSuspenseRenderWrapper(renderMethodPath, t);
    state.usedHelpers.add("renderWithSoftSuspense");
  }

  if (
    structuralHookUsedInRender &&
    !classPath.node.__litsxStructuralHooksApplied
  ) {
    const superClass = classPath.node.superClass;
    if (superClass) {
      classPath.node.superClass = t.callExpression(
        t.identifier("applyStructuralHooks"),
        [
          superClass,
          t.arrayExpression(
            structuralHooks.map((entry) =>
              createStructuralHookExpression(entry, t),
            ),
          ),
        ],
      );
      classPath.node.__litsxStructuralHooksApplied = true;
      state.usedHelpers.add("applyStructuralHooks");
    }
  }
}

export function createRuntimeHooksTransform({
  pluginName,
  runtimeModule,
  importSources,
  preservedRuntimeImportSources,
  helperNames,
  callMetadataByHelper,
}) {
  if (!pluginName) {
    throw new Error("createRuntimeHooksTransform requires pluginName.");
  }
  if (!runtimeModule) {
    throw new Error("createRuntimeHooksTransform requires runtimeModule.");
  }
  if (!Array.isArray(importSources) || importSources.length === 0) {
    throw new Error("createRuntimeHooksTransform requires importSources.");
  }
  if (
    typeof helperNames !== "function" &&
    (!Array.isArray(helperNames) || helperNames.length === 0)
  ) {
    throw new Error("createRuntimeHooksTransform requires helperNames.");
  }

  const importSourceSet = new Set(importSources);
  const preservedRuntimeImportSourceSet = new Set(
    preservedRuntimeImportSources || [],
  );
  const helperSet =
    typeof helperNames === "function" ? null : new Set(helperNames);
  const isHelperName =
    typeof helperNames === "function"
      ? helperNames
      : (name) => helperSet.has(name);
  const resolvedCallMetadataByHelper =
    callMetadataByHelper instanceof Map
      ? callMetadataByHelper
      : new Map(Object.entries(callMetadataByHelper || {}));

  return function runtimeHooksTransform(api, pluginOptions = {}) {
    api.assertVersion("^8.0.0");
    const t = api.types;

    return {
      name: pluginName,
      visitor: {
        Program: {
          enter(path, state) {
            state.runtimeModule = runtimeModule;
            state.importSourceSet = importSourceSet;
            state.preservedRuntimeImportSourceSet =
              preservedRuntimeImportSourceSet;
            state.helperSet = helperSet;
            state.isHelperName = isHelperName;
            state.callMetadataByHelper = resolvedCallMetadataByHelper;
            state.hookIdentifiers = new Map();
            state.runtimeNamespaceBindings = new Set();
            state.runtimeDefaultBindings = new Set();
            state.defineHookIdentifiers = new Set();
            state.hookMarkerIdentifiers = new Set();
            state.componentMarkerIdentifiers = new Set();
            state.structuralHookIdentifiers = new Set();
            state.structuralNamespaceImports = new Map();
            state.structuralCustomHookIdentifiers = new Set();
            state.structuralHookDependencies = new Map();
            state.structuralCustomHookDependencies = new Map();
            state.activeStructuralHooks = null;
            state.activeStructuralDefinitionName = null;
            state.structuralHookResolver =
              typeof state.opts?.structuralHookResolver === "function"
                ? state.opts.structuralHookResolver
                : typeof pluginOptions.structuralHookResolver === "function"
                  ? pluginOptions.structuralHookResolver
                  : null;
            state.customHookResolver =
              typeof state.opts?.customHookResolver === "function"
                ? state.opts.customHookResolver
                : typeof pluginOptions.customHookResolver === "function"
                  ? pluginOptions.customHookResolver
                  : null;
            state.activeCustomHookBinding = null;
            state.prepareImported = false;
            state.prepareNeeded = false;
            state.hostExpressions = [];
            state.processedCustomHooks = new WeakSet();
            state.processedStructuralDefinitionUses = new WeakSet();
            state.customHookHostParams = new WeakMap();
            state.usedHelpers = new Set();
            state.compiledCustomHookNames = new Set();
          },
          exit(path, state) {
            processDeclaredCustomHooks(path, state, t);
            attachStructuralHookMetadata(path, state, t);
            attachStructuralCustomHookMetadata(path, state, t);
            attachCompiledCustomHookMetadata(path, state, t);
            ensurePrepareImport(path, state, t);
            mergeRuntimeImports(path, state, t);
            ensureHelperImports(path, state, t);
          },
        },
        ImportDeclaration(path, state) {
          for (const specifier of path.node.specifiers) {
            if (t.isImportSpecifier(specifier)) {
              const importedName = t.isIdentifier(specifier.imported)
                ? specifier.imported.name
                : (specifier.imported?.value ?? null);
              if (
                importedName &&
                isImportedStructuralHook(
                  state,
                  path.node.source.value,
                  importedName,
                )
              ) {
                state.structuralHookIdentifiers.add(specifier.local.name);
              } else if (
                importedName &&
                isImportedStructuralCustomHook(
                  state,
                  path.node.source.value,
                  importedName,
                )
              ) {
                state.structuralCustomHookIdentifiers.add(specifier.local.name);
              }
            } else if (t.isImportNamespaceSpecifier(specifier)) {
              state.structuralNamespaceImports.set(
                specifier.local.name,
                path.node.source.value,
              );
            }
          }

          if (!state.importSourceSet.has(path.node.source.value)) {
            return;
          }

          if (
            path.node.source.value !== state.runtimeModule &&
            !state.preservedRuntimeImportSourceSet.has(path.node.source.value)
          ) {
            path.node.source = t.stringLiteral(state.runtimeModule);
          }

          for (const specifier of path.node.specifiers) {
            if (t.isImportSpecifier(specifier)) {
              const importedName = t.isIdentifier(specifier.imported)
                ? specifier.imported.name
                : null;
              if (importedName === "prepareEffects") {
                state.prepareImported = true;
              }
              if (importedName === "defineHook") {
                state.defineHookIdentifiers.add(specifier.local.name);
              }
              if (importedName === "LITSX_HOOK") {
                state.hookMarkerIdentifiers.add(specifier.local.name);
              }
              if (importedName && state.isHelperName(importedName)) {
                state.hookIdentifiers.set(specifier.local.name, importedName);
              }
            } else if (
              t.isImportSpecifier(specifier) &&
              path.node.source.value === "@litsx/core/elements"
            ) {
              const importedName = t.isIdentifier(specifier.imported)
                ? specifier.imported.name
                : null;
              if (importedName === "LITSX_COMPONENT") {
                state.componentMarkerIdentifiers.add(specifier.local.name);
              }
            } else if (t.isImportNamespaceSpecifier(specifier)) {
              state.runtimeNamespaceBindings.add(specifier.local.name);
            } else if (t.isImportDefaultSpecifier(specifier)) {
              state.runtimeDefaultBindings.add(specifier.local.name);
            }
          }
        },
        VariableDeclarator(path, state) {
          collectStructuralHookDeclaration(path, state, t);
          const initPath = path.get("init");
          if (initPath?.isObjectExpression() || initPath?.isArrayExpression()) {
            rejectStructuralHookContainer(initPath, state);
            return;
          }
          rejectStructuralHookAlias(path, state);
        },
        ObjectExpression(path, state) {
          if (!path.parentPath?.isVariableDeclarator()) {
            return;
          }
          if (
            path.parentPath?.isCallExpression() &&
            isDefineHookCallee(path.parentPath.get("callee"), state)
          ) {
            return;
          }
          rejectStructuralHookContainer(path, state);
        },
        ArrayExpression(path, state) {
          if (!path.parentPath?.isVariableDeclarator()) {
            return;
          }
          rejectStructuralHookContainer(path, state);
        },
        MemberExpression(path, state) {
          rejectDynamicStructuralNamespaceAccess(path, state);
        },
        ClassDeclaration(path, state) {
          if (isCompiledLitsxComponentClass(path, state, t)) {
            return;
          }
          transformClass(path, state, t);
        },
        ClassExpression(path, state) {
          if (isCompiledLitsxComponentClass(path, state, t)) {
            return;
          }
          transformClass(path, state, t);
        },
      },
    };
  };
}
