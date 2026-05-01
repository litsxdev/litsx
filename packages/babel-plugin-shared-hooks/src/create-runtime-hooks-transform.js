import { ensurePrepareEffectsCall } from "./prepare-effects.js";
import { ensureRuntimeNamedImports } from "./runtime-imports.js";

const HOST_PARAM_PATTERN = /^_?host/;
const BLOCKED_CUSTOM_HOOK_SOURCES = new Set(["react"]);

function isCustomHookName(name) {
  return typeof name === "string" && /^use[A-Z0-9]/.test(name);
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
        if (state.helperSet.has(property.node.name)) {
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

  pushHostExpression(state, hostId);
  fnPath.traverse({
    CallExpression(innerPath) {
      processRuntimeCall(innerPath, state, t, {});
    },
  });
  popHostExpression(state);
}

function processDeclaredCustomHooks(programPath, state, t) {
  const bindings = programPath.scope.getAllBindings();
  for (const name of Object.keys(bindings)) {
    if (!isCustomHookName(name)) continue;
    const binding = bindings[name];
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

function processRuntimeCall(callPath, state, t, options) {
  const markHelperUsage = options ? options.markHelperUsage : undefined;

  const callee = callPath.get("callee");
  const helperName = detectRuntimeHelperFromCallee(callee, state, t);
  if (helperName) {
    if (state.usedHelpers) {
      state.usedHelpers.add(helperName);
    }
    const assigned = assignHostArgument(callPath, state, t);
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
    markHelperUsage("custom");
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
  programPath.get("body").forEach((child) => {
    if (!child.isImportDeclaration()) return;
    if (child.node.source.value !== state.runtimeModule) return;
    runtimeImports.push(child);
  });

  const existingNamed = new Set();
  for (const importPath of runtimeImports) {
    for (const spec of importPath.node.specifiers) {
      if (t.isImportSpecifier(spec) && t.isIdentifier(spec.imported)) {
        existingNamed.add(spec.imported.name);
      }
    }
  }

  const missingHelpers = Array.from(helperNames).filter((name) => !existingNamed.has(name));
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

  pushHostExpression(state, t.thisExpression());

  renderMethodPath.traverse({
    CallExpression(callPath) {
      const handled = processRuntimeCall(callPath, state, t, {
        markHelperUsage() {
          hookUsedInRender = true;
        },
      });

      if (!handled) return;
    },
  });

  popHostExpression(state);

  if (hookUsedInRender) {
    ensurePrepareEffectsCall(renderMethodPath, t);
  }
}

export function createRuntimeHooksTransform({
  pluginName,
  runtimeModule,
  importSources,
  helperNames,
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
  if (!Array.isArray(helperNames) || helperNames.length === 0) {
    throw new Error("createRuntimeHooksTransform requires helperNames.");
  }

  const importSourceSet = new Set(importSources);
  const helperSet = new Set(helperNames);

  return function runtimeHooksTransform(api) {
    api.assertVersion(7);
    const t = api.types;

    return {
      name: pluginName,
      visitor: {
        Program: {
          enter(path, state) {
            state.runtimeModule = runtimeModule;
            state.importSourceSet = importSourceSet;
            state.helperSet = helperSet;
            state.hookIdentifiers = new Map();
            state.runtimeNamespaceBindings = new Set();
            state.runtimeDefaultBindings = new Set();
            state.prepareImported = false;
            state.prepareNeeded = false;
            state.hostExpressions = [];
            state.processedCustomHooks = new WeakSet();
            state.customHookHostParams = new WeakMap();
            state.usedHelpers = new Set();
          },
          exit(path, state) {
            processDeclaredCustomHooks(path, state, t);
            ensurePrepareImport(path, state, t);
            mergeRuntimeImports(path, state, t);
            ensureHelperImports(path, state, t);
          },
        },
        ImportDeclaration(path, state) {
          if (!state.importSourceSet.has(path.node.source.value)) {
            return;
          }

          if (path.node.source.value !== state.runtimeModule) {
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
              if (importedName && state.helperSet.has(importedName)) {
                state.hookIdentifiers.set(specifier.local.name, importedName);
              }
            } else if (t.isImportNamespaceSpecifier(specifier)) {
              state.runtimeNamespaceBindings.add(specifier.local.name);
            } else if (t.isImportDefaultSpecifier(specifier)) {
              state.runtimeDefaultBindings.add(specifier.local.name);
            }
          }
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
