import jsxSyntaxPlugin from "@babel/plugin-syntax-jsx";

let t;
const RENDER_LIGHT_MODULE = "@lit-labs/ssr-client/directives/render-light.js";
const RENDER_LIGHT_IMPORT = "renderLight";

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

function createFallbackAttribute(expression) {
  const fallbackExpression =
    t.isArrowFunctionExpression(expression) || t.isFunctionExpression(expression)
      ? expression
      : t.arrowFunctionExpression([], expression);
  return t.jsxAttribute(
    t.jsxIdentifier(".fallback"),
    t.jsxExpressionContainer(fallbackExpression),
  );
}

function getJsxName(node) {
  return t.isJSXIdentifier(node) ? node.name : null;
}

function isAttributeNamed(attribute, name) {
  return t.isJSXAttribute(attribute) && getJsxName(attribute.name) === name;
}

function getBoundaryKind(nameNode, state) {
  const name = getJsxName(nameNode);
  return state.litsxBoundaryLocalNames.get(name) ?? null;
}

function ensureUniqueLocalName(programPath, baseName) {
  programPath.scope.crawl();
  if (!programPath.scope.hasBinding(baseName)) {
    return baseName;
  }

  let index = 1;
  while (programPath.scope.hasBinding(`__litsx${baseName}${index}`)) {
    index += 1;
  }

  return `__litsx${baseName}${index}`;
}

function ensureRenderLightImport(programPath) {
  const existing = programPath.get("body").find(
    (nodePath) =>
      nodePath.isImportDeclaration() &&
      nodePath.node.source.value === RENDER_LIGHT_MODULE
  );

  if (existing) {
    const specifier = existing.node.specifiers.find((entry) =>
      t.isImportSpecifier(entry) &&
      t.isIdentifier(entry.imported, { name: RENDER_LIGHT_IMPORT })
    );

    if (specifier?.local?.name) {
      return t.identifier(specifier.local.name);
    }

    const localName = ensureUniqueLocalName(programPath, RENDER_LIGHT_IMPORT);
    existing.node.specifiers.push(
      t.importSpecifier(t.identifier(localName), t.identifier(RENDER_LIGHT_IMPORT))
    );
    return t.identifier(localName);
  }

  const localName = ensureUniqueLocalName(programPath, RENDER_LIGHT_IMPORT);
  programPath.unshiftContainer(
    "body",
    t.importDeclaration(
      [t.importSpecifier(t.identifier(localName), t.identifier(RENDER_LIGHT_IMPORT))],
      t.stringLiteral(RENDER_LIGHT_MODULE)
    )
  );
  return t.identifier(localName);
}

export default function transformLitsxBoundaries(api) {
  api.assertVersion?.(7);
  t = api.types;

  return {
    name: "transform-litsx-boundaries",
    inherits: jsxSyntaxPlugin.default || jsxSyntaxPlugin,
    visitor: {
      Program: {
        enter(_, state) {
          state.litsxBoundaryLocalNames = new Map();
          state.__litsxSkipBoundaryTransform = true;
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
          if (importedName === "SuspenseBoundary" || importedName === "ErrorBoundary") {
            state.litsxBoundaryLocalNames.set(specifier.local.name, importedName);
            state.__litsxSkipBoundaryTransform = false;
          }
        }
      },
      JSXElement(path, state) {
        if (state.__litsxSkipBoundaryTransform) {
          return;
        }

        const { node } = path;
        if (node._litsxBoundaryLowered) {
          return;
        }

        const boundaryKind = getBoundaryKind(node.openingElement.name, state);
        if (!boundaryKind) {
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
          nextAttributes.push(
            boundaryKind === "ErrorBoundary"
              ? createFallbackAttribute(fallbackExpression)
              : createRendererAttribute("fallback", fallbackExpression)
          );
        }

        if (!hasContentAttr) {
          nextAttributes.push(
            createRendererAttribute("content", buildChildrenExpression(node.children)),
          );
        }

        node.openingElement.attributes = nextAttributes;
        node.children = [];
        if (state.opts?.ssr === true) {
          node.children.push(
            t.jsxExpressionContainer(
              t.callExpression(ensureRenderLightImport(path.findParent((parentPath) => parentPath.isProgram())), [])
            ),
          );
        }
        node.openingElement.selfClosing = false;
        if (!node.closingElement) {
          node.closingElement = t.jsxClosingElement(t.cloneNode(node.openingElement.name));
        }
        node._litsxBoundaryLowered = true;
      },
    },
  };
}
