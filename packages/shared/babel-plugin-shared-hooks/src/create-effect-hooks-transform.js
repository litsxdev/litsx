import { ensurePrepareEffectsCall } from "./prepare-effects.js";

function createRuntimeCall(hookType, callbackNode, depNodes, t) {
  const calleeName = hookType === "useLayoutEffect" ? "useOnCommit" : "useAfterUpdate";
  const args = [t.thisExpression(), t.cloneNode(callbackNode, true)];

  if (Array.isArray(depNodes)) {
    args.push(t.arrayExpression(depNodes.map((node) => t.cloneNode(node, true))));
  }

  return t.callExpression(t.identifier(calleeName), args);
}

function parseDependencies(argPath, t) {
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

function removeHookImports(programPath, state, t) {
  if (!state.hookIdentifiers || state.hookIdentifiers.size === 0) return;

  programPath.scope.crawl();

  programPath.get("body").forEach((child) => {
    if (!child.isImportDeclaration()) return;
    if (!state.importSourceSet.has(child.node.source.value)) return;

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

function ensureRuntimeImport(programPath, state, t) {
  if (!state.runtimeNeeded) return;

  let existingImport = null;
  programPath.get("body").forEach((child) => {
    if (!child.isImportDeclaration()) return;
    if (child.node.source.value !== state.runtimeModule) return;
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

    const newImport = t.importDeclaration(specifiers, t.stringLiteral(state.runtimeModule));
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

function transformClass(classPath, state, t) {
  const classBodyPaths = classPath.get("body.body");
  const renderMethodPath = classBodyPaths.find(
    (bodyPath) =>
      bodyPath.isClassMethod({ kind: "method" }) &&
      t.isIdentifier(bodyPath.node.key, { name: "render" })
  );

  if (!renderMethodPath) return;

  let transformed = false;

  renderMethodPath.traverse({
    CallExpression(callPath) {
      const callee = callPath.get("callee");
      if (!callee.isIdentifier()) return;

      const hookType = state.hookIdentifiers.get(callee.node.name);
      if (!hookType) return;

      const args = callPath.get("arguments");
      if (args.length === 0) return;

      const callback = args[0].node;
      const depsResult = parseDependencies(args[1], t);
      if (!depsResult.ok) return;

      const parent = callPath.parentPath;
      if (!parent.isExpressionStatement()) return;

      state.runtimeNeeded = true;
      if (hookType === "useLayoutEffect") {
        state.layoutNeeded = true;
      } else {
        state.effectNeeded = true;
      }

      const runtimeCall = createRuntimeCall(
        hookType,
        callback,
        depsResult.deps,
        t
      );

      parent.replaceWith(t.expressionStatement(runtimeCall));

      state.hookLocals.add(callee.node.name);
      transformed = true;
    },
  });

  if (!transformed) return;

  ensurePrepareEffectsCall(renderMethodPath, t);
}

export function createEffectHooksTransform({
  pluginName,
  importSources,
  runtimeModule,
} = {}) {
  if (!pluginName) {
    throw new Error("createEffectHooksTransform requires pluginName.");
  }
  if (!Array.isArray(importSources) || importSources.length === 0) {
    throw new Error("createEffectHooksTransform requires importSources.");
  }
  if (!runtimeModule) {
    throw new Error("createEffectHooksTransform requires runtimeModule.");
  }

  const importSourceSet = new Set(importSources);

  return function effectHooksTransform(api) {
    api.assertVersion(7);
    const t = api.types;

    return {
      name: pluginName,
      visitor: {
        Program: {
          enter(_, state) {
            state.importSourceSet = importSourceSet;
            state.runtimeModule = runtimeModule;
            state.hookIdentifiers = new Map();
            state.hookLocals = new Set();
            state.runtimeNeeded = false;
            state.effectNeeded = false;
            state.layoutNeeded = false;
          },
          exit(path, state) {
            removeHookImports(path, state, t);
            ensureRuntimeImport(path, state, t);
          },
        },
        ImportDeclaration(path, state) {
          if (!state.importSourceSet.has(path.node.source.value)) return;

          path.node.specifiers.forEach((specifier) => {
            if (!t.isImportSpecifier(specifier)) return;

            const imported = specifier.imported.name;
            if (imported !== "useEffect" && imported !== "useLayoutEffect") return;

            state.hookIdentifiers.set(specifier.local.name, imported);
          });
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
