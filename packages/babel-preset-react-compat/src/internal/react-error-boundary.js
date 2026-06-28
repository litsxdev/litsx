import helperPluginUtils from "@babel/helper-plugin-utils";
import jsxSyntaxPlugin from "@babel/plugin-syntax-jsx";
import {
  addNamedImport,
  attributeValueToExpression,
  buildChildrenExpression,
  createComponentElement,
  createRendererAttribute,
  registerCompatPascalName,
  setReactCompatSharedBabelTypes,
} from "./react-compat-shared.js";

const { declare } = helperPluginUtils;
const RUNTIME_MODULE = "@litsx/core";
const RUNTIME_PRIMITIVE = "ErrorBoundary";
const KEYED_MODULE = "lit/directives/keyed.js";

export default declare((api) => {
  api.assertVersion(7);
  const t = api.types;

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
      createRendererAttribute("fallback", fallbackRenderer),
      createRendererAttribute("content", contentRenderer),
      ...(onErrorAttr
        ? [
            createRendererAttribute(
              "onError",
              attributeValueToExpression(onErrorAttr.value)
            ),
          ]
        : []),
    ], [], "_litsxErrorBoundaryTransformed");

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
          setReactCompatSharedBabelTypes(t);
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
        const programPath = path.findParent((entry) => entry.isProgram());
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
              registerCompatPascalName(programPath, specifier.local.name);
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
