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

function isLightDomHoist(statement) {
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

function createStaticHoistGetter(name, symbolId, expression) {
  const getter = t.classMethod(
    "get",
    t.identifier(name),
    [],
    t.blockStatement([
      t.returnStatement(
        t.callExpression(
          t.memberExpression(t.thisExpression(), t.identifier("__litsxStatic")),
          [
            t.cloneNode(symbolId),
            t.arrowFunctionExpression([], expression),
          ]
        )
      ),
    ])
  );
  getter.static = true;
  return getter;
}

function resolveStaticHoistExpression(expression) {
  return t.callExpression(
    t.memberExpression(t.thisExpression(), t.identifier("__litsxResolveStaticValue")),
    [t.cloneNode(expression)]
  );
}

function createPropertiesHoistResolver(propertiesStatic, expression) {
  return t.callExpression(
    t.memberExpression(t.thisExpression(), t.identifier("__litsxMergeProperties")),
    [
      t.objectExpression(propertiesStatic.map((property) => t.cloneNode(property))),
      resolveStaticHoistExpression(expression),
    ]
  );
}

function getGeneratedPropertiesExpression(statement) {
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

function getGeneratedStylesExpression(statement) {
  if (!t.isExpressionStatement(statement)) return null;
  if (!t.isCallExpression(statement.expression)) return null;
  if (!t.isIdentifier(
    statement.expression.callee,
    { name: "__litsx_static_styles_value" },
  )) return null;
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
  return t.cloneNode(argument, true);
}

function getStaticHoistExpression(statement, functionPath) {
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

function createExposeHoistMembers(expression) {
  const { methodsExpression } = normalizeExposeHoistExpression(expression);

  return methodsExpression.properties.map((property) =>
    createExposeClassMethod(property)
  );
}

function normalizeExposeHoistExpression(expression) {
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

function normalizeExposePropertyToClassMethod(property) {
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

function containsUnsafeCssCall(node) {
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

function isStaticStylesExpression(node, functionPath, seenBindings = new Set()) {
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
  getOrCreateModuleStaticHoistSymbol,
}) {
  const propertiesIr = normalizePropertiesIr(staticIr, renderStatements);
  const effectivePropertiesStatic = propertiesIr.inferred
    .map((entry) => entry.expression)
    .filter(Boolean);
  const staticHoists = propertiesIr.authored
    .map((entry) => ({
      name: "properties",
      expression: entry.expression,
    }));
  let lightDomRequested = options.defaultDomMode === "light";

  if (t.isBlockStatement(node.body)) {
    for (let index = renderStatements.length - 1; index >= 0; index -= 1) {
      const propertyOptions = getGeneratedPropertiesExpression(renderStatements[index]);
      if (propertyOptions) {
        renderStatements.splice(index, 1);
        continue;
      }

      const cssExpression = getGeneratedStylesExpression(renderStatements[index]);
      if (!cssExpression) continue;
      staticHoists.unshift({
        name: "styles",
        expression: cssExpression,
        needsCssImport: false,
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
      staticHoists.unshift(hoistExpression);
      renderStatements.splice(index, 1);
    }
  }

  if (lightDomRequested) {
    for (let index = staticHoists.length - 1; index >= 0; index -= 1) {
      if (staticHoists[index]?.name === "shadowRootOptions") {
        staticHoists.splice(index, 1);
      }
    }
  }

  const hasHoistedProperties = staticHoists.some((entry) => entry.name === "properties");
  if (effectivePropertiesStatic.length > 0 && !hasHoistedProperties) {
    const classProperties = t.classProperty(
      t.identifier("properties"),
      t.objectExpression(effectivePropertiesStatic),
      null,
      [],
      false
    );

    classProperties.static = true;
    classMembers.push(classProperties);
  }

  const hoistSymbolDeclarations = [];
  let needsStaticHoistsMixin = false;
  const hoistMembers = staticHoists.flatMap((hoist) => {
    if (hoist.name === "expose") {
      return createExposeHoistMembers(hoist.expression);
    }

    needsStaticHoistsMixin = true;
    const { symbolId, declaration } = getOrCreateModuleStaticHoistSymbol(programPath, hoist.name);
    if (declaration) {
      hoistSymbolDeclarations.push(declaration);
      const symbolMap = programPath.getData("__litsxStaticHoistSymbols");
      if (symbolMap?.has(hoist.name)) {
        symbolMap.set(hoist.name, { symbolId, declaration: null });
      }
    }

    if (hoist.name === "properties") {
      return createStaticHoistGetter(
        "properties",
        symbolId,
        createPropertiesHoistResolver(effectivePropertiesStatic, hoist.expression)
      );
    }

    if (hoist.name === "styles") {
      return createStaticHoistGetter(
        "styles",
        symbolId,
        resolveStaticHoistExpression(hoist.expression)
      );
    }

    return createStaticHoistGetter(
      hoist.name,
      symbolId,
      resolveStaticHoistExpression(hoist.expression)
    );
  });

  return {
    lightDomRequested,
    hoistMembers,
    hoistSymbolDeclarations,
    needsStaticHoistsMixin,
    needsCss:
      staticHoists.some(
        (entry) => entry.name === "styles" && entry.needsCssImport !== false,
      ),
    needsUnsafeCss:
      staticHoists.some(
        (entry) => entry.name === "styles" && containsUnsafeCssCall(entry.expression)
      ),
  };
}
