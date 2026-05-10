import { resolveHostInfo } from "./custom-hook-host.js";
import { ensureRuntimeNamedImports } from "./runtime-imports.js";
let t;

const RUNTIME_MODULE = "@litsx/litsx";

function ensureRuntimeImport(programPath, importedName, localName, t) {
  const runtimeImports = programPath
    .get("body")
    .filter(
      (child) => child.isImportDeclaration() && child.node.source.value === RUNTIME_MODULE
    );

  let targetImport = runtimeImports.find(
    (path) => !path.node.specifiers.some((spec) => t.isImportNamespaceSpecifier(spec))
  );

  if (!targetImport) {
    const specifier =
      importedName === localName
        ? t.importSpecifier(t.identifier(localName), t.identifier(importedName))
        : t.importSpecifier(t.identifier(localName), t.identifier(importedName));

    const importDecl = t.importDeclaration([specifier], t.stringLiteral(RUNTIME_MODULE));
    const [firstImport] = programPath
      .get("body")
      .filter((child) => child.isImportDeclaration());

    if (runtimeImports.length === 0) {
      if (firstImport) {
        firstImport.insertBefore(importDecl);
      } else {
        programPath.unshiftContainer("body", importDecl);
      }
      return;
    }

    runtimeImports[0].insertAfter(importDecl);
    return;
  }

  const hasSpecifier = targetImport.node.specifiers.some(
    (spec) =>
      t.isImportSpecifier(spec) &&
      t.isIdentifier(spec.imported, { name: importedName }) &&
      t.isIdentifier(spec.local, { name: localName })
  );

  if (hasSpecifier) return;

  targetImport.node.specifiers.push(
    t.importSpecifier(t.identifier(localName), t.identifier(importedName))
  );
}

function createGetter(name) {
  const selectorLiteral = t.stringLiteral(`[data-ref="${name}"]`);

  const renderRootQuery = t.optionalCallExpression(
    t.optionalMemberExpression(
      t.memberExpression(t.thisExpression(), t.identifier("renderRoot")),
      t.identifier("querySelector"),
      false,
      true
    ),
    [selectorLiteral],
    false
  );

  const hostQuery = t.callExpression(
    t.memberExpression(t.thisExpression(), t.identifier("querySelector")),
    [t.cloneNode(selectorLiteral)]
  );

  return t.classMethod(
    "get",
    t.identifier(name),
    [],
    t.blockStatement([
      t.returnStatement(
        t.logicalExpression("??", renderRootQuery, hostQuery)
      ),
    ])
  );
}

function ensureGetter(classPath, name) {
  const classBody = classPath.get("body.body");

  const hasGetter = classBody.some(
    (memberPath) =>
      memberPath.isClassMethod({ kind: "get" }) &&
      t.isIdentifier(memberPath.node.key, { name })
  );

  if (hasGetter) return;

  const renderPath = classBody.find(
    (memberPath) =>
      memberPath.isClassMethod() &&
      t.isIdentifier(memberPath.node.key, { name: "render" })
  );

  if (renderPath) {
    renderPath.insertBefore(createGetter(name));
    return;
  }

  classPath.get("body").pushContainer("body", createGetter(name));
}

function isComponentJsxName(nameNode) {
  if (t.isJSXMemberExpression(nameNode)) {
    return true;
  }

  if (!t.isJSXIdentifier(nameNode)) {
    return false;
  }

  const name = nameNode.name || "";
  return Boolean(name) && (
    name[0] === name[0].toUpperCase() ||
    name.includes("-")
  );
}

function isComponentRefAttribute(attrPath) {
  const openingElement = attrPath.parentPath;
  if (!openingElement?.isJSXOpeningElement()) {
    return false;
  }

  return isComponentJsxName(openingElement.node.name);
}

function getComponentRefAttributeName(attrPath) {
  void attrPath;
  return ".ref";
}

function getSupportedHookImportLocal(calleePath, scope, importSources, supportedHookNames, t) {
  if (!calleePath.isIdentifier()) {
    return null;
  }

  const binding = scope.getBinding(calleePath.node.name);
  if (!binding || !binding.path.isImportSpecifier()) {
    return null;
  }

  const importDecl = binding.path.parentPath;
  if (!importDecl?.isImportDeclaration()) {
    return null;
  }

  if (!importSources.includes(importDecl.node.source.value)) {
    return null;
  }

  const imported = binding.path.node.imported;
  if (!t.isIdentifier(imported) || !supportedHookNames.includes(imported.name)) {
    return null;
  }

  return binding.path.node.local.name;
}

function transformMutableRefCall(callPath, state, hostInfo, t) {
  const calleePath = callPath.get("callee");
  const importedLocalName = getSupportedHookImportLocal(
    calleePath,
    callPath.scope,
    state.importSources,
    state.supportedHookNames,
    t
  );
  if (!importedLocalName) {
    return;
  }

  const existingArgs = callPath.node.arguments;
  const hostExprClone = t.cloneNode(hostInfo.expression, true);

  if (!state.loweredMutableRuntimeLocals) {
    state.loweredMutableRuntimeLocals = new Set();
  }
  state.loweredMutableRuntimeLocals.add(importedLocalName);

  if (
    existingArgs.length > 0 &&
    t.isNodesEquivalent(existingArgs[0], hostExprClone)
  ) {
    callPath.node.__litsxMutableRefLowered = true;
    return;
  }

  const runtimeCallee = t.identifier(importedLocalName);
  const nextArgs = [hostExprClone, ...existingArgs.map((arg) => t.cloneNode(arg, true))];
  const runtimeCall = t.callExpression(runtimeCallee, nextArgs);
  runtimeCall.__litsxMutableRefLowered = true;

  callPath.replaceWith(runtimeCall);
  callPath.skip();
}

function processPendingMutableRefCalls(state, t) {
  if (!Array.isArray(state.pendingMutableCalls) || state.pendingMutableCalls.length === 0) {
    return;
  }

  for (const callPath of state.pendingMutableCalls) {
    if (!callPath.node) continue;
    const hostInfo = resolveHostInfo(callPath, t);
    if (!hostInfo) {
      throw callPath.buildCodeFrameError(
        "create-use-ref-transform: unable to resolve host for useRef inside custom hook"
      );
    }
    transformMutableRefCall(callPath, state, hostInfo, t);
  }

  state.pendingMutableCalls.length = 0;
}

function hasQuotedRefAttributeSuffix(value) {
  return /(^|[\s<])ref="$/.test(value);
}

function hasBareRefAttributeSuffix(value) {
  return /(^|[\s<])ref=$/.test(value);
}

function replaceTemplateCallbackRef(templatePath, index, refName) {
  const { quasis, expressions } = templatePath.node.quasi;
  const previous = quasis[index];
  const next = quasis[index + 1];
  if (!previous || !next) return false;

  const replacement = `data-ref="${refName}"`;
  const prevRaw = previous.value.raw;
  const prevCooked = previous.value.cooked;
  const nextRaw = next.value.raw;
  const nextCooked = next.value.cooked;

  const hasQuotedPrefix = hasQuotedRefAttributeSuffix(prevRaw);
  const hasBarePrefix = hasBareRefAttributeSuffix(prevRaw) || hasBareRefAttributeSuffix(prevCooked);
  if (!hasQuotedPrefix && !hasBarePrefix) return false;

  const rawPattern = hasQuotedPrefix ? /ref="$/ : /ref=$/;
  const cookedPattern = hasQuotedPrefix ? /ref="$/ : /ref=$/;

  const replacedRaw = prevRaw.replace(rawPattern, replacement);
  const replacedCooked = prevCooked.replace(cookedPattern, replacement);

  let trimmedNextRaw = nextRaw;
  let trimmedNextCooked = nextCooked;

  if (hasQuotedPrefix && nextRaw.startsWith('"')) {
    trimmedNextRaw = nextRaw.slice(1);
    trimmedNextCooked = nextCooked.slice(1);
  }

  previous.value.raw = replacedRaw + trimmedNextRaw;
  previous.value.cooked = replacedCooked + trimmedNextCooked;

  expressions.splice(index, 1);
  quasis.splice(index + 1, 1);
  return true;
}

function replaceTemplateRef(classPath, refName) {
  return replaceTemplateRefWithName(classPath, refName, refName);
}

function isHtmlTemplateRefExpression(refPath) {
  const taggedTemplatePath = refPath.findParent((path) => path.isTaggedTemplateExpression());
  if (!taggedTemplatePath || !t.isIdentifier(taggedTemplatePath.node.tag, { name: "html" })) {
    return false;
  }

  const templateLiteral = taggedTemplatePath.node.quasi;
  const expressionIndex = templateLiteral.expressions.indexOf(refPath.node);
  if (expressionIndex === -1) return false;

  const previous = templateLiteral.quasis[expressionIndex];
  if (!previous) return false;

  const prevRaw = previous.value.raw;
  const prevCooked = previous.value.cooked;

  return (
    hasQuotedRefAttributeSuffix(prevRaw) ||
    hasBareRefAttributeSuffix(prevRaw) ||
    hasQuotedRefAttributeSuffix(prevCooked) ||
    hasBareRefAttributeSuffix(prevCooked)
  );
}

function hasTemplateRef(classPath, refName) {
  let found = false;

  classPath.traverse({
    Identifier(path) {
      if (found || !path.isIdentifier({ name: refName })) return;
      if (!isHtmlTemplateRefExpression(path)) return;
      found = true;
      path.stop();
    },
    MemberExpression(path) {
      if (found) return;
      if (
        t.isThisExpression(path.node.object) &&
        t.isIdentifier(path.node.property, { name: refName }) &&
        isHtmlTemplateRefExpression(path)
      ) {
        found = true;
        path.stop();
      }
    },
  });

  return found;
}

function replaceTemplateRefWithName(classPath, refName, replacementName) {
  let replaced = false;

  classPath.traverse({
    TaggedTemplateExpression(path) {
      if (!t.isIdentifier(path.node.tag, { name: "html" })) return;

      const { quasis, expressions } = path.node.quasi;

      for (let index = 0; index < expressions.length; index += 1) {
        const expression = expressions[index];

        let matchesRef = false;
        if (t.isIdentifier(expression, { name: refName })) {
          matchesRef = true;
        } else if (
          t.isMemberExpression(expression) &&
          t.isThisExpression(expression.object) &&
          t.isIdentifier(expression.property, { name: refName })
        ) {
          matchesRef = true;
        }

        if (!matchesRef) continue;

        const previous = quasis[index];
        const next = quasis[index + 1];
        if (!previous || !next) continue;

        const replacement = `data-ref="${replacementName}"`;
        const prevRaw = previous.value.raw;
        const prevCooked = previous.value.cooked;
        const nextRaw = next.value.raw;
        const nextCooked = next.value.cooked;

        const hasQuotedPrefix = hasQuotedRefAttributeSuffix(prevRaw);
        const hasBarePrefix = hasBareRefAttributeSuffix(prevRaw) || hasBareRefAttributeSuffix(prevCooked);
        if (!hasQuotedPrefix && !hasBarePrefix) continue;

        const rawPattern = hasQuotedPrefix ? /ref="$/ : /ref=$/;
        const cookedPattern = hasQuotedPrefix ? /ref="$/ : /ref=$/;

        const replacedRaw = prevRaw.replace(rawPattern, replacement);
        const replacedCooked = prevCooked.replace(cookedPattern, replacement);

        let trimmedNextRaw = nextRaw;
        let trimmedNextCooked = nextCooked;

        if (hasQuotedPrefix && nextRaw.startsWith('"')) {
          trimmedNextRaw = nextRaw.slice(1);
          trimmedNextCooked = nextCooked.slice(1);
        }

        previous.value.raw = replacedRaw + trimmedNextRaw;
        previous.value.cooked = replacedCooked + trimmedNextCooked;

        expressions.splice(index, 1);
        quasis.splice(index + 1, 1);
        index -= 1;
        replaced = true;
      }
    },
  });

  return replaced;
}

function analyzeRefUsage(referencePaths, refName) {
  let hasCurrentWrite = false;
  let hasOpaqueUsage = false;

  for (const refPath of referencePaths) {
    if (!refPath.node || refPath.removed) continue;

    const parentPath = refPath.parentPath;
    const attrPath = parentPath && parentPath.isJSXExpressionContainer()
      ? parentPath.parentPath
      : null;

    const isRefAttribute =
      attrPath &&
      attrPath.isJSXAttribute() &&
      t.isJSXIdentifier(attrPath.node.name, { name: "ref" });

    if (isRefAttribute) {
      continue;
    }

    if (isHtmlTemplateRefExpression(refPath)) {
      continue;
    }

    if (
      parentPath &&
      (parentPath.isMemberExpression() || parentPath.isOptionalMemberExpression()) &&
      parentPath.node.property &&
      t.isIdentifier(parentPath.node.property, { name: "current" }) &&
      !parentPath.node.computed
    ) {
      const container = parentPath.parentPath;
      if (
        (container.isAssignmentExpression() && container.node.left === parentPath.node) ||
        container.isUpdateExpression() ||
        (container.isUnaryExpression() && container.node.operator === "delete")
      ) {
        hasCurrentWrite = true;
      }
      continue;
    }

    if (refPath.isIdentifier({ name: refName })) {
      hasOpaqueUsage = true;
    }
  }

  return { hasCurrentWrite, hasOpaqueUsage };
}

export function createUseRefTransform({
  importSource,
  hookName,
  hookNames,
  pluginName,
  pendingPropertyKey = "_litsxPendingRefs",
  onlyManagedDomRefs = false,
} = {}) {
  const importSources = Array.isArray(importSource) ? importSource : [importSource];
  const supportedHookNames = Array.isArray(hookNames) && hookNames.length > 0
    ? hookNames
    : hookName
      ? [hookName]
      : [];
  if (importSources.length === 0 || importSources.some((value) => typeof value !== "string" || value.length === 0)) {
    throw new Error("createUseRefTransform requires importSource (string or string[]), hookName, and pluginName.");
  }
  if (supportedHookNames.length === 0 || !pluginName) {
    throw new Error("createUseRefTransform requires importSource, hookName, and pluginName.");
  }

  return function useRefTransform(api) {
    api.assertVersion(7);
    t = api.types;

    function transformHook(declaratorPath, classPath, state) {
      const id = declaratorPath.node.id;
      if (!t.isIdentifier(id)) return;

      const refName = id.name;
      const init = declaratorPath.node.init;

      if (
        !t.isCallExpression(init) ||
        !t.isIdentifier(init.callee) ||
        !supportedHookNames.includes(init.callee.name)
      ) {
        return;
      }

      const binding = declaratorPath.scope.getBinding(refName);
      if (!binding) return;

      const referencePaths = [...binding.referencePaths];
      const { hasCurrentWrite, hasOpaqueUsage } = analyzeRefUsage(referencePaths, refName);
      const elementRefAttributePaths = [];
      const componentRefAttributePaths = [];
      let renderMethodPath = null;
      let templateHasRef = false;

      if (classPath) {
        renderMethodPath = classPath.get("body.body").find(
          (memberPath) =>
            memberPath.isClassMethod({ kind: "method" }) &&
            t.isIdentifier(memberPath.node.key, { name: "render" })
        );
        templateHasRef = hasTemplateRef(classPath, refName);
      }

      referencePaths.forEach((refPath) => {
        if (!refPath.node || refPath.removed) return;

        const parentPath = refPath.parentPath;
        const attrPath = parentPath && parentPath.isJSXExpressionContainer()
          ? parentPath.parentPath
          : null;

        const isRefAttribute =
          attrPath &&
          attrPath.isJSXAttribute() &&
          t.isJSXIdentifier(attrPath.node.name, { name: "ref" });

        if (isRefAttribute) {
          const value = attrPath.node.value;
          if (t.isJSXExpressionContainer(value) && t.isIdentifier(value.expression, { name: refName })) {
            if (isComponentRefAttribute(attrPath)) {
              componentRefAttributePaths.push(attrPath);
            } else {
              elementRefAttributePaths.push(attrPath);
            }
          }
        }
      });

      componentRefAttributePaths.forEach((attrPath) => {
        attrPath.node.name = t.jsxIdentifier(getComponentRefAttributeName(attrPath));
      });

      const foundRefAttribute = elementRefAttributePaths.length > 0;

      const usedAsElement = Boolean(classPath) && (foundRefAttribute || templateHasRef);

      if (usedAsElement) {
        const managedRefName = classPath.scope.generateUidIdentifier(`${refName}Element`).name;

        elementRefAttributePaths.forEach((attrPath) => {
          attrPath.replaceWith(
            t.jsxAttribute(
              t.jsxIdentifier("data-ref"),
              t.stringLiteral(managedRefName)
            )
          );
        });
        if (templateHasRef) {
          replaceTemplateRefWithName(classPath, refName, managedRefName);
        }

        ensureGetter(classPath, managedRefName);

        const pendingList = classPath.node[pendingPropertyKey] || [];
        if (!pendingList.includes(managedRefName)) {
          pendingList.push(managedRefName);
          classPath.node[pendingPropertyKey] = pendingList;
        }

        const initPath = declaratorPath.get("init");
        const hostInfo = resolveHostInfo(initPath, t);
        if (!hostInfo) {
          state.pendingMutableCalls.push(initPath);
        } else {
          transformMutableRefCall(initPath, state, hostInfo, t);
        }

        const declarationPath = declaratorPath.parentPath;
        const callbackStatement = t.expressionStatement(
          t.callExpression(t.identifier(state.callbackRuntimeLocalName), [
            t.thisExpression(),
            t.arrowFunctionExpression(
              [],
              t.memberExpression(t.thisExpression(), t.identifier(managedRefName))
            ),
            t.arrowFunctionExpression(
              [t.identifier("node")],
              t.assignmentExpression(
                "=",
                t.memberExpression(t.identifier(refName), t.identifier("current")),
                t.identifier("node")
              )
            ),
          ])
        );
        if (declarationPath.isVariableDeclaration()) {
          declarationPath.insertAfter(callbackStatement);
        } else if (renderMethodPath) {
          const bodyPath = renderMethodPath.get("body");
          if (bodyPath.isBlockStatement()) {
            bodyPath.unshiftContainer("body", callbackStatement);
          }
        }

        state.callbackRuntimeNeeded = true;

        return;
      }

      if (onlyManagedDomRefs) {
        return;
      }

      const initPath = declaratorPath.get("init");
      const hostInfo = resolveHostInfo(initPath, t);
      if (!hostInfo) {
        state.pendingMutableCalls.push(initPath);
      } else {
        transformMutableRefCall(initPath, state, hostInfo, t);
      }

    }

    return {
      name: pluginName,
      visitor: {
        Program: {
          enter(programPath, state) {
            state.programPath = programPath;
            state.importSources = importSources;
            state.supportedHookNames = supportedHookNames;
            state.enforceSupportedUsage = !importSources.every((source) => source === RUNTIME_MODULE);
            state.loweredMutableRuntimeLocals = new Set();
            state.mutableRuntimeImportLocals = new Set();
            state.pendingMutableCalls = [];
            state.callbackRuntimeLocalName = programPath.scope.hasBinding("useCallbackRef")
              ? programPath.scope.generateUid("useCallbackRef")
              : "useCallbackRef";
            state.callbackRuntimeNeeded = false;
          },
          exit(programPath, state) {
            processPendingMutableRefCalls(state, t);
            programPath.traverse({
              ClassDeclaration(classPath) {
                const pendingList = classPath.node[pendingPropertyKey];
                if (!pendingList || pendingList.length === 0) return;

                pendingList.forEach((refName) => {
                  replaceTemplateRef(classPath, refName);
                });

                delete classPath.node[pendingPropertyKey];
              },
            });

            programPath.scope.crawl();

            programPath.get("body").forEach((nodePath) => {
              if (
                !nodePath.isImportDeclaration() ||
                !importSources.includes(nodePath.node.source.value)
              ) {
                return;
              }

              nodePath.get("specifiers").forEach((specifierPath) => {
                if (!specifierPath.isImportSpecifier()) return;

                const imported = specifierPath.node.imported;
                if (!t.isIdentifier(imported) || !supportedHookNames.includes(imported.name)) return;

                const localName = specifierPath.node.local.name;
                const binding = specifierPath.scope.getBinding(localName);

                if (!binding) return;

                const liveReferences = binding.referencePaths.filter(
                  (refPath) => !refPath.removed && refPath.node
                );

                if (liveReferences.length === 0) {
                  specifierPath.remove();
                  return;
                }

                const loweredReferences = liveReferences.filter((refPath) => {
                  const parentPath = refPath.parentPath;
                  return (
                    parentPath?.isCallExpression() &&
                    parentPath.node.callee === refPath.node &&
                    parentPath.node.__litsxMutableRefLowered === true
                  );
                });

                if (loweredReferences.length === 0) {
                  if (state.enforceSupportedUsage) {
                    throw liveReferences[0].buildCodeFrameError(
                      `create-use-ref-transform: unsupported ${localName}() usage outside a render method or custom hook`
                    );
                  }
                  return;
                }

                if (loweredReferences.length === liveReferences.length) {
                  specifierPath.remove();
                  state.mutableRuntimeImportLocals.add(localName);
                  return;
                }

                const unresolvedReferences = liveReferences.filter(
                  (refPath) => !loweredReferences.includes(refPath)
                );
                const [firstUnresolved] = unresolvedReferences;
                if (state.enforceSupportedUsage) {
                  throw firstUnresolved.buildCodeFrameError(
                    `create-use-ref-transform: unsupported ${localName}() usage outside a render method or custom hook`
                  );
                }
              });

              if (nodePath.node.specifiers.length === 0) {
                nodePath.remove();
              }
            });

            if (state.mutableRuntimeImportLocals.size > 0) {
              Array.from(state.mutableRuntimeImportLocals).forEach((localName) => {
                ensureRuntimeImport(
                  programPath,
                  "useRef",
                  localName,
                  t
                );
              });
            }

            if (state.callbackRuntimeNeeded) {
              if (state.callbackRuntimeLocalName === "useCallbackRef") {
                ensureRuntimeNamedImports(programPath, RUNTIME_MODULE, ["useCallbackRef"], t);
              } else {
                ensureRuntimeImport(
                  programPath,
                  "useCallbackRef",
                  state.callbackRuntimeLocalName,
                  t
                );
              }
            }
          },
        },
        ClassMethod(methodPath, state) {
          if (!t.isIdentifier(methodPath.node.key, { name: "render" })) return;
          const classPath = methodPath.findParent((parent) => parent.isClassDeclaration());
          methodPath.traverse({
            JSXAttribute(attrPath) {
              if (!t.isJSXIdentifier(attrPath.node.name, { name: "ref" })) return;
              const value = attrPath.node.value;
              if (!t.isJSXExpressionContainer(value)) return;
              const expr = value.expression;
              if (!t.isArrowFunctionExpression(expr) && !t.isFunctionExpression(expr)) return;

              if (!classPath) return;

              if (isComponentRefAttribute(attrPath)) {
                attrPath.node.name = t.jsxIdentifier(getComponentRefAttributeName(attrPath));
                return;
              }

              const renderBody = methodPath.get("body");
              if (!renderBody.isBlockStatement()) return;

              const refIdentifier = methodPath.scope.generateUidIdentifier("ref");
              const refName = refIdentifier.name;

              attrPath.replaceWith(
                t.jsxAttribute(t.jsxIdentifier("data-ref"), t.stringLiteral(refName))
              );

              ensureGetter(classPath, refName);

              renderBody.unshiftContainer("body",
                t.expressionStatement(
                  t.callExpression(t.identifier(state.callbackRuntimeLocalName), [
                    t.thisExpression(),
                    t.arrowFunctionExpression([], t.memberExpression(t.thisExpression(), t.identifier(refName))),
                    t.cloneNode(expr, true),
                  ])
                )
              );

              state.callbackRuntimeNeeded = true;
            },
            TaggedTemplateExpression(templatePath) {
              if (!t.isIdentifier(templatePath.node.tag, { name: "html" })) return;
              const { expressions } = templatePath.node.quasi;
              for (let index = expressions.length - 1; index >= 0; index -= 1) {
                const expression = expressions[index];
                if (!t.isArrowFunctionExpression(expression) && !t.isFunctionExpression(expression)) {
                  continue;
                }
                if (!classPath) return;
                const renderBody = methodPath.get("body");
                if (!renderBody.isBlockStatement()) return;

                const refIdentifier = methodPath.scope.generateUidIdentifier("ref");
                const refName = refIdentifier.name;

                if (!replaceTemplateCallbackRef(templatePath, index, refName)) {
                  continue;
                }

                ensureGetter(classPath, refName);

                renderBody.unshiftContainer("body",
                  t.expressionStatement(
                    t.callExpression(t.identifier(state.callbackRuntimeLocalName), [
                      t.thisExpression(),
                      t.arrowFunctionExpression([], t.memberExpression(t.thisExpression(), t.identifier(refName))),
                      t.cloneNode(expression, true),
                    ])
                  )
                );

                state.callbackRuntimeNeeded = true;
              }
            },
          });
        },

        VariableDeclarator(path, state) {
          const id = path.node.id;
          if (!t.isIdentifier(id)) return;

          const init = path.node.init;
          if (
            !t.isCallExpression(init) ||
            !getSupportedHookImportLocal(
              path.get("init.callee"),
              path.scope,
              importSources,
              supportedHookNames,
              t
            )
          ) {
            return;
          }

          const classPath = path.findParent((parent) => parent.isClassDeclaration());
          transformHook(path, classPath || null, state);
        },
      },
    };
  };
}
