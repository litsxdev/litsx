import { declare } from "@babel/helper-plugin-utils";
import jsxSyntaxPlugin from "@babel/plugin-syntax-jsx";
import { isLitElementSuperClass } from "@litsx/babel-plugin-shared-hooks";
import {
  ensureStaticIr,
  setStaticIrBabelTypes,
} from "./transform-litsx-static-ir.js";
import {
  cloneLazyMarked,
  isLazyCallee,
  setLitsxLazyAnalysisBabelTypes,
  trackLazyUsage,
} from "./transform-litsx-lazy-analysis.js";

const RUNTIME_MODULE = "@litsx/core";
const INFRASTRUCTURE_MODULE = "@litsx/core/elements";

export default declare((api, options = {}) => {
  api.assertVersion("^8.0.0");
  const t = api.types;
  const lazySources = new Set(
    Array.isArray(options.sources) && options.sources.length > 0
      ? options.sources
      : ["@litsx/core"],
  );
  setStaticIrBabelTypes(t);

  function isScopedElementsWrapped(superClass) {
    return (
      hasMixinInSuperChain(superClass, "ShadowDomMixin") ||
      hasMixinInSuperChain(superClass, "LightDomMixin")
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
    const staticIr = getOrCreateStaticIr(classNode);
    return (
      Boolean(staticIr.lightDom) ||
      hasMixinInSuperChain(classNode.superClass, "LightDomMixin")
    );
  }

  function getOrCreateStaticIr(classNode) {
    return ensureStaticIr(classNode);
  }

  function markNeedsElementsRegistry(classNode) {
    getOrCreateStaticIr(classNode).elements.needsRegistry = true;
  }

  function excludeLazyElementCandidate(classNode, requirement) {
    if (!classNode || !requirement) return;

    const { expression, tag } = requirement;
    const candidateName = t.isIdentifier(expression)
      ? expression.name
      : t.isMemberExpression(expression) && !expression.computed && t.isIdentifier(expression.property)
        ? expression.property.name
        : null;
    const matches = (name, candidateTag = null) => (
      (candidateName != null && name === candidateName) ||
      candidateTag === tag ||
      (typeof name === "string" && name.replace(/([a-z])([A-Z])/g, "$1-$2").toLowerCase() === tag)
    );
    const staticIr = getOrCreateStaticIr(classNode);
    staticIr.elements.localCandidates = staticIr.elements.localCandidates.filter(
      (name) => !matches(name),
    );
    staticIr.elements.importedCandidates = staticIr.elements.importedCandidates.filter(
      (candidate) => !matches(candidate?.originalName, candidate?.tagName),
    );
  }

  function trackAndExcludeLazyUsage(path, state) {
    const requirement = trackLazyUsage(path, state, ensureRequirementBucket);
    if (!requirement) return;
    const classPath = requirement.renderPath.findParent(
      (entry) => entry.isClassDeclaration() || entry.isClassExpression(),
    );
    excludeLazyElementCandidate(classPath?.node, requirement);
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
    const statement = t.expressionStatement(
      t.callExpression(t.identifier("ensureLazyElement"), [
        t.thisExpression(),
        t.stringLiteral(tag),
        t.cloneNode(expression, true),
      ])
    );
    statement.__litsxAutoEnsureLazyElement = true;
    return statement;
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
            t.isJSXIdentifier(attribute.name, { name: ".content" }) &&
            t.isJSXExpressionContainer(attribute.value)
        );

        if (!contentRendererAttr) return;

        const contentRendererPath = path
          .get("attributes")
          .find(
            (attributePath) =>
              attributePath.isJSXAttribute() &&
              t.isJSXIdentifier(attributePath.node.name, {
                name: ".content",
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
      markNeedsElementsRegistry(classPath.node);
      if (
        isLitElementSuperClass(classPath.node.superClass, t) &&
        !isScopedElementsWrapped(classPath.node.superClass)
      ) {
        const mixinName = isLightDomClass(classPath.node)
          ? "LightDomMixin"
          : "ShadowDomMixin";
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

    let insertIndex = 0;

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
    name: "transform-litsx-lazy",
    inherits: jsxSyntaxPlugin.default || jsxSyntaxPlugin,
    visitor: {
      Program: {
        enter(_, state) {
          setLitsxLazyAnalysisBabelTypes(t);
          state.lazyLocalNames = new Set();
          state.lazyNamespaceNames = new Set();
          state.runtimeNeeded = false;
        },
        exit(path, state) {
          buildRuntimeImport(path, state);
        },
      },
      ImportDeclaration(path, state) {
        if (!lazySources.has(path.node.source.value)) return;

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
            state.lazyNamespaceNames.add(specifier.local.name);
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

        trackAndExcludeLazyUsage(path, state);
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
                trackAndExcludeLazyUsage(childPath, state);
              },
            });
          }

          injectEnsureStatements(path, state);
        },
      },
    },
  };
});
