import helperPluginUtils from "@babel/helper-plugin-utils";
import jsxSyntaxPlugin from "@babel/plugin-syntax-jsx";
import { isLitElementSuperClass } from "@litsx/babel-plugin-shared-hooks";
import {
  cloneLazyMarked,
  isLazyCallee,
  setReactLazyAnalysisBabelTypes,
  trackLazyUsage,
} from "./react-lazy-analysis.js";

const { declare } = helperPluginUtils;
const RUNTIME_MODULE = "@litsx/core";
const INFRASTRUCTURE_MODULE = "@litsx/core/elements";

export default declare((api) => {
  api.assertVersion(7);
  const t = api.types;

  function isScopedElementsWrapped(superClass) {
    return (
      hasMixinInSuperChain(superClass, "ShadowDomElementsMixin") ||
      hasMixinInSuperChain(superClass, "LightDomElementsMixin")
    );
  }

  function hasMixinInSuperChain(node, mixinName) {
    if (!node) {
      return false;
    }

    return (
      t.isCallExpression(node) &&
      (
        (
          t.isIdentifier(node.callee) &&
          node.callee.name === mixinName
        ) ||
        node.arguments.some((argument) =>
          t.isExpression(argument) && hasMixinInSuperChain(argument, mixinName)
        )
      )
    );
  }

  function isLightDomClass(classNode) {
    return (
      Boolean(classNode._litsxLightDom) ||
      hasMixinInSuperChain(classNode.superClass, "LightDomMixin") ||
      hasMixinInSuperChain(classNode.superClass, "LightDomElementsMixin")
    );
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

  function unwrapContentRendererExpression(path) {
    if (path.isArrowFunctionExpression()) {
      return path;
    }

    if (!path.isCallExpression()) {
      return null;
    }

    const args = path.get("arguments");
    if (args.length === 0) {
      return null;
    }

    const candidate = [...args].reverse().find((argument) =>
      argument?.isArrowFunctionExpression()
    );
    if (candidate?.isArrowFunctionExpression()) {
      return candidate;
    }

    return null;
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

        const expressionPath = unwrapContentRendererExpression(
          contentRendererPath.get("value.expression")
        );
        if (!expressionPath) return;

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
        const mixinName = isLightDomClass(classPath.node)
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

  return {
    name: "transform-react-lazy",
    inherits: jsxSyntaxPlugin.default || jsxSyntaxPlugin,
    visitor: {
      Program: {
        enter(_, state) {
          setReactLazyAnalysisBabelTypes(t);
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

        path.replaceWith(cloneLazyMarked(args[0].node));
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

        trackLazyUsage(path, state, ensureRequirementBucket);
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
                trackLazyUsage(childPath, state, ensureRequirementBucket);
              },
            });
          }

          injectEnsureStatements(path, state);
        },
      },
    },
  };
});
