import { createNoopStagePlugin } from "./noop-stage-plugin.js";
import {
  createPropertyConfig,
  createPropertyValue,
  mergePropertyConfig,
} from "./transform-litsx-properties.js";

let t;

export function setStaticHoistsBabelTypes(types) {
  t = types;
}

function isLightDomHoist(statement) {
  if (!t.isExpressionStatement(statement)) return false;
  if (!t.isCallExpression(statement.expression)) return false;
  if (!t.isIdentifier(statement.expression.callee, { name: "__litsx_static_lightDom" })) {
    return false;
  }
  if (statement.expression.arguments.length !== 0) {
    throw new Error("^lightDom() does not accept arguments.");
  }
  return true;
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

function createPropertiesHoistResolver(propertiesStatic, staticProps, expression) {
  const mergedProperties = propertiesStatic.map((property) => t.cloneNode(property));
  if (staticProps.length > 0) {
    mergeStaticPropsIntoProperties(mergedProperties, staticProps);
  }

  return t.callExpression(
    t.memberExpression(t.thisExpression(), t.identifier("__litsxMergeProperties")),
    [
      t.objectExpression(mergedProperties),
      resolveStaticHoistExpression(expression),
    ]
  );
}

function createStylesHoistResolver(staticStyles, expression) {
  const resolvedExpression = resolveStaticHoistExpression(expression);
  if (staticStyles.length === 0) {
    return resolvedExpression;
  }

  const baseStyles =
    staticStyles.length === 1
      ? t.cloneNode(staticStyles[0])
      : t.arrayExpression(staticStyles.map((style) => t.cloneNode(style)));

  return t.logicalExpression("||", resolvedExpression, baseStyles);
}

function getStaticPropsExpression(statement) {
  if (!t.isExpressionStatement(statement)) return null;
  if (!t.isCallExpression(statement.expression)) return null;
  const isLegacyStaticProps = t.isIdentifier(statement.expression.callee, { name: "staticProps" });
  const isHoistedProperties = t.isIdentifier(
    statement.expression.callee,
    { name: "__litsx_static_properties" }
  );
  if (
    !isLegacyStaticProps &&
    !isHoistedProperties
  ) {
    return null;
  }
  if (statement.expression.arguments.length !== 1) return null;

  const [argument] = statement.expression.arguments;
  if (isHoistedProperties && (t.isFunctionExpression(argument) || t.isArrowFunctionExpression(argument))) {
    throw new Error("^properties(...) only accepts an object literal with static Lit property options.");
  }

  if (!t.isObjectExpression(argument)) {
    throw new Error("^properties(...) only accepts an object literal with static Lit property options.");
  }

  return isHoistedProperties ? {
    __litsxHoistedProperties: true,
    expression: t.cloneNode(argument),
  } : t.cloneNode(argument);
}

function getStaticPropertyName(node) {
  if (t.isIdentifier(node)) return node.name;
  if (t.isStringLiteral(node)) return node.value;
  return null;
}

function normalizeStaticPropOverrideValue(value) {
  if (
    t.isIdentifier(value) &&
    ["String", "Number", "Boolean", "Object", "Array", "Date"].includes(value.name)
  ) {
    return createPropertyConfig(t.identifier(value.name));
  }

  if (t.isObjectExpression(value)) {
    const typeProperty = value.properties.find(
      (prop) =>
        t.isObjectProperty(prop) &&
        t.isIdentifier(prop.key, { name: "type" }) &&
        t.isIdentifier(prop.value)
    );

    const attributeProperty = value.properties.find(
      (prop) =>
        t.isObjectProperty(prop) &&
        t.isIdentifier(prop.key, { name: "attribute" }) &&
        t.isBooleanLiteral(prop.value) &&
        prop.value.value === false
    );

    return createPropertyConfig(typeProperty ? typeProperty.value : null, {
      attribute: attributeProperty ? false : undefined,
    });
  }

  throw new Error(
    "^properties(...) values must be Lit property option objects or constructor references."
  );
}

function mergeStaticPropertyObject(targetNode, overrideObject) {
  if (!t.isObjectProperty(targetNode) || !t.isObjectExpression(targetNode.value)) {
    return;
  }

  overrideObject.properties.forEach((property) => {
    if (!t.isObjectProperty(property) && !t.isObjectMethod(property)) {
      throw new Error("^properties(...) only accepts plain object members.");
    }

    const keyName = getStaticPropertyName(property.key);
    if (!keyName) {
      throw new Error("^properties(...) property option names must be static identifiers or strings.");
    }

    const existing = targetNode.value.properties.find(
      (candidate) =>
        (t.isObjectProperty(candidate) || t.isObjectMethod(candidate)) &&
        getStaticPropertyName(candidate.key) === keyName
    );

    if (existing) {
      const nextNode = t.cloneNode(property);
      const index = targetNode.value.properties.indexOf(existing);
      targetNode.value.properties.splice(index, 1, nextNode);
    } else {
      targetNode.value.properties.push(t.cloneNode(property));
    }
  });
}

function mergeStaticPropsIntoProperties(propertiesStatic, staticProps) {
  const propertyMap = new Map();

  propertiesStatic.forEach((propertyNode) => {
    if (!t.isObjectProperty(propertyNode)) return;
    const keyName = getStaticPropertyName(propertyNode.key);
    if (!keyName) return;
    propertyMap.set(keyName, propertyNode);
  });

  staticProps.forEach((optionsObject) => {
    optionsObject.properties.forEach((property) => {
      if (!t.isObjectProperty(property)) {
        throw new Error("^properties(...) only accepts plain object properties.");
      }

      const keyName = getStaticPropertyName(property.key);
      if (!keyName) {
        throw new Error("^properties(...) property names must be static identifiers or strings.");
      }

      const existing = propertyMap.get(keyName);
      const normalized = normalizeStaticPropOverrideValue(property.value);

      if (!existing) {
        const node = t.objectProperty(
          t.identifier(keyName),
          createPropertyValue(normalized, false)
        );
        if (t.isObjectExpression(property.value)) {
          mergeStaticPropertyObject(node, property.value);
        }
        propertiesStatic.push(node);
        propertyMap.set(keyName, node);
        return;
      }

      mergePropertyConfig(
        { node: existing },
        normalized,
        false
      );

      if (t.isObjectExpression(property.value)) {
        mergeStaticPropertyObject(existing, property.value);
      }
    });
  });
}

function normalizeStylesTemplate(argument, functionPath) {
  if (t.isTemplateLiteral(argument)) {
    if (
      !argument.expressions.every((expression) =>
        isStaticStylesExpression(expression, functionPath)
      )
    ) {
      return null;
    }
    return t.templateLiteral(
      argument.quasis,
      argument.expressions.map((expression) =>
        wrapStaticStylesInterpolation(expression)
      )
    );
  }

  if (t.isStringLiteral(argument)) {
    return t.templateLiteral(
      [t.templateElement({ raw: argument.value, cooked: argument.value }, true)],
      []
    );
  }

  if (isStaticStylesExpression(argument, functionPath)) {
    return t.templateLiteral(
      [
        t.templateElement({ raw: "", cooked: "" }, false),
        t.templateElement({ raw: "", cooked: "" }, true),
      ],
      [wrapStaticStylesInterpolation(argument)]
    );
  }

  return null;
}

function wrapStaticStylesInterpolation(expression) {
  if (
    t.isTaggedTemplateExpression(expression) &&
    t.isIdentifier(expression.tag, { name: "css" })
  ) {
    return expression;
  }

  if (t.isNumericLiteral(expression)) {
    return expression;
  }

  return t.callExpression(
    t.identifier("unsafeCSS"),
    [expression]
  );
}

function getStaticStylesExpression(statement, functionPath) {
  if (!t.isExpressionStatement(statement)) return null;
  if (!t.isCallExpression(statement.expression)) return null;
  const isLegacyStaticStyles = t.isIdentifier(statement.expression.callee, { name: "staticStyles" });
  const isHoistedStyles = t.isIdentifier(statement.expression.callee, { name: "__litsx_static_styles" });
  if (
    !isLegacyStaticStyles &&
    !isHoistedStyles
  ) {
    return null;
  }
  if (statement.expression.arguments.length !== 1) return null;

  const [argument] = statement.expression.arguments;

  if (isHoistedStyles && (t.isFunctionExpression(argument) || t.isArrowFunctionExpression(argument))) {
    throw new Error("^styles(...) only accepts static values. Move dynamic values to useStyle(...) or CSS custom properties.");
  }

  const template = normalizeStylesTemplate(
    argument,
    functionPath
  );
  if (!template) {
    throw new Error("^styles(...) only accepts static values. Move dynamic values to useStyle(...) or CSS custom properties.");
  }

  const expression = t.taggedTemplateExpression(t.identifier("css"), template);
  return isHoistedStyles
    ? { __litsxHoistedStyles: true, expression }
    : expression;
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
    throw new Error(`^${name}(...) expects exactly one argument.`);
  }

  const [argument] = statement.expression.arguments;
  if (name === "expose") {
    if (t.isObjectExpression(argument)) {
      return {
        name,
        expression: t.cloneNode(argument),
      };
    }

    throw new Error("^expose(...) only accepts an object literal.");
  }

  if (t.isFunctionExpression(argument) || t.isArrowFunctionExpression(argument)) {
    throw new Error(`^${name}(...) only accepts a direct static value.`);
  }

  if (!isStaticStylesExpression(argument, functionPath)) {
    throw new Error(`^${name}(...) only accepts a direct static value.`);
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

  throw new Error("^expose(...) only accepts an object literal.");
}

function createExposeClassMethod(property) {
  const method = normalizeExposePropertyToClassMethod(property);
  method.static = true;
  return method;
}

function normalizeExposePropertyToClassMethod(property) {
  if (t.isSpreadElement(property)) {
    throw new Error("^expose(...) does not accept spread elements.");
  }

  if (t.isObjectMethod(property)) {
    if (property.kind !== "method") {
      throw new Error("^expose(...) only accepts plain methods.");
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
    throw new Error("^expose(...) only accepts plain methods.");
  }

  const value = property.value;
  if (!t.isFunctionExpression(value) && !t.isArrowFunctionExpression(value)) {
    throw new Error("^expose(...) values must be functions.");
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
        `^${macroName}(...) must appear as a top-level statement in the component body.`
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
  propertiesStatic,
  classMembers,
  options = {},
  getOrCreateModuleStaticHoistSymbol,
}) {
  const staticStyles = [];
  const staticProps = [];
  const staticHoists = [];
  let lightDomRequested = options.defaultDomMode === "light";

  if (t.isBlockStatement(node.body)) {
    for (let index = renderStatements.length - 1; index >= 0; index -= 1) {
      const propertyOptions = getStaticPropsExpression(renderStatements[index]);
      if (propertyOptions) {
        if (propertyOptions.__litsxHoistedProperties) {
          staticHoists.unshift({
            name: "properties",
            expression: propertyOptions.expression,
          });
        } else {
          staticProps.unshift(propertyOptions);
        }
        renderStatements.splice(index, 1);
        continue;
      }

      const cssExpression = getStaticStylesExpression(renderStatements[index], functionPath);
      if (!cssExpression) continue;
      if (cssExpression.__litsxHoistedStyles) {
        staticHoists.unshift({
          name: "styles",
          expression: cssExpression.expression,
        });
      } else {
        staticStyles.unshift(cssExpression);
      }
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

  if (lightDomRequested && staticHoists.some((entry) => entry.name === "shadowRootOptions")) {
    throw new Error("^lightDom() cannot be combined with ^shadowRootOptions(...).");
  }

  if (staticProps.length > 0) {
    mergeStaticPropsIntoProperties(propertiesStatic, staticProps);
  }

  const hasHoistedProperties = staticHoists.some((entry) => entry.name === "properties");
  if (propertiesStatic.length > 0 && !hasHoistedProperties) {
    const classProperties = t.classProperty(
      t.identifier("properties"),
      t.objectExpression(propertiesStatic),
      null,
      [],
      false
    );

    classProperties.static = true;
    classMembers.push(classProperties);
  }

  const hasHoistedStyles = staticHoists.some((entry) => entry.name === "styles");
  if (staticStyles.length > 0 && !hasHoistedStyles) {
    const stylesProperty = t.classProperty(
      t.identifier("styles"),
      staticStyles.length === 1 ? staticStyles[0] : t.arrayExpression(staticStyles),
      null,
      [],
      false
    );
    stylesProperty.static = true;
    classMembers.push(stylesProperty);
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
        createPropertiesHoistResolver(propertiesStatic, staticProps, hoist.expression)
      );
    }

    if (hoist.name === "styles") {
      return createStaticHoistGetter(
        "styles",
        symbolId,
        createStylesHoistResolver(staticStyles, hoist.expression)
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
      staticStyles.length > 0 ||
      staticHoists.some((entry) => entry.name === "styles"),
    needsUnsafeCss:
      staticStyles.some(containsUnsafeCssCall) ||
      staticHoists.some(
        (entry) => entry.name === "styles" && containsUnsafeCssCall(entry.expression)
      ),
  };
}

export default createNoopStagePlugin("transform-litsx-static-hoists");
