import jsxSyntaxPlugin from "@babel/plugin-syntax-jsx";

let t;

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

function buildChildrenExpression(children) {
  const filtered = filterChildren(children).map((child) => t.cloneNode(child, true));

  if (filtered.length === 0) {
    return t.nullLiteral();
  }

  if (filtered.length === 1) {
    const [single] = filtered;
    if (t.isJSXExpressionContainer(single)) {
      return t.cloneNode(single.expression, true);
    }
    if (t.isJSXText(single)) {
      return t.stringLiteral(single.value);
    }
    return single;
  }

  return t.jsxFragment(
    t.jsxOpeningFragment(),
    t.jsxClosingFragment(),
    filtered,
  );
}

function createRendererAttribute(name, expression) {
  return t.jsxAttribute(
    t.jsxIdentifier(`.${name}`),
    t.jsxExpressionContainer(t.arrowFunctionExpression([], expression)),
  );
}

function getJsxName(node) {
  return t.isJSXIdentifier(node) ? node.name : null;
}

function isSuspenseBoundaryName(nameNode, state) {
  const name = getJsxName(nameNode);
  return state.suspenseBoundaryLocalNames.has(name);
}

function isAttributeNamed(attribute, name) {
  return t.isJSXAttribute(attribute) && getJsxName(attribute.name) === name;
}

export default function transformLitsxSuspenseBoundary(api) {
  api.assertVersion?.(7);
  t = api.types;

  return {
    name: "transform-litsx-suspense-boundary",
    inherits: jsxSyntaxPlugin.default || jsxSyntaxPlugin,
    visitor: {
      Program: {
        enter(_, state) {
          state.suspenseBoundaryLocalNames = new Set();
          state.__litsxSkipSuspenseBoundaryTransform = true;
        },
      },
      ImportDeclaration(path, state) {
        if (path.node.source.value !== "@litsx/core") {
          return;
        }

        for (const specifier of path.node.specifiers) {
          if (!t.isImportSpecifier(specifier)) {
            continue;
          }
          const importedName = t.isIdentifier(specifier.imported)
            ? specifier.imported.name
            : null;
          if (importedName === "SuspenseBoundary") {
            state.suspenseBoundaryLocalNames.add(specifier.local.name);
            state.__litsxSkipSuspenseBoundaryTransform = false;
          }
        }
      },
      JSXElement(path, state) {
        if (state.__litsxSkipSuspenseBoundaryTransform) {
          return;
        }
        const { node } = path;
        if (node._litsxSuspenseBoundaryLowered) {
          return;
        }
        if (!isSuspenseBoundaryName(node.openingElement.name, state)) {
          return;
        }

        const attributes = node.openingElement.attributes ?? [];
        const fallbackAttr = attributes.find((attribute) =>
          isAttributeNamed(attribute, "fallback")
        );
        const hasContentAttr = attributes.some((attribute) =>
          isAttributeNamed(attribute, ".content")
        );

        if (!fallbackAttr && node.children.length === 0 && hasContentAttr) {
          return;
        }

        const nextAttributes = attributes.filter(
          (attribute) => !isAttributeNamed(attribute, "fallback")
        );

        if (!nextAttributes.some((attribute) => isAttributeNamed(attribute, ".fallback"))) {
          const fallbackExpression = fallbackAttr
            ? attributeValueToExpression(fallbackAttr.value)
            : t.nullLiteral();
          nextAttributes.push(createRendererAttribute("fallback", fallbackExpression));
        }

        if (!hasContentAttr) {
          nextAttributes.push(
            createRendererAttribute("content", buildChildrenExpression(node.children)),
          );
        }

        node.openingElement.attributes = nextAttributes;
        node.children = [];
        node.openingElement.selfClosing = false;
        if (!node.closingElement) {
          node.closingElement = t.jsxClosingElement(t.cloneNode(node.openingElement.name));
        }
        node._litsxSuspenseBoundaryLowered = true;
      },
    },
  };
}
