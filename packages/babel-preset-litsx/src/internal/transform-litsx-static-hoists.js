let t;

function copySourceLocation(target, source) {
  if (!source?.loc) return target;
  target.start = source.start;
  target.end = source.end;
  target.loc = source.loc;
  return target;
}

export function setStaticHoistsBabelTypes(types) {
  t = types;
}

export function isLightDomHoist(statement) {
  if (!t.isExpressionStatement(statement)) return false;
  if (!t.isCallExpression(statement.expression)) return false;
  if (!t.isIdentifier(statement.expression.callee, { name: "__litsx_static_lightDom" })) {
    return false;
  }

  const args = statement.expression.arguments;
  if (args.length === 0) {
    return true;
  }

  if (args.length === 1 && t.isBooleanLiteral(args[0], { value: true })) {
    return true;
  }

  throw new Error("Component.lightDom = true only accepts the literal value true.");
}

function createStaticClassProperty(name, expression) {
  const property = t.classProperty(
    t.identifier(name),
    t.cloneNode(expression, true),
  );
  property.static = true;
  return property;
}

function createInheritedStaticValue(name, fallback) {
  return t.logicalExpression(
    "??",
    t.memberExpression(t.super(), t.identifier(name)),
    fallback,
  );
}

function createComposedStylesExpression(expression) {
  return t.arrayExpression([
    createInheritedStaticValue("styles", t.arrayExpression([])),
    ...(t.isArrayExpression(expression)
      ? expression.elements.map((element) => t.cloneNode(element, true))
      : [t.cloneNode(expression, true)]),
  ]);
}

function createComposedElementsExpression(expression) {
  const inherited = t.spreadElement(
    createInheritedStaticValue("elements", t.objectExpression([])),
  );
  if (t.isObjectExpression(expression)) {
    return t.objectExpression([
      inherited,
      ...expression.properties.map((property) => t.cloneNode(property, true)),
    ]);
  }
  return t.objectExpression([
    inherited,
    t.spreadElement(t.cloneNode(expression, true)),
  ]);
}

export function getGeneratedPropertiesExpression(statement) {
  if (!t.isExpressionStatement(statement)) return null;
  if (!t.isCallExpression(statement.expression)) return null;
  const isHoistedProperties = t.isIdentifier(
    statement.expression.callee,
    { name: "__litsx_static_properties" }
  );
  if (!isHoistedProperties) {
    return null;
  }
  if (statement.expression.arguments.length !== 1) return null;

  const [argument] = statement.expression.arguments;
  if (isHoistedProperties && (t.isFunctionExpression(argument) || t.isArrowFunctionExpression(argument))) {
    throw new Error("Component.properties = ... only accepts an object literal with static Lit property options.");
  }

  if (!t.isObjectExpression(argument)) {
    throw new Error("Component.properties = ... only accepts an object literal with static Lit property options.");
  }

  return t.cloneNode(argument);
}

function normalizePropertiesIr(staticIr, renderStatements) {
  const properties = {
    inferred: (staticIr?.properties?.inferred || []).map((entry, index) => ({
      index: entry.index ?? index,
      expression: entry.expression ? t.cloneNode(entry.expression) : null,
    })),
    authored: (staticIr?.properties?.authored || []).map((entry, index) => ({
      index: entry.index ?? index,
      expression: entry.expression ? t.cloneNode(entry.expression) : null,
    })),
  };

  if (!staticIr && Array.isArray(renderStatements)) {
    renderStatements.forEach((statement, index) => {
      const propertyOptions = getGeneratedPropertiesExpression(statement);
      if (!propertyOptions) return;

      properties.authored.push({
        index,
        expression: propertyOptions,
      });
    });
  }

  properties.authored.sort((left, right) => left.index - right.index);
  return properties;
}

function getStaticPropertyKey(property) {
  if (!t.isObjectProperty(property) || property.computed) return null;
  if (t.isIdentifier(property.key)) return property.key.name;
  if (t.isStringLiteral(property.key) || t.isNumericLiteral(property.key)) {
    return String(property.key.value);
  }
  return null;
}

export function normalizeAuthoredProperty(property) {
  const next = t.cloneNode(property, true);
  if (
    t.isObjectProperty(next) &&
    t.isIdentifier(next.value) &&
    ["Array", "Boolean", "Number", "Object", "String"].includes(next.value.name)
  ) {
    next.value = t.objectExpression([
      t.objectProperty(t.identifier("type"), t.cloneNode(next.value)),
    ]);
  }
  return next;
}

function mergeObjectPropertyLists(baseProperties, overrideProperties) {
  const properties = baseProperties.map((property) => t.cloneNode(property, true));
  const indexByKey = new Map();
  properties.forEach((property, index) => {
    const key = getStaticPropertyKey(property);
    if (key !== null) indexByKey.set(key, index);
  });

  for (const property of overrideProperties) {
    const nextProperty = t.cloneNode(property, true);
    const key = getStaticPropertyKey(property);
    const existingIndex = key === null ? undefined : indexByKey.get(key);
    if (existingIndex !== undefined) {
      properties[existingIndex] = nextProperty;
      continue;
    }
    properties.push(nextProperty);
    if (key !== null) indexByKey.set(key, properties.length - 1);
  }
  return properties;
}

function mergeKnownPropertyDeclarations(inferred, authored) {
  const properties = inferred.map((property) => t.cloneNode(property, true));
  const indexByKey = new Map();
  properties.forEach((property, index) => {
    const key = getStaticPropertyKey(property);
    if (key !== null) indexByKey.set(key, index);
  });

  for (const property of authored.properties) {
    const normalizedProperty = normalizeAuthoredProperty(property);
    const nextProperty = t.cloneNode(normalizedProperty, true);
    const key = getStaticPropertyKey(property);
    const existingIndex = key === null ? undefined : indexByKey.get(key);
    const existing = existingIndex === undefined ? null : properties[existingIndex];

    if (
      existing &&
      t.isObjectProperty(existing) &&
      t.isObjectExpression(existing.value) &&
      t.isObjectProperty(normalizedProperty) &&
      t.isObjectExpression(normalizedProperty.value)
    ) {
      existing.value = t.objectExpression(
        mergeObjectPropertyLists(
          existing.value.properties,
          normalizedProperty.value.properties,
        ),
      );
      continue;
    }

    if (existingIndex !== undefined) {
      properties[existingIndex] = nextProperty;
      continue;
    }

    properties.push(nextProperty);
    if (key !== null) indexByKey.set(key, properties.length - 1);
  }

  return t.objectExpression(properties);
}

export function createPropertiesExpression(inferred, authored) {
  const base = t.objectExpression(
    inferred.map((property) => t.cloneNode(property, true)),
  );
  if (!authored) {
    return { expression: base, needsMergeHelper: false };
  }

  const hasSpread = authored.properties.some((property) =>
    t.isSpreadElement(property),
  );
  if (!hasSpread) {
    return {
      expression: mergeKnownPropertyDeclarations(inferred, authored),
      needsMergeHelper: false,
    };
  }

  return {
    expression: t.callExpression(
      t.identifier("mergePropertyDeclarations"),
      [
        base,
        t.objectExpression(
          authored.properties.map((property) =>
            normalizeAuthoredProperty(property),
          ),
        ),
      ],
    ),
    needsMergeHelper: true,
  };
}

export function getGeneratedStylesExpression(statement) {
  if (!t.isExpressionStatement(statement)) return null;
  if (!t.isCallExpression(statement.expression)) return null;
  const callee = statement.expression.callee;
  const inherited = t.isIdentifier(callee, {
    name: "__litsx_static_styles_value",
  });
  const replacement = t.isIdentifier(callee, {
    name: "__litsx_static_styles_replace_value",
  });
  if (!inherited && !replacement) return null;
  if (statement.expression.arguments.length !== 1) return null;

  const [argument] = statement.expression.arguments;

  if (
    t.isStringLiteral(argument) ||
    t.isTemplateLiteral(argument) ||
    t.isFunctionExpression(argument) ||
    t.isArrowFunctionExpression(argument)
  ) {
    throw new Error(
      "Component.styles must be a Lit CSSResultGroup. Use css`...` from lit instead of a plain string, untagged template literal, or function.",
    );
  }
  return {
    expression: copySourceLocation(t.cloneNode(argument, true), argument),
    inherit: !replacement,
  };
}

export function getStaticHoistExpression(statement, functionPath) {
  if (!t.isExpressionStatement(statement)) return null;
  if (!t.isCallExpression(statement.expression)) return null;
  if (!t.isIdentifier(statement.expression.callee)) return null;

  const calleeName = statement.expression.callee.name;
  if (!calleeName.startsWith("__litsx_static_")) {
    return null;
  }

  const name = calleeName.slice("__litsx_static_".length);
  if (!name || name === "properties" || name === "styles") {
    return null;
  }

  if (statement.expression.arguments.length !== 1) {
    throw new Error(`Component.${name} = ... expects exactly one value.`);
  }

  const [argument] = statement.expression.arguments;
  if (name === "expose") {
    if (t.isObjectExpression(argument)) {
      return {
        name,
        expression: t.cloneNode(argument),
      };
    }

    throw new Error("Component.expose = ... only accepts an object literal.");
  }

  if (t.isFunctionExpression(argument) || t.isArrowFunctionExpression(argument)) {
    throw new Error(`Component.${name} = ... only accepts a direct static value.`);
  }

  if (!isStaticStylesExpression(argument, functionPath)) {
    throw new Error(`Component.${name} = ... only accepts a direct static value.`);
  }

  return {
    name,
    expression: t.cloneNode(argument),
  };
}

export function createExposeHoistMembers(expression) {
  const { methodsExpression } = normalizeExposeHoistExpression(expression);

  return methodsExpression.properties.map((property) =>
    createExposeClassMethod(property)
  );
}

export function normalizeExposeHoistExpression(expression) {
  if (t.isObjectExpression(expression)) {
    return {
      methodsExpression: t.cloneNode(expression),
    };
  }

  throw new Error("Component.expose = ... only accepts an object literal.");
}

function createExposeClassMethod(property) {
  const method = normalizeExposePropertyToClassMethod(property);
  method.static = true;
  return method;
}

export function normalizeExposePropertyToClassMethod(property) {
  if (t.isSpreadElement(property)) {
    throw new Error("Component.expose = ... does not accept spread elements.");
  }

  if (t.isObjectMethod(property)) {
    if (property.kind !== "method") {
      throw new Error("Component.expose = ... only accepts plain methods.");
    }

    return t.classMethod(
      "method",
      t.cloneNode(property.key),
      property.params.map((param) => t.cloneNode(param)),
      t.cloneNode(property.body),
      property.computed
    );
  }

  if (!t.isObjectProperty(property)) {
    throw new Error("Component.expose = ... only accepts plain methods.");
  }

  const value = property.value;
  if (!t.isFunctionExpression(value) && !t.isArrowFunctionExpression(value)) {
    throw new Error("Component.expose = ... values must be functions.");
  }

  const body = t.isBlockStatement(value.body)
    ? t.cloneNode(value.body)
    : t.blockStatement([t.returnStatement(t.cloneNode(value.body))]);

  const method = t.classMethod(
    "method",
    t.cloneNode(property.key),
    value.params.map((param) => t.cloneNode(param)),
    body,
    property.computed
  );
  method.async = value.async;
  method.generator = value.generator || false;
  return method;
}

export function assertStaticHoistsStayTopLevel(functionPath) {
  functionPath.traverse({
    CallExpression(callPath) {
      if (!t.isIdentifier(callPath.node.callee)) return;
      if (!callPath.node.callee.name.startsWith("__litsx_static_")) return;

      const statementParent = callPath.parentPath;
      const blockParent = statementParent?.parentPath;

      if (
        statementParent?.isExpressionStatement() &&
        blockParent?.isBlockStatement() &&
        blockParent.node === functionPath.node.body
      ) {
        return;
      }

      const macroName = callPath.node.callee.name.slice("__litsx_static_".length);
      throw callPath.buildCodeFrameError(
        `Internal static metadata ${macroName} must appear as a top-level statement in the generated component body.`
      );
    },
  });
}

export function containsUnsafeCssCall(node) {
  if (!node || typeof node !== "object") return false;
  if (
    t.isCallExpression(node) &&
    t.isIdentifier(node.callee, { name: "unsafeCSS" })
  ) {
    return true;
  }

  return Object.values(node).some((value) => {
    if (Array.isArray(value)) {
      return value.some((entry) => containsUnsafeCssCall(entry));
    }
    return containsUnsafeCssCall(value);
  });
}

export function isStaticStylesExpression(node, functionPath, seenBindings = new Set()) {
  if (t.isClassExpression(node)) {
    return true;
  }

  if (
    t.isStringLiteral(node) ||
    t.isNumericLiteral(node) ||
    t.isBooleanLiteral(node) ||
    t.isNullLiteral(node) ||
    t.isBigIntLiteral?.(node)
  ) {
    return true;
  }

  if (t.isTemplateLiteral(node)) {
    return node.expressions.every((expression) =>
      isStaticStylesExpression(expression, functionPath, seenBindings)
    );
  }

  if (t.isIdentifier(node)) {
    return isStaticStylesIdentifier(node, functionPath, seenBindings);
  }

  if (t.isUnaryExpression(node)) {
    return isStaticStylesExpression(node.argument, functionPath, seenBindings);
  }

  if (t.isBinaryExpression(node) || t.isLogicalExpression(node)) {
    return (
      isStaticStylesExpression(node.left, functionPath, seenBindings) &&
      isStaticStylesExpression(node.right, functionPath, seenBindings)
    );
  }

  if (t.isConditionalExpression(node)) {
    return (
      isStaticStylesExpression(node.test, functionPath, seenBindings) &&
      isStaticStylesExpression(node.consequent, functionPath, seenBindings) &&
      isStaticStylesExpression(node.alternate, functionPath, seenBindings)
    );
  }

  if (t.isArrayExpression(node)) {
    return node.elements.every((element) =>
      element == null || isStaticStylesExpression(element, functionPath, seenBindings)
    );
  }

  if (t.isObjectExpression(node)) {
    return node.properties.every((property) => {
      if (t.isObjectProperty(property)) {
        return (
          (!property.computed ||
            isStaticStylesExpression(property.key, functionPath, seenBindings)) &&
          isStaticStylesExpression(property.value, functionPath, seenBindings)
        );
      }
      return false;
    });
  }

  if (t.isMemberExpression(node)) {
    return (
      isStaticStylesExpression(node.object, functionPath, seenBindings) &&
      (!node.computed ||
        isStaticStylesExpression(node.property, functionPath, seenBindings))
    );
  }

  if (t.isCallExpression(node)) {
    return (
      isStaticStylesExpression(node.callee, functionPath, seenBindings) &&
      node.arguments.every((argument) =>
        t.isSpreadElement(argument)
          ? false
          : isStaticStylesExpression(argument, functionPath, seenBindings)
      )
    );
  }

  if (t.isTaggedTemplateExpression(node)) {
    return (
      isStaticStylesExpression(node.tag, functionPath, seenBindings) &&
      isStaticStylesExpression(node.quasi, functionPath, seenBindings)
    );
  }

  return false;
}

function isStaticStylesIdentifier(node, functionPath, seenBindings) {
  const binding = functionPath?.scope
    ? functionPath.scope.getBinding(node.name)
    : null;

  if (!binding) {
    return false;
  }

  if (binding.path.findParent((parent) => parent === functionPath)) {
    return false;
  }

  if (
    binding.path.isImportSpecifier() ||
    binding.path.isImportDefaultSpecifier() ||
    binding.path.isImportNamespaceSpecifier()
  ) {
    return true;
  }

  if (binding.path.isVariableDeclarator()) {
    if (binding.kind !== "const" || !binding.path.node.init) {
      return false;
    }

    if (seenBindings.has(binding)) {
      return true;
    }

    seenBindings.add(binding);
    return isStaticStylesExpression(binding.path.node.init, functionPath, seenBindings);
  }

  if (binding.path.isFunctionDeclaration() || binding.path.isClassDeclaration()) {
    return true;
  }

  return false;
}

export function processStaticHoists({
  functionPath,
  node,
  renderStatements,
  programPath,
  staticIr = null,
  classMembers,
  options = {},
}) {
  const propertiesIr = normalizePropertiesIr(staticIr, renderStatements);
  const effectivePropertiesStatic = propertiesIr.inferred
    .map((entry) => entry.expression)
    .filter(Boolean);
  const lastAuthoredProperties = propertiesIr.authored.at(-1)?.expression ?? null;
  const staticMetadata = [];
  let lightDomRequested = options.defaultDomMode === "light";

  if (t.isBlockStatement(node.body)) {
    for (let index = renderStatements.length - 1; index >= 0; index -= 1) {
      const propertyOptions = getGeneratedPropertiesExpression(renderStatements[index]);
      if (propertyOptions) {
        renderStatements.splice(index, 1);
        continue;
      }

      const styles = getGeneratedStylesExpression(renderStatements[index]);
      if (!styles) continue;
      staticMetadata.unshift({
        name: "styles",
        expression: styles.expression,
        inherit: styles.inherit,
      });
      renderStatements.splice(index, 1);
    }

    for (let index = renderStatements.length - 1; index >= 0; index -= 1) {
      if (isLightDomHoist(renderStatements[index])) {
        lightDomRequested = true;
        renderStatements.splice(index, 1);
      }
    }

    for (let index = renderStatements.length - 1; index >= 0; index -= 1) {
      const hoistExpression = getStaticHoistExpression(renderStatements[index], functionPath);
      if (!hoistExpression) continue;
      staticMetadata.unshift(hoistExpression);
      renderStatements.splice(index, 1);
    }
  }

  if (lightDomRequested) {
    for (let index = staticMetadata.length - 1; index >= 0; index -= 1) {
      if (staticMetadata[index]?.name === "shadowRootOptions") {
        staticMetadata.splice(index, 1);
      }
    }
  }

  let needsPropertyDeclarationMerge = false;
  if (effectivePropertiesStatic.length > 0 || lastAuthoredProperties) {
    const properties = createPropertiesExpression(
      effectivePropertiesStatic,
      lastAuthoredProperties,
    );
    classMembers.push(
      createStaticClassProperty("properties", properties.expression),
    );
    needsPropertyDeclarationMerge = properties.needsMergeHelper;
  }

  const lastMetadataByName = new Map();
  staticMetadata.forEach((entry) => lastMetadataByName.set(entry.name, entry));
  const effectiveMetadata = staticMetadata.filter(
    (entry) => lastMetadataByName.get(entry.name) === entry,
  );

  const hoistMembers = effectiveMetadata.flatMap((hoist) => {
    if (hoist.name === "expose") {
      return createExposeHoistMembers(hoist.expression);
    }

    if (hoist.name === "styles") {
      return createStaticClassProperty(
        "styles",
        hoist.inherit === false
          ? hoist.expression
          : createComposedStylesExpression(hoist.expression),
      );
    }

    if (hoist.name === "elements") {
      return createStaticClassProperty(
        "elements",
        createComposedElementsExpression(hoist.expression),
      );
    }

    return createStaticClassProperty(
      hoist.name,
      hoist.expression,
    );
  });

  return {
    lightDomRequested,
    hoistMembers,
    needsPropertyDeclarationMerge,
    needsCss:
      effectiveMetadata.some((entry) => entry.name === "styles" && entry.needsCssImport),
    needsUnsafeCss:
      effectiveMetadata.some(
        (entry) => entry.name === "styles" && containsUnsafeCssCall(entry.expression)
      ),
  };
}
