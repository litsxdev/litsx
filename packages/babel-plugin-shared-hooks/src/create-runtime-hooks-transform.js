import { ensurePrepareEffectsCall } from "./prepare-effects.js";
import { ensureRuntimeNamedImports } from "./runtime-imports.js";

const HOST_PARAM_PATTERN = /^_?host/;
const BLOCKED_CUSTOM_HOOK_SOURCES = new Set(["react"]);

function isCustomHookName(name) {
  return typeof name === "string" && /^use[A-Z0-9]/.test(name);
}

function normalizePath(value) {
  return String(value || "").replace(/\\/g, "/");
}

function hashStableId(value) {
  let hash = 2166136261;
  const text = String(value);
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function getCallsiteSeed(callPath, state, label = "structural") {
  const filename =
    state.file?.opts?.sourceFileName ||
    state.file?.opts?.filename ||
    state.filename ||
    "";
  const normalizedFilename = normalizePath(filename);
  const loc = callPath.node.loc?.start ?? null;
  const start = typeof callPath.node.start === "number"
    ? callPath.node.start
    : 0;
  const line = loc?.line ?? 0;
  const column = loc?.column ?? 0;
  return `${label}:${normalizedFilename}:${line}:${column}:${start}`;
}

function createStructuralCallsiteId(callPath, state) {
  return `litsx-structural-${hashStableId(getCallsiteSeed(callPath, state))}`;
}

function createStructuralCallsitePath(callPath, state, t, callsiteId) {
  const stack = Array.isArray(state.structuralPathStack)
    ? state.structuralPathStack
    : [];
  return t.arrayExpression([
    ...stack.map((part) => t.stringLiteral(String(part))),
    t.stringLiteral(callsiteId),
  ]);
}

function cloneForClassEntry(node, t) {
  return t.cloneNode(node, true);
}

function createStructuralEntryExpression(entry, t) {
  if (entry?.type === "spread") {
    return t.spreadElement(t.cloneNode(entry.argument, true));
  }

  return t.objectExpression([
    t.objectProperty(t.identifier("id"), t.stringLiteral(entry.callsiteId)),
    t.objectProperty(t.identifier("callsiteId"), t.stringLiteral(entry.callsiteId)),
    t.objectProperty(t.identifier("callsiteIndex"), t.numericLiteral(entry.callsiteIndex)),
    t.objectProperty(t.identifier("callsitePath"), cloneForClassEntry(entry.callsitePath, t)),
    t.objectProperty(t.identifier("definition"), cloneForClassEntry(entry.definition, t)),
    t.objectProperty(
      t.identifier("args"),
      entry.argsExpression
        ? cloneForClassEntry(entry.argsExpression, t)
        : t.arrayExpression([])
    ),
    t.objectProperty(
      t.identifier("meta"),
      t.objectExpression([
        t.objectProperty(
          t.identifier("callsitePath"),
          cloneForClassEntry(entry.callsitePath, t)
        ),
      ])
    ),
  ]);
}

function getStructuralDefinitionObjectFromBinding(binding, state) {
  if (!binding?.path?.isVariableDeclarator()) {
    return null;
  }
  const initPath = binding.path.get("init");
  if (!initPath?.isCallExpression()) {
    return null;
  }
  if (!isDefineHookCallee(initPath.get("callee"), state)) {
    return null;
  }
  const firstArg = initPath.get("arguments.0");
  return firstArg?.isObjectExpression() ? firstArg : null;
}

function hasObjectProperty(objectPath, name) {
  if (!objectPath?.isObjectExpression()) {
    return false;
  }
  return objectPath.get("properties").some((propertyPath) => {
    if (!propertyPath.isObjectProperty() && !propertyPath.isObjectMethod()) {
      return false;
    }
    const key = propertyPath.get("key");
    return key.isIdentifier({ name }) || key.isStringLiteral({ value: name });
  });
}

function getStructuralHookPhaseInfo(callPath, calleePath, state) {
  if (!calleePath.isIdentifier()) {
    return {
      hasStaticPhase: false,
      hasInstancePhase: true,
    };
  }
  const binding = callPath.scope.getBinding(calleePath.node.name);
  if (binding?.path?.isImportSpecifier()) {
    const source = binding.path.parentPath?.node?.source?.value;
    const imported = binding.path.node.imported;
    const importedName = imported?.name ?? imported?.value ?? calleePath.node.name;
    const info = getImportedStructuralHookInfo(state, source, importedName);
    if (info && typeof info === "object") {
      return {
        hasStaticPhase: info.hasStaticPhase === true,
        hasInstancePhase: info.hasInstancePhase !== false,
      };
    }
  }
  const objectPath = getStructuralDefinitionObjectFromBinding(binding, state);
  if (!objectPath) {
    return {
      hasStaticPhase: false,
      hasInstancePhase: true,
    };
  }
  const hasStaticPhase = hasObjectProperty(objectPath, "static");
  const hasInstancePhase =
    hasObjectProperty(objectPath, "setup") ||
    hasObjectProperty(objectPath, "createState") ||
    hasObjectProperty(objectPath, "middlewares");
  return {
    hasStaticPhase,
    hasInstancePhase,
  };
}

function addStructuralEntryToCurrentPlan(state, entry) {
  if (state.activeStructuralEntries) {
    state.activeStructuralEntries.push(entry);
  }
  if (state.activeCustomHookBinding?.identifier?.name) {
    const deps = state.structuralCustomHookDependencies.get(state.activeCustomHookBinding.identifier.name) || [];
    deps.push(entry);
    state.structuralCustomHookDependencies.set(state.activeCustomHookBinding.identifier.name, deps);
  }
  if (state.activeStructuralDefinitionName) {
    const deps = state.structuralHookDependencies.get(state.activeStructuralDefinitionName) || [];
    deps.push(entry);
    state.structuralHookDependencies.set(state.activeStructuralDefinitionName, deps);
  }
}

function addStructuralStaticEntryToCurrentPlan(state, entry) {
  if (state.activeStructuralStaticEntries) {
    state.activeStructuralStaticEntries.push(entry);
  }
}

function addStructuralDependenciesToCurrentPlan(state, hookInfo) {
  if (!state.activeStructuralEntries || !hookInfo?.label) {
    return;
  }
  const deps = state.structuralHookDependencies.get(hookInfo.label);
  if (!deps || deps.length === 0) {
    const importedDependencyArg = getImportedStructuralHookDependencyArgument(hookInfo.calleePath, state, hookInfo.t);
    if (!importedDependencyArg) {
      return;
    }
    state.usedHelpers.add("getStructuralHookEntries");
    state.activeStructuralEntries.push({
      type: "spread",
      argument: hookInfo.t.callExpression(hookInfo.t.identifier("getStructuralHookEntries"), [
        importedDependencyArg,
      ]),
    });
    return;
  }
  state.activeStructuralEntries.push(...deps);
}

function getImportedStructuralHookDependencyArgument(calleePath, state, t) {
  if (!calleePath?.node) {
    return null;
  }

  if (calleePath.isIdentifier()) {
    const binding = calleePath.scope.getBinding(calleePath.node.name);
    if (!binding?.path?.isImportSpecifier()) {
      return null;
    }
    return isStructuralHookReference(calleePath, state)
      ? t.identifier(calleePath.node.name)
      : null;
  }

  if (calleePath.isMemberExpression({ computed: false })) {
    return isStructuralHookReference(calleePath, state)
      ? t.cloneNode(calleePath.node, true)
      : null;
  }

  return null;
}

function getImportedStructuralCustomHookDependencyArgument(calleePath, state, t) {
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

function addCustomHookStructuralDependenciesToCurrentPlan(calleePath, state, t) {
  if (!state.activeStructuralEntries) {
    return;
  }

  if (calleePath.isIdentifier()) {
    const localDeps = state.structuralCustomHookDependencies.get(calleePath.node.name);
    if (localDeps?.length) {
      state.activeStructuralEntries.push(...localDeps);
      return;
    }
  }

  const importedDependencyArg = getImportedStructuralCustomHookDependencyArgument(calleePath, state, t);
  if (!importedDependencyArg) {
    return;
  }

  state.usedHelpers.add("getStructuralHookEntries");
  state.activeStructuralEntries.push({
    type: "spread",
    argument: t.callExpression(t.identifier("getStructuralHookEntries"), [
      importedDependencyArg,
    ]),
  });
}

function ensureStaticStructuralEntries(classPath, entries, t) {
  return ensureStructuralEntriesProperty(classPath, "structuralEntries", entries, t);
}

function ensureStaticStructuralStaticEntries(classPath, entries, t) {
  return ensureStructuralEntriesProperty(classPath, "structuralStaticEntries", entries, t);
}

function ensureStructuralEntriesProperty(classPath, propertyName, entries, t) {
  if (!entries || entries.length === 0) {
    return;
  }

  const body = classPath.get("body.body");
  const existing = body.find((memberPath) =>
    memberPath.node.static === true &&
    t.isIdentifier(memberPath.node.key, { name: propertyName })
  );
  const entryExpressions = entries
    .slice()
    .sort((a, b) => a.callsiteIndex - b.callsiteIndex)
    .map((entry) => createStructuralEntryExpression(entry, t));

  if (existing?.node) {
    const value = existing.node.value;
    if (t.isArrayExpression(value)) {
      value.elements.push(...entryExpressions);
    }
    return;
  }

  const property = t.classProperty(
    t.identifier(propertyName),
    t.arrayExpression(entryExpressions)
  );
  property.static = true;

  const insertionIndex = classPath.node.body.body.findIndex((member) => !member.static);
  if (insertionIndex === -1) {
    classPath.node.body.body.push(property);
  } else {
    classPath.node.body.body.splice(insertionIndex, 0, property);
  }
}

function createDefineStructuralHookEntriesStatement(hookName, entries, t) {
  return t.expressionStatement(
    t.callExpression(t.identifier("defineStructuralHookEntries"), [
      t.identifier(hookName),
      t.arrayExpression(entries.map((entry) => createStructuralEntryExpression(entry, t))),
    ])
  );
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
    const statement = createDefineStructuralHookEntriesStatement(hookName, entries, t);
    if (binding.path.isFunctionDeclaration()) {
      binding.path.insertAfter(statement);
    } else if (binding.path.isVariableDeclarator()) {
      const statementPath = binding.path.getStatementParent();
      statementPath?.insertAfter(statement);
    }
    state.usedHelpers.add("defineStructuralHookEntries");
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
    const statement = createDefineStructuralHookEntriesStatement(hookName, entries, t);
    const statementPath = binding.path.getStatementParent();
    statementPath?.insertAfter(statement);
    state.usedHelpers.add("defineStructuralHookEntries");
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

  const previousStructuralEntries = state.activeStructuralEntries;
  pushHostExpression(state, hostId);
  state.activeStructuralEntries = null;
  state.activeCustomHookBinding = binding;
  state.structuralPathStack.push(binding.identifier?.name || "custom-hook");
  fnPath.traverse({
    CallExpression(innerPath) {
      processRuntimeCall(innerPath, state, t, {});
    },
  });
  state.structuralPathStack.pop();
  state.activeCustomHookBinding = null;
  state.activeStructuralEntries = previousStructuralEntries;
  popHostExpression(state);
}

function localCustomHookUsesHost(binding, state, t, seen = new WeakSet()) {
  if (!binding || !isSupportedCustomHookBinding(binding.path)) {
    return false;
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
          const importedName = imported?.name ?? imported?.value ?? callee.node.name;
          const result = resolveImportedHostAwareCustomHook(state, source, importedName);
          if (result === "unresolved-custom-hook") {
            throw callee.buildCodeFrameError(
              `Unable to resolve imported custom hook "${callee.node.name}" from "${source}". LitSX must resolve imported custom hooks to determine whether the active host must be passed.`
            );
          }
          if (result === true) {
            usesHost = true;
            innerPath.stop();
          }
          return;
        }
        if (nestedBinding && localCustomHookUsesHost(nestedBinding, state, t, seen)) {
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
          const result = resolveImportedHostAwareCustomHook(state, source, property.node.name);
          if (result === "unresolved-custom-hook") {
            throw property.buildCodeFrameError(
              `Unable to resolve imported custom hook "${property.node.name}" from "${source}". LitSX must resolve imported custom hooks to determine whether the active host must be passed.`
            );
          }
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
    return object.isIdentifier() && (
      state.runtimeNamespaceBindings.has(object.node.name) ||
      state.runtimeDefaultBindings.has(object.node.name)
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
      hasStaticPhase: false,
      hasInstancePhase: true,
      definition: t.memberExpression(
        t.identifier(object.node.name),
        t.identifier(property.node.name)
      ),
    };
  }

  if (!calleePath.isIdentifier()) {
    return null;
  }
  const name = calleePath.node.name;
  if (state.structuralHookIdentifiers?.has(name)) {
    const phaseInfo = getStructuralHookPhaseInfo(callPath, calleePath, state);
    return {
      label: name,
      calleePath,
      t,
      ...phaseInfo,
      definition: t.identifier(name),
    };
  }
  const binding = callPath.scope.getBinding(name);
  if (!isStructuralHookBinding(binding, state)) {
    return null;
  }
  state.structuralHookIdentifiers.add(name);
  const phaseInfo = getStructuralHookPhaseInfo(callPath, calleePath, state);
  return {
    label: name,
    calleePath,
    t,
    ...phaseInfo,
    definition: t.identifier(name),
  };
}

function isImportedStructuralHook(state, source, importedName) {
  const result = getImportedStructuralHookInfo(state, source, importedName);
  return result === true || result === "structural-hook" || result?.kind === "structural-hook";
}

function getImportedStructuralHookInfo(state, source, importedName) {
  const resolver = state.structuralHookResolver;
  return typeof resolver === "function" && resolver({
    source,
    importedName,
    filename: state.file?.opts?.filename || state.filename || "",
  });
}

function isImportedStructuralCustomHook(state, source, importedName) {
  const resolver = state.structuralHookResolver;
  return typeof resolver === "function" && resolver({
    source,
    importedName,
    filename: state.file?.opts?.filename || state.filename || "",
  }) === "structural-custom-hook";
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
      const importedName = imported?.name ?? imported?.value ?? calleePath.node.name;
      const result = resolveImportedHostAwareCustomHook(state, source, importedName);
      if (result === "unresolved-custom-hook") {
        throw calleePath.buildCodeFrameError(
          `Unable to resolve imported custom hook "${calleePath.node.name}" from "${source}". LitSX must resolve imported custom hooks to determine whether the active host must be passed.`
        );
      }
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
      const result = resolveImportedHostAwareCustomHook(state, source, property.node.name);
      if (result === "unresolved-custom-hook") {
        throw property.buildCodeFrameError(
          `Unable to resolve imported custom hook "${property.node.name}" from "${source}". LitSX must resolve imported custom hooks to determine whether the active host must be passed.`
        );
      }
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
    return Boolean(source && isImportedStructuralHook(state, source, property.node.name));
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
    (
      initPath.get("callee").isIdentifier({ name: "resolveStructuralEntry" }) ||
      initPath.get("callee").isIdentifier({ name: "resolveStructuralStaticEntry" })
    )
  ) {
    return;
  }
  if (initPath.isCallExpression() && containsStructuralHookReference(initPath.get("callee"), state)) {
    return;
  }
  if (!containsStructuralHookReference(initPath, state)) {
    return;
  }

  const id = path.get("id");
  const aliasName = id.isIdentifier() ? id.node.name : "this binding";
  throw path.buildCodeFrameError(
    `Structural hook "${aliasName}" cannot be created through an alias. Call the structural hook directly so LitSX can assign stable callsite identity.`
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
    if (calleePath.isIdentifier({ name: "resolveStructuralEntry" })) {
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

  if (!values.some((valuePath) => containsStructuralHookReference(valuePath, state))) {
    return;
  }

  throw path.buildCodeFrameError(
    "Structural hooks cannot be stored in object or array containers. Call the structural hook directly so LitSX can assign stable callsite identity."
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
    "Structural hooks imported through a namespace must be accessed with a static property, for example hooks.useThing(). Computed structural hook access cannot provide stable callsite identity."
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
    return Boolean(source && isImportedStructuralCustomHook(state, source, property.node.name));
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
  const id = path.get("id");
  if (id.isIdentifier()) {
    state.structuralHookIdentifiers.add(id.node.name);
    transformStructuralHookDefinitionUse(path, state, t, id.node.name);
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
    if (!key.isIdentifier({ name: propertyName }) && !key.isStringLiteral({ value: propertyName })) {
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

function transformStructuralHookDefinitionUse(declaratorPath, state, t, hookName) {
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
  state.structuralPathStack.push(hookName, "use");
  usePath.traverse({
    CallExpression(innerPath) {
      processRuntimeCall(innerPath, state, t, {});
    },
  });
  state.structuralPathStack.pop();
  state.structuralPathStack.pop();
  state.activeStructuralDefinitionName = null;
  popHostExpression(state);
}

function transformStructuralHookCall(callPath, state, t, hookInfo) {
  const hostExpr = cloneHostExpression(state, t);
  if (!hostExpr) {
    throw callPath.buildCodeFrameError(
      "Structural hooks can only be called from a LitSX component render, a local custom hook, or a structural hook reader."
    );
  }

  const callsiteIndex = state.structuralCallsiteIndex;
  state.structuralCallsiteIndex += 1;

  const callsiteId = createStructuralCallsiteId(callPath, state);
  const callsitePath = createStructuralCallsitePath(callPath, state, t, callsiteId);
  const argsArray = t.arrayExpression(
    callPath.node.arguments.map((arg) => t.cloneNode(arg, true))
  );
  const meta = t.objectExpression([
    t.objectProperty(t.identifier("callsitePath"), callsitePath),
  ]);
  const entry = {
    callsiteIndex,
    callsiteId,
    callsitePath: t.cloneNode(callsitePath, true),
    definition: t.cloneNode(hookInfo.definition, true),
  };

  if (hookInfo.hasStaticPhase && !hookInfo.hasInstancePhase) {
    addStructuralStaticEntryToCurrentPlan(state, {
      ...entry,
      argsExpression: t.cloneNode(argsArray, true),
    });
    addStructuralDependenciesToCurrentPlan(state, hookInfo);
    callPath.replaceWith(
      t.callExpression(t.identifier("resolveStructuralStaticEntry"), [
        t.memberExpression(hostExpr, t.identifier("constructor")),
        t.numericLiteral(callsiteIndex),
        t.stringLiteral(callsiteId),
        t.cloneNode(hookInfo.definition, true),
        argsArray,
        meta,
      ])
    );
    callPath.skip();

    state.usedHelpers.add("resolveStructuralStaticEntry");
    if (state.activeCustomHookBinding?.identifier?.name) {
      state.structuralCustomHookIdentifiers.add(state.activeCustomHookBinding.identifier.name);
    }
    return true;
  }

  addStructuralEntryToCurrentPlan(state, entry);
  addStructuralDependenciesToCurrentPlan(state, hookInfo);

  callPath.replaceWith(
    t.callExpression(t.identifier("resolveStructuralEntry"), [
      hostExpr,
      t.numericLiteral(callsiteIndex),
      t.stringLiteral(callsiteId),
      t.cloneNode(hookInfo.definition, true),
      argsArray,
      meta,
    ])
  );
  callPath.skip();

  state.usedHelpers.add("resolveStructuralEntry");
  state.usedHelpers.add("HostMiddlewareMixin");
  if (state.activeCustomHookBinding?.identifier?.name) {
    state.structuralCustomHookIdentifiers.add(state.activeCustomHookBinding.identifier.name);
  }
  return true;
}

function processRuntimeCall(callPath, state, t, options) {
  const markHelperUsage = options ? options.markHelperUsage : undefined;

  const callee = callPath.get("callee");
  const structuralHookInfo = getStructuralHookCallInfo(callPath, callee, state, t);
  if (structuralHookInfo) {
    const handled = transformStructuralHookCall(callPath, state, t, structuralHookInfo);
    if (handled && markHelperUsage) {
      state.prepareNeeded = true;
      markHelperUsage(
        structuralHookInfo.hasStaticPhase && !structuralHookInfo.hasInstancePhase
          ? "structural-static"
          : "structural"
      );
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
    if (binding && BLOCKED_CUSTOM_HOOK_SOURCES.has(getImportSource(binding.path))) {
      return false;
    }
  } else if (callee.isMemberExpression({ computed: false })) {
    const object = callee.get("object");
    if (object.isIdentifier()) {
      const binding = callPath.scope.getBinding(object.node.name);
      if (binding && BLOCKED_CUSTOM_HOOK_SOURCES.has(getImportSource(binding.path))) {
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

  if (markHelperUsage) {
    state.prepareNeeded = true;
    if (isStructuralCustomHookCall(callee, state)) {
      addCustomHookStructuralDependenciesToCurrentPlan(callee, state, t);
    }
    markHelperUsage(
      isStructuralCustomHookCall(callee, state)
        ? "structural"
        : "custom"
    );
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
        t.isIdentifier(spec.imported, { name: "prepareEffects" })
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
      t.isImportNamespaceSpecifier(spec)
    );
    if (hasNamespace) {
      continue;
    }

    importPath.node.specifiers.push(
      t.importSpecifier(t.identifier("prepareEffects"), t.identifier("prepareEffects"))
    );
    attached = true;
    state.prepareImported = true;
  }

  if (attached) {
    return;
  }

  const specifier = t.importSpecifier(
    t.identifier("prepareEffects"),
    t.identifier("prepareEffects")
  );
  const importDecl = t.importDeclaration(
    [specifier],
    t.stringLiteral(state.runtimeModule)
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
      .map((spec) => spec.imported.name)
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
      t.stringLiteral(state.runtimeModule)
    )
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
        (t.isImportNamespaceSpecifier(spec) || t.isImportDefaultSpecifier(spec)) &&
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

  const missingHelpers = Array.from(helperNames).filter((name) => !availableHelpers.has(name));
  if (missingHelpers.length === 0) {
    return;
  }
  ensureRuntimeNamedImports(programPath, state.runtimeModule, missingHelpers, t);
}

function transformClass(classPath, state, t) {
  const bodyItems = classPath.get("body.body");
  const renderMethodPath = bodyItems.find(
    (memberPath) =>
      memberPath.isClassMethod({ kind: "method" }) &&
      t.isIdentifier(memberPath.node.key, { name: "render" })
  );

  if (!renderMethodPath) return;

  let hookUsedInRender = false;
  let structuralHookUsedInRender = false;
  let structuralStaticHookUsedInRender = false;
  const structuralEntries = [];
  const structuralStaticEntries = [];

  pushHostExpression(state, t.thisExpression());
  state.activeStructuralEntries = structuralEntries;
  state.activeStructuralStaticEntries = structuralStaticEntries;

  renderMethodPath.traverse({
    CallExpression(callPath) {
      const handled = processRuntimeCall(callPath, state, t, {
        markHelperUsage(kind) {
          hookUsedInRender = true;
          if (kind === "structural") {
            structuralHookUsedInRender = true;
          }
          if (kind === "structural-static") {
            structuralStaticHookUsedInRender = true;
          }
        },
      });

      if (!handled) return;
    },
  });

  state.activeStructuralEntries = null;
  state.activeStructuralStaticEntries = null;
  popHostExpression(state);

  if (hookUsedInRender) {
    ensurePrepareEffectsCall(renderMethodPath, t);
  }

  if (structuralHookUsedInRender && !classPath.node.__litsxHostMiddlewareWrapped) {
    const superClass = classPath.node.superClass;
    if (superClass) {
      classPath.node.superClass = t.callExpression(t.identifier("HostMiddlewareMixin"), [
        superClass,
      ]);
      classPath.node.__litsxHostMiddlewareWrapped = true;
      state.usedHelpers.add("HostMiddlewareMixin");
    }
  }

  if (structuralHookUsedInRender) {
    ensureStaticStructuralEntries(classPath, structuralEntries, t);
  }
  if (structuralStaticHookUsedInRender) {
    ensureStaticStructuralStaticEntries(classPath, structuralStaticEntries, t);
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
  const preservedRuntimeImportSourceSet = new Set(preservedRuntimeImportSources || []);
  const helperSet = typeof helperNames === "function" ? null : new Set(helperNames);
  const isHelperName = typeof helperNames === "function"
    ? helperNames
    : (name) => helperSet.has(name);
  const resolvedCallMetadataByHelper = callMetadataByHelper instanceof Map
    ? callMetadataByHelper
    : new Map(Object.entries(callMetadataByHelper || {}));

  return function runtimeHooksTransform(api, pluginOptions = {}) {
    api.assertVersion(7);
    const t = api.types;

    return {
      name: pluginName,
      visitor: {
        Program: {
          enter(path, state) {
            state.runtimeModule = runtimeModule;
            state.importSourceSet = importSourceSet;
            state.preservedRuntimeImportSourceSet = preservedRuntimeImportSourceSet;
            state.helperSet = helperSet;
            state.isHelperName = isHelperName;
            state.callMetadataByHelper = resolvedCallMetadataByHelper;
            state.hookIdentifiers = new Map();
            state.runtimeNamespaceBindings = new Set();
            state.runtimeDefaultBindings = new Set();
            state.defineHookIdentifiers = new Set();
            state.structuralHookIdentifiers = new Set();
            state.structuralNamespaceImports = new Map();
            state.structuralCustomHookIdentifiers = new Set();
            state.structuralHookDependencies = new Map();
            state.structuralCustomHookDependencies = new Map();
            state.structuralCallsiteIndex = 0;
            state.structuralPathStack = [];
            state.activeStructuralEntries = null;
            state.activeStructuralStaticEntries = null;
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
          },
          exit(path, state) {
            processDeclaredCustomHooks(path, state, t);
            attachStructuralHookMetadata(path, state, t);
            attachStructuralCustomHookMetadata(path, state, t);
            ensurePrepareImport(path, state, t);
            mergeRuntimeImports(path, state, t);
            ensureHelperImports(path, state, t);
          },
        },
        ImportDeclaration(path, state) {
          if (!state.importSourceSet.has(path.node.source.value)) {
            for (const specifier of path.node.specifiers) {
              if (t.isImportSpecifier(specifier)) {
                const importedName = t.isIdentifier(specifier.imported)
                  ? specifier.imported.name
                  : specifier.imported?.value ?? null;
                if (
                  importedName &&
                  isImportedStructuralHook(state, path.node.source.value, importedName)
                ) {
                  state.structuralHookIdentifiers.add(specifier.local.name);
                } else if (
                  importedName &&
                  isImportedStructuralCustomHook(state, path.node.source.value, importedName)
                ) {
                  state.structuralCustomHookIdentifiers.add(specifier.local.name);
                }
              } else if (t.isImportNamespaceSpecifier(specifier)) {
                state.structuralNamespaceImports.set(
                  specifier.local.name,
                  path.node.source.value
                );
              }
            }
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
              if (importedName && state.isHelperName(importedName)) {
                state.hookIdentifiers.set(specifier.local.name, importedName);
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
          if (path.parentPath?.isCallExpression() && isDefineHookCallee(path.parentPath.get("callee"), state)) {
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
          transformClass(path, state, t);
        },
        ClassExpression(path, state) {
          transformClass(path, state, t);
        },
      },
    };
  };
}
