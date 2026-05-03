import { ensurePrepareEffectsCall } from "./prepare-effects.js";
import { assertNoReactEventAttributes } from "./react-event-attributes.js";
import {
  HOST_TYPE_RENDER,
  resolveHostInfo,
} from "./custom-hook-host.js";
const RUNTIME_MODULE = "@litsx/litsx";

function transformUseStateCall(path, state, hostInfo, t) {
  const existingArgs = path.node.arguments;
  const hostExprClone = t.cloneNode(hostInfo.expression, true);

  const runtimeCallee = t.identifier(state.runtimeLocalName || state.hookName);

  if (
    existingArgs.length > 0 &&
    t.isNodesEquivalent(existingArgs[0], hostExprClone)
  ) {
    state.runtimeNeeded = true;
    state.prepareImportNeeded = true;
    if (hostInfo.type === HOST_TYPE_RENDER) {
      state.renderMethodsNeedingPrepare.add(hostInfo.functionPath);
    }
    return;
  }

  const nextArgs = [hostExprClone, ...existingArgs.map((arg) => t.cloneNode(arg, true))];
  const runtimeCall = t.callExpression(runtimeCallee, nextArgs);

  path.replaceWith(runtimeCall);
  path.skip();

  state.runtimeNeeded = true;
  state.prepareImportNeeded = true;
  if (hostInfo.type === HOST_TYPE_RENDER) {
    state.renderMethodsNeedingPrepare.add(hostInfo.functionPath);
  }
}

function processPendingCalls(state, t) {
  if (!Array.isArray(state.pendingCalls) || state.pendingCalls.length === 0) {
    return;
  }

  for (const callPath of state.pendingCalls) {
    if (!callPath.node) continue;
    const hostInfo = resolveHostInfo(callPath, t);
    if (!hostInfo) {
      throw callPath.buildCodeFrameError(
        "create-use-state-transform: unable to resolve host for useState inside custom hook"
      );
    }
    transformUseStateCall(callPath, state, hostInfo, t);
  }

  state.pendingCalls.length = 0;
}

export function createUseStateTransform({
  importSource,
  hookName,
  pluginName,
  allowEventAttributeOptionKey,
  eventAttributeErrorMessage = "React-style event attributes are not allowed.",
} = {}) {
  const importSources = Array.isArray(importSource) ? importSource : [importSource];
  if (importSources.length === 0 || importSources.some((value) => typeof value !== "string" || value.length === 0)) {
    throw new Error("createUseStateTransform requires importSource (string or string[]), hookName, and pluginName.");
  }
  if (!hookName || !pluginName) {
    throw new Error("createUseStateTransform requires importSource, hookName, and pluginName.");
  }

  return function useStateTransform(api, options = {}) {
    api.assertVersion(7);
    const t = api.types;

    return {
      name: pluginName,
      visitor: {
        Program: {
          enter(programPath, state) {
            state.programPath = programPath;
            state.hookName = hookName;
            state.runtimeLocalName = hookName;
            state.importSources = importSources;
            state.allowEventAttributes = allowEventAttributeOptionKey
              ? Boolean(options[allowEventAttributeOptionKey])
              : false;
            state.reactHookLocals = new Map();
            state.reactNamespaceBindings = new Set();
            state.runtimeNeeded = false;
            state.prepareImportNeeded = false;
            state.renderMethodsNeedingPrepare = new WeakSet();
            state.pendingCalls = [];
          },
          exit(programPath, state) {
            processPendingCalls(state, t);

            programPath.scope.crawl();

            programPath.get("body").forEach((nodePath) => {
              if (!nodePath.isImportDeclaration()) return;
              if (!state.importSources.includes(nodePath.node.source.value)) return;

              let removed = false;

              nodePath.get("specifiers").forEach((specifierPath) => {
                if (!specifierPath.isImportSpecifier()) return;
                if (specifierPath.node.imported.name !== hookName) return;

                specifierPath.remove();
                removed = true;
              });

              if (removed && nodePath.node.specifiers.length === 0) {
                nodePath.remove();
              }
            });

            if (!state.runtimeNeeded) {
              return;
            }

            let existingImport = null;
            programPath.get("body").forEach((child) => {
              if (!child.isImportDeclaration()) return;
              if (child.node.source.value !== RUNTIME_MODULE) return;
              existingImport = child;
            });

            const runtimeIdentifier = t.identifier(state.runtimeLocalName);
            const requiredSpecifiers = [
              t.importSpecifier(runtimeIdentifier, t.identifier("useState")),
            ];
            if (state.prepareImportNeeded) {
              requiredSpecifiers.push(
                t.importSpecifier(t.identifier("prepareEffects"), t.identifier("prepareEffects"))
              );
            }

            if (existingImport) {
              const hasNamespaceSpecifier = existingImport.node.specifiers.some((spec) =>
                t.isImportNamespaceSpecifier(spec)
              );

              if (hasNamespaceSpecifier) {
                existingImport.insertAfter(
                  t.importDeclaration(
                    requiredSpecifiers,
                    t.stringLiteral(RUNTIME_MODULE)
                  )
                );
              } else {
                const prefixSpecifiers = existingImport.node.specifiers.filter(
                  (spec) => !t.isImportSpecifier(spec)
                );
                const otherNamedSpecifiers = existingImport.node.specifiers.filter((spec) => {
                  if (!t.isImportSpecifier(spec)) return false;
                  const importedName = spec.imported.name;
                  return importedName !== "useState" && importedName !== "prepareEffects";
                });

                existingImport.node.specifiers = [
                  ...prefixSpecifiers,
                  ...requiredSpecifiers,
                  ...otherNamedSpecifiers,
                ];
              }
            } else {
              const newImport = t.importDeclaration(
                requiredSpecifiers,
                t.stringLiteral(RUNTIME_MODULE)
              );
              const firstImport = programPath
                .get("body")
                .find((child) => child.isImportDeclaration());

              if (firstImport) {
                firstImport.insertBefore(newImport);
              } else {
                programPath.unshiftContainer("body", newImport);
              }
            }

            let hasUseStateImport = false;
            let hasPrepareImport = false;
            programPath.get("body").forEach((child) => {
              if (!child.isImportDeclaration()) return;
              if (child.node.source.value !== RUNTIME_MODULE) return;
              if (
                child.node.specifiers.some(
                  (spec) =>
                    t.isImportSpecifier(spec) &&
                    t.isIdentifier(spec.imported, { name: "useState" })
                )
              ) {
                hasUseStateImport = true;
              }
              if (
                child.node.specifiers.some(
                  (spec) =>
                    t.isImportSpecifier(spec) &&
                    t.isIdentifier(spec.imported, { name: "prepareEffects" })
                )
              ) {
                hasPrepareImport = true;
              }
            });

            if (!hasUseStateImport) {
              const specifier = t.importSpecifier(
                t.identifier(state.runtimeLocalName),
                t.identifier("useState")
              );
              const fallbackImport = t.importDeclaration(
                [specifier],
                t.stringLiteral(RUNTIME_MODULE)
              );
              const firstImport = programPath
                .get("body")
                .find((child) => child.isImportDeclaration());
              if (firstImport) {
                firstImport.insertBefore(fallbackImport);
              } else {
                programPath.unshiftContainer("body", fallbackImport);
              }
            }

            if (!hasPrepareImport) {
              const specifier = t.importSpecifier(
                t.identifier("prepareEffects"),
                t.identifier("prepareEffects")
              );
              const fallbackImport = t.importDeclaration(
                [specifier],
                t.stringLiteral(RUNTIME_MODULE)
              );
              const firstImport = programPath
                .get("body")
                .find((child) => child.isImportDeclaration());
              if (firstImport) {
                firstImport.insertBefore(fallbackImport);
              } else {
                programPath.unshiftContainer("body", fallbackImport);
              }
            }
          },
        },
        ImportDeclaration(path, state) {
          if (!state.importSources.includes(path.node.source.value)) return;
          path.node.specifiers.forEach((specifier) => {
            if (t.isImportSpecifier(specifier) && specifier.imported.name === hookName) {
              state.reactHookLocals.set(specifier.local.name, true);
            } else if (
              t.isImportNamespaceSpecifier(specifier) ||
              t.isImportDefaultSpecifier(specifier)
            ) {
              state.reactNamespaceBindings.add(specifier.local.name);
            }
          });
        },
        Function: {
          enter(path, state) {
            if (
              path.isClassMethod({ kind: "method" }) &&
              t.isIdentifier(path.node.key, { name: "render" }) &&
              !state.allowEventAttributes
            ) {
              assertNoReactEventAttributes(path, t, eventAttributeErrorMessage);
            }
          },
          exit(path, state) {
            if (
              path.isClassMethod({ kind: "method" }) &&
              t.isIdentifier(path.node.key, { name: "render" }) &&
              state.renderMethodsNeedingPrepare.has(path)
            ) {
              const inserted = ensurePrepareEffectsCall(path, t);
              if (inserted) {
                state.prepareImportNeeded = true;
              }
            }
          },
        },
        CallExpression(path, state) {
          const callee = path.get("callee");
          let shouldTransform = false;

          if (callee.isIdentifier()) {
            const bindingName = callee.node.name;
            if (state.reactHookLocals.has(bindingName)) {
              shouldTransform = true;
            } else {
              return;
            }
          } else if (callee.isMemberExpression({ computed: false })) {
            const object = callee.get("object");
            const property = callee.get("property");
            if (
              object.isIdentifier() &&
              state.reactNamespaceBindings.has(object.node.name) &&
              property.isIdentifier({ name: hookName })
            ) {
              shouldTransform = true;
            } else {
              return;
            }
          } else {
            return;
          }

          const hostInfo = resolveHostInfo(path, t);
          if (!hostInfo) {
            state.pendingCalls.push(path);
            return;
          }

          transformUseStateCall(path, state, hostInfo, t);
        },
      },
    };
  };
}
