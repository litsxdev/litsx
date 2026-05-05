let t;

export function setReactCompatSharedBabelTypes(nextTypes) {
  t = nextTypes;
}

export function registerCompatPascalName(programPath, localName) {
  if (!programPath || typeof localName !== "string" || localName.length === 0) {
    return;
  }

  const names = programPath.getData("__litsxCompatPascalNames") || new Set();
  names.add(localName);
  programPath.setData("__litsxCompatPascalNames", names);
}

export function addNamedImport(programPath, source, importedName) {
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

export function attributeValueToExpression(value) {
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

export function buildChildrenExpression(children) {
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

export function createRendererAttribute(name, expression) {
  return t.jsxAttribute(
    t.jsxIdentifier(`.${name}`),
    t.jsxExpressionContainer(expression)
  );
}

export function createComponentElement(name, attributes, children = [], markerProperty = null) {
  const element = t.jsxElement(
    t.jsxOpeningElement(t.jsxIdentifier(name), attributes, false),
    t.jsxClosingElement(t.jsxIdentifier(name)),
    children,
    false
  );

  if (markerProperty) {
    element[markerProperty] = true;
  }

  return element;
}
