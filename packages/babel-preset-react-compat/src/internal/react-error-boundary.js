import helperPluginUtils from "@babel/helper-plugin-utils";
import jsxSyntaxPlugin from "@babel/plugin-syntax-jsx";

const { declare } = helperPluginUtils;
const RUNTIME_MODULE = "litsx";
const RUNTIME_PRIMITIVE = "ErrorBoundary";
const KEYED_MODULE = "lit/directives/keyed.js";

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
      if (!value.expression || t.isJSXEmptyExpression(value.expression)) {
        return t.booleanLiteral(true);
      }
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
      return !(
        t.isJSXExpressionContainer(child) &&
        (child.expression == null || t.isJSXEmptyExpression(child.expression))
      );
    });
  }

  function cloneChild(child) {
    if (
      t.isJSXExpressionContainer(child) &&
      (child.expression == null || t.isJSXEmptyExpression(child.expression))
    ) {
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

  function attributeToFunction(attr) {
    const expression = attributeValueToExpression(attr.value);
    if (t.isArrowFunctionExpression(expression) || t.isFunctionExpression(expression)) {
      return expression;
    }
    return t.arrowFunctionExpression([], expression ?? t.nullLiteral());
  }

  function buildFallbackFunction(attr) {
    if (!attr) {
      return t.arrowFunctionExpression([], t.nullLiteral());
    }
    return attributeToFunction(attr);
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
    element._litsxErrorBoundaryTransformed = true;
    return element;
  }

  function wrapKeyedExpression(path, expression) {
    if (path.parentPath?.isJSXElement() || path.parentPath?.isJSXFragment()) {
      return t.jsxExpressionContainer(expression);
    }
    return expression;
  }

  function createErrorBoundaryElement(path, state) {
    const { node } = path;
    const attributes = node.openingElement.attributes ?? [];
    const keyAttr = attributes.find(
      (attr) => t.isJSXAttribute(attr) && attr.name?.name === "key"
    );
    const fallbackAttr = attributes.find(
      (attr) => t.isJSXAttribute(attr) && attr.name?.name === "fallback"
    );
    const onErrorAttr = attributes.find(
      (attr) => t.isJSXAttribute(attr) && attr.name?.name === "onError"
    );

    const childrenExpression = buildChildrenExpression(node.children);
    const contentRenderer = t.arrowFunctionExpression(
      [],
      childrenExpression ?? t.nullLiteral()
    );
    const fallbackRenderer = buildFallbackFunction(fallbackAttr);

    const element = createComponentElement(RUNTIME_PRIMITIVE, [
      createRendererAttribute("fallbackRenderer", fallbackRenderer),
      createRendererAttribute("contentRenderer", contentRenderer),
      ...(onErrorAttr
        ? [
            createRendererAttribute(
              "onError",
              attributeValueToExpression(onErrorAttr.value)
            ),
          ]
        : []),
    ]);

    if (!keyAttr) {
      return element;
    }

    state.keyedNeeded = true;
    return wrapKeyedExpression(
      path,
      t.callExpression(t.identifier("keyed"), [
        attributeValueToExpression(keyAttr.value),
        element,
      ])
    );
  }

  function getBoundaryKind(nameNode, state) {
    if (!nameNode) return null;

    if (t.isJSXIdentifier(nameNode)) {
      const localName = nameNode.name;
      if (state.boundaryLocalNames.has(localName)) {
        return "ErrorBoundary";
      }
      if (localName === "ErrorBoundary") {
        return "ErrorBoundary";
      }
      return null;
    }

    if (t.isJSXMemberExpression(nameNode)) {
      const object = nameNode.object;
      if (t.isJSXIdentifier(object) && state.namespaceBindings.has(object.name)) {
        const property = nameNode.property;
        if (t.isJSXIdentifier(property) && property.name === "ErrorBoundary") {
          return "ErrorBoundary";
        }
      }
    }

    return null;
  }

  return {
    name: "transform-react-error-boundary",
    inherits: jsxSyntaxPlugin.default || jsxSyntaxPlugin,
    visitor: {
      Program: {
        enter(path, state) {
          state.boundaryLocalNames = new Set();
          state.namespaceBindings = new Set();
          state.keyedNeeded = false;
        },
        exit(path, state) {
          addNamedImport(path, RUNTIME_MODULE, RUNTIME_PRIMITIVE);
          if (state.keyedNeeded) {
            addNamedImport(path, KEYED_MODULE, "keyed");
          }
        },
      },
      ImportDeclaration(path, state) {
        const source = path.node.source.value;
        const isReactSource =
          source === "react" ||
          source === "react-error-boundary" ||
          source === "@litsx/react" ||
          source === "@litsx/react-error-boundary";

        if (!isReactSource) {
          return;
        }

        const remainingSpecifiers = [];
        let mutated = false;

        path.node.specifiers.forEach((specifier) => {
          if (t.isImportSpecifier(specifier)) {
            const importedName = t.isIdentifier(specifier.imported)
              ? specifier.imported.name
              : null;
            if (importedName === "ErrorBoundary") {
              state.boundaryLocalNames.add(specifier.local.name);
              mutated = true;
              return;
            }
          }

          if (
            t.isImportNamespaceSpecifier(specifier) ||
            t.isImportDefaultSpecifier(specifier)
          ) {
            state.namespaceBindings.add(specifier.local.name);
          }

          remainingSpecifiers.push(specifier);
        });

        if (mutated) {
          if (remainingSpecifiers.length === 0) {
            path.remove();
          } else {
            path.node.specifiers = remainingSpecifiers;
          }
        }
      },
      JSXElement(path, state) {
        if (path.node._litsxErrorBoundaryTransformed) {
          return;
        }

        const opening = path.node.openingElement;
        const kind = getBoundaryKind(opening.name, state);
        if (kind !== "ErrorBoundary") {
          return;
        }

        const element = createErrorBoundaryElement(path, state);
        path.replaceWith(element);
        path.requeue();
      },
    },
  };
});
