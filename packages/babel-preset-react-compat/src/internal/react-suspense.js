import helperPluginUtils from "@babel/helper-plugin-utils";
import jsxSyntaxPlugin from "@babel/plugin-syntax-jsx";

const { declare } = helperPluginUtils;

export default declare((api) => {
  api.assertVersion(7);
  const t = api.types;

  function addNamedImport(programPath, source, importedName) {
    const bodyPaths = programPath.get("body");

    for (const bodyPath of bodyPaths) {
      if (!bodyPath.isImportDeclaration()) continue;
      if (bodyPath.node.source.value !== source) continue;

      const hasSpecifier = bodyPath.node.specifiers.some(
        (specifier) =>
          t.isImportSpecifier(specifier) &&
          t.isIdentifier(specifier.imported, { name: importedName })
      );

      if (!hasSpecifier) {
        bodyPath.pushContainer(
          "specifiers",
          t.importSpecifier(t.identifier(importedName), t.identifier(importedName))
        );
      }
      return;
    }

    programPath.unshiftContainer(
      "body",
      t.importDeclaration(
        [t.importSpecifier(t.identifier(importedName), t.identifier(importedName))],
        t.stringLiteral(source)
      )
    );
  }

  function attributeValueToExpression(value) {
    if (!value) {
      return t.booleanLiteral(true);
    }
    if (t.isJSXExpressionContainer(value)) {
      return t.cloneNode(value.expression, true);
    }
    if (t.isStringLiteral(value) || t.isNumericLiteral(value)) {
      return t.cloneNode(value, true);
    }
    return t.cloneNode(value, true);
  }

  function filterChildren(children) {
    return children.filter((child) => {
      if (t.isJSXText(child)) {
        return child.value.replace(/\s+/g, "").length > 0;
      }
      return !(t.isJSXExpressionContainer(child) && child.expression == null);
    });
  }

  function cloneChild(child) {
    if (t.isJSXExpressionContainer(child) && child.expression == null) {
      return null;
    }
    return t.cloneNode(child, true);
  }

  function buildChildrenExpression(children) {
    const filtered = filterChildren(children).map(cloneChild).filter(Boolean);

    if (filtered.length === 0) {
      return null;
    }

    if (filtered.length === 1) {
      const single = filtered[0];
      if (t.isJSXExpressionContainer(single)) {
        return t.cloneNode(single.expression, true);
      }
      if (t.isJSXElement(single) || t.isJSXFragment(single)) {
        return single;
      }
      if (t.isJSXText(single)) {
        return t.stringLiteral(single.value);
      }
      return single;
    }

    return t.jsxFragment(
      t.jsxOpeningFragment(),
      t.jsxClosingFragment(),
      filtered
    );
  }

  function getSuspenseKind(nameNode, state) {
    if (!nameNode) return null;

    if (t.isJSXIdentifier(nameNode)) {
      const localName = nameNode.name;
      if (localName === "Suspense" || localName === "SuspenseList") {
        return localName;
      }
      return state.suspenseLocalNames.get(localName) ?? null;
    }

    if (t.isJSXMemberExpression(nameNode)) {
      let object = nameNode.object;
      while (object && t.isJSXMemberExpression(object)) {
        object = object.object;
      }
      if (!object || !t.isJSXIdentifier(object)) {
        return null;
      }
      if (!state.reactNamespaceNames.has(object.name)) {
        return null;
      }
      if (!t.isJSXIdentifier(nameNode.property)) {
        return null;
      }
      if (
        nameNode.property.name === "Suspense" ||
        nameNode.property.name === "SuspenseList"
      ) {
        return nameNode.property.name;
      }
    }

    return null;
  }

  function createRendererAttribute(name, expression) {
    return t.jsxAttribute(
      t.jsxIdentifier(`.${name}`),
      t.jsxExpressionContainer(expression)
    );
  }

  function createComponentElement(name, attributes, children = []) {
    const element = t.jsxElement(
      t.jsxOpeningElement(t.jsxIdentifier(name), attributes, false),
      t.jsxClosingElement(t.jsxIdentifier(name)),
      children,
      false
    );
    element._litsxSuspenseTransformed = true;
    return element;
  }

  function findRenderMethod(path) {
    return path.findParent(
      (entry) =>
        entry.isClassMethod({ kind: "method" }) &&
        t.isIdentifier(entry.node.key, { name: "render" })
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
      collectRenderedTagsFromNode(node.closingElement, tags);
      return tags;
    }

    if (t.isJSXOpeningElement(node)) {
      if (t.isJSXIdentifier(node.name) && node.name.name.includes("-")) {
        tags.add(node.name.name);
      }
      collectRenderedTagsFromNode(node.attributes, tags);
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

  function collectRenderedTags(path) {
    const tags = new Set();
    collectRenderedTagsFromNode(path.node.children, tags);
    return tags;
  }

  function isEnsureLazyCall(statement) {
    return (
      t.isExpressionStatement(statement) &&
      t.isCallExpression(statement.expression) &&
      t.isIdentifier(statement.expression.callee, {
        name: "ensureLazyElement",
      }) &&
      statement.expression.arguments.length >= 3 &&
      t.isThisExpression(statement.expression.arguments[0]) &&
      t.isStringLiteral(statement.expression.arguments[1])
    );
  }

  function takeEnsureStatementsForPath(path) {
    const renderMethod = findRenderMethod(path);
    if (!renderMethod) return [];

    const bodyPath = renderMethod.get("body");
    if (!bodyPath.isBlockStatement()) return [];

    const renderedTags = collectRenderedTags(path);
    if (renderedTags.size === 0) return [];

    const taken = [];
    const remaining = [];

    for (const statement of bodyPath.node.body) {
      if (!isEnsureLazyCall(statement)) {
        remaining.push(statement);
        continue;
      }

      const tag = statement.expression.arguments[1].value;
      if (!renderedTags.has(tag)) {
        remaining.push(statement);
        continue;
      }

      taken.push(t.cloneNode(statement, true));
    }

    bodyPath.node.body = remaining;

    return taken;
  }

  function createSuspenseBoundaryElement(path) {
    const { node } = path;
    const attributes = node.openingElement.attributes ?? [];
    const fallbackAttr = attributes.find(
      (attr) => t.isJSXAttribute(attr) && attr.name?.name === "fallback"
    );

    const fallbackExpression = fallbackAttr
      ? attributeValueToExpression(fallbackAttr.value)
      : t.nullLiteral();

    const ensureStatements = takeEnsureStatementsForPath(path);
    const contentExpression = buildChildrenExpression(node.children) ?? t.nullLiteral();

    const contentRenderer =
      ensureStatements.length > 0
        ? t.arrowFunctionExpression(
            [],
            t.blockStatement([
              ...ensureStatements,
              t.returnStatement(contentExpression),
            ])
          )
        : t.arrowFunctionExpression([], contentExpression);

    return createComponentElement("SuspenseBoundary", [
      createRendererAttribute(
        "fallbackRenderer",
        t.arrowFunctionExpression([], fallbackExpression)
      ),
      createRendererAttribute("contentRenderer", contentRenderer),
    ]);
  }

  function createSuspenseListElement(path) {
    const { node } = path;
    const attributes = (node.openingElement.attributes ?? []).filter(
      (attr) =>
        !(
          t.isJSXAttribute(attr) &&
          t.isJSXIdentifier(attr.name, { name: "key" })
        )
    );

    return createComponentElement(
      "SuspenseList",
      attributes.map((attr) => t.cloneNode(attr, true)),
      node.children.map((child) => t.cloneNode(child, true))
    );
  }

  return {
    name: "transform-react-suspense",
    inherits: jsxSyntaxPlugin.default || jsxSyntaxPlugin,
    visitor: {
      Program: {
        enter(_, state) {
          state.suspenseLocalNames = new Map();
          state.reactNamespaceNames = new Set();
          state.usedPrimitives = new Set();
        },
        exit(path, state) {
          for (const primitiveName of state.usedPrimitives) {
            addNamedImport(path, "litsx", primitiveName);
          }
        },
      },
      ImportDeclaration(path, state) {
        if (path.node.source.value !== "react") return;

        const remainingSpecifiers = [];
        let mutated = false;

        for (const specifier of path.node.specifiers) {
          if (t.isImportSpecifier(specifier)) {
            const importedName = t.isIdentifier(specifier.imported)
              ? specifier.imported.name
              : null;
            if (importedName === "Suspense" || importedName === "SuspenseList") {
              state.suspenseLocalNames.set(specifier.local.name, importedName);
              mutated = true;
              continue;
            }
          } else if (
            t.isImportNamespaceSpecifier(specifier) ||
            t.isImportDefaultSpecifier(specifier)
          ) {
            state.reactNamespaceNames.add(specifier.local.name);
          }
          remainingSpecifiers.push(specifier);
        }

        if (mutated) {
          if (remainingSpecifiers.length === 0) {
            path.remove();
          } else {
            path.node.specifiers = remainingSpecifiers;
          }
        }
      },
      JSXElement: {
        exit(path, state) {
          if (path.node._litsxSuspenseTransformed) {
            return;
          }

          const opening = path.node.openingElement;
          if (!opening) return;

          const kind = getSuspenseKind(opening.name, state);
          if (kind === "Suspense") {
            state.usedPrimitives.add("SuspenseBoundary");
            path.replaceWith(createSuspenseBoundaryElement(path));
            return;
          }

          if (kind === "SuspenseList") {
            state.usedPrimitives.add("SuspenseList");
            state.usedPrimitives.add("SuspenseBoundary");
            path.replaceWith(createSuspenseListElement(path));
          }
        },
      },
    },
  };
});
