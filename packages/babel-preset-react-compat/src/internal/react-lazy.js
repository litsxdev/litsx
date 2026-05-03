import helperPluginUtils from "@babel/helper-plugin-utils";
import jsxSyntaxPlugin from "@babel/plugin-syntax-jsx";
import { isLitElementSuperClass } from "@litsx/babel-plugin-shared-hooks";

const { declare } = helperPluginUtils;
const RUNTIME_MODULE = "@litsx/litsx";
const INFRASTRUCTURE_MODULE = "@litsx/litsx/runtime-infrastructure";

export default declare((api) => {
  api.assertVersion(7);
  const t = api.types;

  function toKebab(name) {
    return name.replace(/([a-z])([A-Z])/g, "$1-$2").toLowerCase();
  }

  function isScopedElementsWrapped(superClass) {
    return (
      t.isCallExpression(superClass) &&
      t.isIdentifier(superClass.callee) &&
      (superClass.callee.name === "ShadowDomElementsMixin" ||
        superClass.callee.name === "LightDomElementsMixin")
    );
  }

  function getExpressionKey(node) {
    if (t.isIdentifier(node)) {
      return node.name;
    }
    if (t.isMemberExpression(node) && !node.computed) {
      const objectKey = getExpressionKey(node.object);
      const propertyKey = t.isIdentifier(node.property) ? node.property.name : null;
      if (!objectKey || !propertyKey) return null;
      return `${objectKey}.${propertyKey}`;
    }
    return null;
  }

  function cloneMarked(node) {
    const cloned = t.cloneNode(node, true);
    cloned.__litsxLazyOrigin = true;
    return cloned;
  }

  function isLazyCallee(path, state) {
    const callee = path.get("callee");

    if (callee.isIdentifier()) {
      return state.lazyLocalNames.has(callee.node.name);
    }

    if (callee.isMemberExpression({ computed: false })) {
      const object = callee.get("object");
      const property = callee.get("property");
      return (
        object.isIdentifier() &&
        state.reactNamespaceNames.has(object.node.name) &&
        property.isIdentifier({ name: "lazy" })
      );
    }

    return false;
  }

  function getReturnedExpression(node) {
    if (t.isArrowFunctionExpression(node) && t.isExpression(node.body)) {
      return node.body;
    }

    if (
      (t.isArrowFunctionExpression(node) || t.isFunctionExpression(node)) &&
      t.isBlockStatement(node.body)
    ) {
      const returnStatement = node.body.body.find((statement) =>
        t.isReturnStatement(statement)
      );
      return returnStatement?.argument ?? null;
    }

    return null;
  }

  function isImportCall(node) {
    return t.isCallExpression(node) && t.isImport(node.callee);
  }

  function isLoaderLike(node) {
    if (!node) return false;

    if (t.isArrowFunctionExpression(node) || t.isFunctionExpression(node)) {
      return isLoaderLike(getReturnedExpression(node));
    }

    if (isImportCall(node)) {
      return true;
    }

    if (t.isCallExpression(node) && t.isMemberExpression(node.callee)) {
      return isLoaderLike(node.callee.object);
    }

    if (t.isConditionalExpression(node)) {
      return isLoaderLike(node.consequent) || isLoaderLike(node.alternate);
    }

    return false;
  }

  function buildRuntimeImport(programPath, state) {
    if (!state.runtimeNeeded) {
      return;
    }

    const bodyPaths = programPath.get("body");
    const existingNamedImport = bodyPaths.find(
      (child) =>
        child.isImportDeclaration() &&
        child.node.source.value === RUNTIME_MODULE &&
        child.node.specifiers.some((specifier) => t.isImportSpecifier(specifier))
    );
    const existingNamespaceImport = bodyPaths.find(
      (child) =>
        child.isImportDeclaration() &&
        child.node.source.value === RUNTIME_MODULE &&
        child.node.specifiers.some((specifier) => t.isImportNamespaceSpecifier(specifier))
    );

    if (existingNamedImport) {
      const present = new Set(
        existingNamedImport.node.specifiers
          .filter((specifier) => t.isImportSpecifier(specifier))
          .map((specifier) => specifier.imported.name)
      );

      if (!present.has("ensureLazyElement")) {
        existingNamedImport.node.specifiers.push(
          t.importSpecifier(
            t.identifier("ensureLazyElement"),
            t.identifier("ensureLazyElement")
          )
        );
      }
      return;
    }

    const importDecl = t.importDeclaration(
      [
        t.importSpecifier(
          t.identifier("ensureLazyElement"),
          t.identifier("ensureLazyElement")
        ),
      ],
      t.stringLiteral(RUNTIME_MODULE)
    );

    if (existingNamespaceImport) {
      existingNamespaceImport.insertAfter(importDecl);
      return;
    }

    const firstImport = bodyPaths.find((child) => child.isImportDeclaration());
    if (firstImport) {
      firstImport.insertBefore(importDecl);
    } else {
      programPath.unshiftContainer("body", importDecl);
    }
  }

  function ensureElementsMixinImport(programPath, mixinName) {
    const bodyPaths = programPath.get("body");
    const existingImport = bodyPaths.find(
      (child) =>
        child.isImportDeclaration() &&
        child.node.source.value === INFRASTRUCTURE_MODULE
    );

    if (existingImport) {
      const hasSpecifier = existingImport.node.specifiers.some(
        (specifier) =>
          t.isImportSpecifier(specifier) &&
          t.isIdentifier(specifier.imported, { name: mixinName })
      );

      if (!hasSpecifier) {
        existingImport.node.specifiers.push(
          t.importSpecifier(t.identifier(mixinName), t.identifier(mixinName))
        );
      }
      return;
    }

    const importDecl = t.importDeclaration(
      [t.importSpecifier(t.identifier(mixinName), t.identifier(mixinName))],
      t.stringLiteral(INFRASTRUCTURE_MODULE)
    );

    const firstImport = bodyPaths.find((child) => child.isImportDeclaration());
    if (firstImport) {
      firstImport.insertBefore(importDecl);
    } else {
      programPath.unshiftContainer("body", importDecl);
    }
  }

  function ensureRequirementBucket(renderPath, state) {
    if (!state.renderRequirements) {
      state.renderRequirements = new WeakMap();
    }
    let requirements = state.renderRequirements.get(renderPath.node);
    if (!requirements) {
      requirements = new Map();
      state.renderRequirements.set(renderPath.node, requirements);
    }
    return requirements;
  }

  function buildEnsureStatement(tag, expression) {
    return t.expressionStatement(
      t.callExpression(t.identifier("ensureLazyElement"), [
        t.thisExpression(),
        t.stringLiteral(tag),
        t.cloneNode(expression, true),
      ])
    );
  }

  function collectRenderedTagsFromNode(node, tags = new Set()) {
    if (!node) return tags;

    if (Array.isArray(node)) {
      node.forEach((child) => collectRenderedTagsFromNode(child, tags));
      return tags;
    }

    if (t.isJSXElement(node)) {
      collectRenderedTagsFromNode(node.openingElement, tags);
      collectRenderedTagsFromNode(node.children, tags);
      return tags;
    }

    if (t.isJSXOpeningElement(node)) {
      if (t.isJSXIdentifier(node.name) && node.name.name.includes("-")) {
        tags.add(node.name.name);
      }
      return tags;
    }

    if (t.isJSXFragment(node)) {
      collectRenderedTagsFromNode(node.children, tags);
      return tags;
    }

    if (t.isJSXExpressionContainer(node)) {
      collectRenderedTagsFromNode(node.expression, tags);
      return tags;
    }

    return tags;
  }

  function convertArrowBodyToBlock(arrowPath, statements) {
    const body = arrowPath.node.body;
    if (t.isBlockStatement(body)) {
      body.body.unshift(...statements);
      return;
    }

    arrowPath.node.body = t.blockStatement([
      ...statements,
      t.returnStatement(body),
    ]);
  }

  function moveRequirementsIntoSuspenseBoundaries(renderPath, requirements) {
    if (requirements.size === 0) {
      return;
    }

    renderPath.traverse({
      JSXOpeningElement(path) {
        if (
          !t.isJSXIdentifier(path.node.name, { name: "suspense-boundary" }) &&
          !t.isJSXIdentifier(path.node.name, { name: "SuspenseBoundary" })
        ) {
          return;
        }

        const contentRendererAttr = path.node.attributes.find(
          (attribute) =>
            t.isJSXAttribute(attribute) &&
            t.isJSXIdentifier(attribute.name, { name: ".contentRenderer" }) &&
            t.isJSXExpressionContainer(attribute.value)
        );

        if (!contentRendererAttr) return;
        if (!t.isArrowFunctionExpression(contentRendererAttr.value.expression)) {
          return;
        }

        const contentRendererPath = path
          .get("attributes")
          .find(
            (attributePath) =>
              attributePath.isJSXAttribute() &&
              t.isJSXIdentifier(attributePath.node.name, {
                name: ".contentRenderer",
              })
          );

        if (!contentRendererPath) return;

        const expressionPath = contentRendererPath.get("value.expression");
        if (!expressionPath.isArrowFunctionExpression()) return;

        const tags = collectRenderedTagsFromNode(expressionPath.node.body);
        const moved = [];

        for (const [key, requirement] of requirements) {
          if (!tags.has(requirement.tag)) continue;
          moved.push(buildEnsureStatement(requirement.tag, requirement.expression));
          requirements.delete(key);
        }

        if (moved.length > 0) {
          convertArrowBodyToBlock(expressionPath, moved);
        }
      },
    });
  }

  function injectEnsureStatements(renderPath, state) {
    const requirements = state.renderRequirements?.get(renderPath.node);
    if (!requirements || requirements.size === 0) {
      return;
    }

    const classPath = renderPath.findParent((path) => path.isClassDeclaration() || path.isClassExpression());
    if (classPath) {
      classPath.node._needsElementsRegistry = true;
      if (
        isLitElementSuperClass(classPath.node.superClass, t) &&
        !isScopedElementsWrapped(classPath.node.superClass)
      ) {
        const mixinName = classPath.node._litsxLightDom
          ? "LightDomElementsMixin"
          : "ShadowDomElementsMixin";
        ensureElementsMixinImport(
          renderPath.findParent((path) => path.isProgram()),
          mixinName,
        );
        classPath.node.superClass = t.callExpression(
          t.identifier(mixinName),
          [classPath.node.superClass]
        );
      }
    }

    moveRequirementsIntoSuspenseBoundaries(renderPath, requirements);

    if (requirements.size === 0) {
      state.runtimeNeeded = true;
      return;
    }

    const bodyPath = renderPath.get("body");
    if (!bodyPath.isBlockStatement()) return;

    const bodyStatements = bodyPath.get("body");
    let insertIndex = 0;

    if (bodyStatements.length > 0) {
      const first = bodyStatements[0];
      if (
        first.isExpressionStatement() &&
        t.isCallExpression(first.node.expression) &&
        t.isIdentifier(first.node.expression.callee, { name: "prepareEffects" }) &&
        first.node.expression.arguments.length === 1 &&
        t.isThisExpression(first.node.expression.arguments[0])
      ) {
        insertIndex = 1;
      }
    }

    const firstReturnIndex = bodyPath.node.body.findIndex((statement) =>
      t.isReturnStatement(statement)
    );
    if (firstReturnIndex !== -1) {
      insertIndex = Math.max(insertIndex, firstReturnIndex);
    }

    const statements = Array.from(requirements.values()).map(({ tag, expression }) =>
      buildEnsureStatement(tag, expression)
    );

    bodyPath.node.body.splice(insertIndex, 0, ...statements);
    state.runtimeNeeded = true;
  }

  function resolveObjectProperty(node, propertyName, scope, state, seen) {
    const objectNode = resolveValueNode(node, scope, state, seen);
    if (!objectNode || !t.isObjectExpression(objectNode)) {
      return null;
    }

    const property = resolveObjectPropertyEntry(objectNode, propertyName);
    if (!property) return null;
    return property.value;
  }

  function resolveObjectPropertyEntry(objectNode, propertyName) {
    return objectNode.properties.find((entry) => {
      if (!t.isObjectProperty(entry) || entry.computed) return false;
      return (
        (t.isIdentifier(entry.key) && entry.key.name === propertyName) ||
        (t.isStringLiteral(entry.key) && entry.key.value === propertyName)
      );
    });
  }

  function resolveFunctionReturnNode(callNode, scope, state, seen) {
    const callee = callNode.callee;
    if (!t.isIdentifier(callee)) {
      return null;
    }

    const binding = scope.getBinding(callee.name);
    if (!binding) return null;
    if (seen.has(binding.path.node)) return null;
    seen.add(binding.path.node);

    let fnNode = null;
    if (binding.path.isFunctionDeclaration()) {
      fnNode = binding.path.node;
    } else if (binding.path.isVariableDeclarator()) {
      const init = binding.path.node.init;
      if (t.isArrowFunctionExpression(init) || t.isFunctionExpression(init)) {
        fnNode = init;
      }
    }

    if (!fnNode) return null;

    if (t.isExpression(fnNode.body)) {
      return fnNode.body;
    }

    if (!t.isBlockStatement(fnNode.body)) return null;

    const returns = [];
    for (const statement of fnNode.body.body) {
      if (t.isReturnStatement(statement)) {
        returns.push(statement.argument ?? t.identifier("undefined"));
        continue;
      }
      if (t.isIfStatement(statement)) {
        collectIfReturns(statement, returns, t);
      }
      if (t.isSwitchStatement(statement)) {
        collectSwitchReturns(statement, returns, t);
      }
    }

    if (returns.length === 0) return null;
    if (returns.length === 1) return returns[0];
    return returns;
  }

  function collectIfReturns(statement, returns, t) {
    const consequent = statement.consequent;
    const alternate = statement.alternate;

    const collect = (node) => {
      if (!node) return;
      if (t.isReturnStatement(node)) {
        returns.push(node.argument ?? t.identifier("undefined"));
        return;
      }
      if (t.isBlockStatement(node)) {
        node.body.forEach((entry) => collect(entry));
        return;
      }
      if (t.isIfStatement(node)) {
        collectIfReturns(node, returns, t);
      }
    };

    collect(consequent);
    collect(alternate);
  }

  function collectSwitchReturns(statement, returns, t) {
    statement.cases.forEach((switchCase) => {
      switchCase.consequent.forEach((entry) => {
        if (t.isReturnStatement(entry)) {
          returns.push(entry.argument ?? t.identifier("undefined"));
        }
      });
    });
  }

  function resolveValueNode(node, scope, state, seen = new Set()) {
    if (!node) return null;
    if (node.__litsxLazyOrigin) return node;
    if (t.isNullLiteral(node)) return node;
    if (t.isIdentifier(node, { name: "undefined" })) return node;
    if (t.isClassExpression(node) || t.isClassDeclaration(node)) return node;
    if (t.isObjectExpression(node)) return node;

    if (t.isIdentifier(node)) {
      const binding = scope.getBinding(node.name);
      if (!binding) return node;
      if (seen.has(binding.path.node)) return null;
      seen.add(binding.path.node);

      if (binding.path.isVariableDeclarator()) {
        return resolveValueNode(binding.path.node.init, binding.path.scope, state, seen);
      }

      if (binding.path.isClassDeclaration()) {
        return binding.path.node;
      }

      return null;
    }

    if (t.isMemberExpression(node) && !node.computed) {
      if (!t.isIdentifier(node.property)) return null;
      return resolveObjectProperty(node.object, node.property.name, scope, state, seen);
    }

    if (t.isConditionalExpression(node)) {
      const consequent = resolveValueNode(node.consequent, scope, state, seen);
      const alternate = resolveValueNode(node.alternate, scope, state, seen);
      return consequent && alternate ? node : null;
    }

    if (t.isCallExpression(node)) {
      if (node.__litsxLazyOrigin) return node;
      const resolved = resolveFunctionReturnNode(node, scope, state, seen);
      if (!resolved) return null;
      if (Array.isArray(resolved)) {
        return resolved.every((entry) => resolveValueNode(entry, scope, state, new Set(seen)))
          ? node
          : null;
      }
      return resolveValueNode(resolved, scope, state, seen) ? node : null;
    }

    return null;
  }

  function hasLazyOrigin(node, scope, state, seen = new Set()) {
    if (!node) return false;
    if (node.__litsxLazyOrigin) return true;

    if (t.isIdentifier(node)) {
      const binding = scope.getBinding(node.name);
      if (!binding) return false;
      if (seen.has(binding.path.node)) return false;
      seen.add(binding.path.node);

      if (binding.path.isVariableDeclarator()) {
        return hasLazyOrigin(binding.path.node.init, binding.path.scope, state, seen);
      }

      return false;
    }

    if (t.isMemberExpression(node) && !node.computed) {
      if (!t.isIdentifier(node.property)) return false;
      const objectNode = resolveValueNode(node.object, scope, state, seen);
      if (!objectNode || !t.isObjectExpression(objectNode)) {
        return false;
      }

      const property = resolveObjectPropertyEntry(objectNode, node.property.name);
      if (!property) return false;
      if (property.__litsxLazyOrigin) return true;
      return hasLazyOrigin(property.value, scope, state, seen);
    }

    if (t.isConditionalExpression(node)) {
      return (
        hasLazyOrigin(node.consequent, scope, state, new Set(seen)) ||
        hasLazyOrigin(node.alternate, scope, state, new Set(seen))
      );
    }

    if (t.isCallExpression(node)) {
      const resolved = resolveFunctionReturnNode(node, scope, state, seen);
      if (!resolved) return false;
      if (Array.isArray(resolved)) {
        return resolved.some((entry) => hasLazyOrigin(entry, scope, state, new Set(seen)));
      }
      return hasLazyOrigin(resolved, scope, state, seen);
    }

    if (isLoaderLike(node)) {
      return true;
    }

    return false;
  }

  function createExpressionFromJSXName(node) {
    if (t.isJSXIdentifier(node)) {
      return t.identifier(node.name);
    }
    if (t.isJSXMemberExpression(node)) {
      return t.memberExpression(
        createExpressionFromJSXName(node.object),
        t.identifier(node.property.name)
      );
    }
    return null;
  }

  function getSpecialMemberAttribute(openingElement) {
    return (openingElement.attributes ?? []).find(
      (attribute) =>
        t.isJSXAttribute(attribute) &&
        t.isJSXIdentifier(attribute.name) &&
        attribute.value == null &&
        attribute.name.name.startsWith(".")
    ) ?? null;
  }

  function getLazyComponentReference(path) {
    const opening = path.node.openingElement;
    if (!opening) return null;

    const specialMemberAttribute = getSpecialMemberAttribute(opening);
    if (specialMemberAttribute) {
      const objectName = opening.name;
      if (!t.isJSXIdentifier(objectName)) {
        return null;
      }

      const propertyName = specialMemberAttribute.name.name.slice(1);
      if (!propertyName) {
        return null;
      }

      return {
        expression: t.memberExpression(
          t.identifier(objectName.name),
          t.identifier(propertyName)
        ),
        tag: toKebab(propertyName),
        rewrite() {
          opening.name = t.jsxIdentifier(toKebab(propertyName));
          opening.attributes = opening.attributes.filter(
            (attribute) => attribute !== specialMemberAttribute
          );
          if (path.node.closingElement) {
            path.node.closingElement.name = t.jsxIdentifier(toKebab(propertyName));
          }
        },
      };
    }

    const nameNode = opening.name;
    if (!t.isJSXIdentifier(nameNode) && !t.isJSXMemberExpression(nameNode)) {
      return null;
    }

    const expression = createExpressionFromJSXName(nameNode);
    if (!expression) return null;

    const tag = getRenderedTagName(nameNode);
    if (!tag) return null;

    return {
      expression,
      tag,
      rewrite() {
        rewriteJSXName(opening.name, tag);
        if (path.node.closingElement) {
          rewriteJSXName(path.node.closingElement.name, tag);
        }
      },
    };
  }

  function getRenderedTagName(node) {
    if (t.isJSXIdentifier(node)) {
      return toKebab(node.name);
    }
    if (t.isJSXMemberExpression(node)) {
      return toKebab(node.property.name);
    }
    return null;
  }

  function rewriteJSXName(node, tagName) {
    if (t.isJSXIdentifier(node)) {
      node.name = tagName;
      return;
    }
    if (t.isJSXMemberExpression(node)) {
      node.type = "JSXIdentifier";
      node.name = tagName;
      delete node.object;
      delete node.property;
    }
  }

  function trackLazyUsage(path, state) {
    const reference = getLazyComponentReference(path);
    if (!reference) return;
    const { expression, tag } = reference;

    if (!hasLazyOrigin(expression, path.scope, state)) return;

    const resolvedNode = resolveValueNode(expression, path.scope, state);
    if (!resolvedNode) return;

    const renderPath = path.findParent(
      (entry) =>
        entry.isClassMethod({ kind: "method" }) &&
        t.isIdentifier(entry.node.key, { name: "render" })
    );
    if (!renderPath) return;

    const requirements = ensureRequirementBucket(renderPath, state);
    const exprKey = getExpressionKey(expression);
    const requirementKey = `${tag}:${exprKey || tag}`;
    requirements.set(requirementKey, { tag, expression });

    reference.rewrite();
  }

  return {
    name: "transform-react-lazy",
    inherits: jsxSyntaxPlugin.default || jsxSyntaxPlugin,
    visitor: {
      Program: {
        enter(_, state) {
          state.lazyLocalNames = new Set();
          state.reactNamespaceNames = new Set();
          state.runtimeNeeded = false;
        },
        exit(path, state) {
          buildRuntimeImport(path, state);
        },
      },
      ImportDeclaration(path, state) {
        if (path.node.source.value !== "react") return;

        const remaining = [];
        let mutated = false;

        for (const specifier of path.node.specifiers) {
          if (t.isImportSpecifier(specifier)) {
            const importedName = t.isIdentifier(specifier.imported)
              ? specifier.imported.name
              : null;

            if (importedName === "lazy") {
              state.lazyLocalNames.add(specifier.local.name);
              mutated = true;
              continue;
            }
          } else if (
            t.isImportNamespaceSpecifier(specifier) ||
            t.isImportDefaultSpecifier(specifier)
          ) {
            state.reactNamespaceNames.add(specifier.local.name);
          }

          remaining.push(specifier);
        }

        if (mutated) {
          if (remaining.length === 0) {
            path.remove();
          } else {
            path.node.specifiers = remaining;
          }
        }
      },
      CallExpression(path, state) {
        if (!isLazyCallee(path, state)) return;

        const args = path.get("arguments");
        if (args.length === 0) {
          path.replaceWith(t.identifier("undefined"));
          return;
        }

        path.replaceWith(cloneMarked(args[0].node));
        if (path.parentPath?.isObjectProperty()) {
          path.parentPath.node.__litsxLazyOrigin = true;
        }
      },
      JSXElement(path, state) {
        const renderPath = path.findParent(
          (entry) =>
            entry.isClassMethod({ kind: "method" }) &&
            t.isIdentifier(entry.node.key, { name: "render" })
        );
        if (!renderPath) return;

        const classPath = renderPath.findParent(
          (entry) => entry.isClassDeclaration() || entry.isClassExpression()
        );
        if (!classPath) return;
        if (!isLitElementSuperClass(classPath.node.superClass, t)) return;

        trackLazyUsage(path, state);
      },
      ClassMethod: {
        exit(path, state) {
          if (!path.isClassMethod({ kind: "method" })) return;
          if (!t.isIdentifier(path.node.key, { name: "render" })) return;

          const classPath = path.findParent(
            (entry) => entry.isClassDeclaration() || entry.isClassExpression()
          );
          if (
            classPath &&
            isLitElementSuperClass(classPath.node.superClass, t)
          ) {
            path.traverse({
              JSXElement(childPath) {
                trackLazyUsage(childPath, state);
              },
            });
          }

          injectEnsureStatements(path, state);
        },
      },
    },
  };
});
