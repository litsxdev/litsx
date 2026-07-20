let t;

export function setClassGenerationBabelTypes(nextTypes) {
  t = nextTypes;
}

function createThisMemberExpression(propName) {
  return t.memberExpression(t.thisExpression(), t.identifier(propName));
}

function createRuntimeMetadataSymbolExpression(symbolKey) {
  return t.callExpression(
    t.memberExpression(t.identifier("Symbol"), t.identifier("for")),
    [t.stringLiteral(symbolKey)]
  );
}

function createStaticRuntimeMetadataProperty(symbolKey, valueNode) {
  const property = t.classProperty(
    t.identifier("__litsx_placeholder"),
    valueNode
  );
  property.key = createRuntimeMetadataSymbolExpression(symbolKey);
  property.computed = true;
  property.static = true;
  return property;
}

function toKebabCase(value) {
  return String(value ?? "")
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/([A-Z])([A-Z][a-z])/g, "$1-$2")
    .toLowerCase();
}

export function buildClassMembers({
  classMembers = [],
  defaults,
  renderStatements,
  handlerInfos,
  createHandlerClassMember,
}) {
  if (defaults.size > 0) {
    const constructorStatements = [
      t.expressionStatement(t.callExpression(t.super(), [])),
    ];

    defaults.forEach((defaultExpression, propName) => {
      constructorStatements.push(
        t.expressionStatement(
          t.assignmentExpression(
            "??=",
            createThisMemberExpression(propName),
            t.cloneNode(defaultExpression)
          )
        )
      );
    });

    const constructorMethod = t.classMethod(
      "constructor",
      t.identifier("constructor"),
      [],
      t.blockStatement(constructorStatements)
    );

    const insertionIndex = classMembers.findIndex((member) => !member.static);
    if (insertionIndex === -1) {
      classMembers.push(constructorMethod);
    } else {
      classMembers.splice(insertionIndex, 0, constructorMethod);
    }
  }

  const handlerMembers = handlerInfos.map((handler) =>
    createHandlerClassMember(handler)
  );

  const renderMethod = t.classMethod(
    "method",
    t.identifier("render"),
    [],
    t.blockStatement(renderStatements)
  );

  classMembers.push(...handlerMembers, renderMethod);
  return classMembers;
}

export function createComponentClass({
  className,
  tagName = null,
  classMembers,
  hoistMembers,
  hoistSymbolDeclarations,
  hostTypeId,
  needsStaticHoistsMixin,
  lightDomRequested,
  needsCss,
  needsUnsafeCss,
  needsCallbackRef = false,
  needsModuleIdMetadata = false,
  moduleId = null,
}) {
  const classNode = t.classDeclaration(
    t.identifier(className),
    t.identifier("LitElement"),
    t.classBody(classMembers)
  );
  classNode.__litsxGeneratedComponent = true;

  if (hostTypeId) {
    const componentMarkerProperty = createStaticRuntimeMetadataProperty(
      "litsx.component",
      t.booleanLiteral(true)
    );
    const hydratableTagProperty = createStaticRuntimeMetadataProperty(
      "litsx.hydratableTag",
      t.stringLiteral(tagName ?? toKebabCase(className))
    );
    const hostTypeIdProperty = createStaticRuntimeMetadataProperty(
      "litsx.hostTypeId",
      t.stringLiteral(hostTypeId)
    );
    classNode.body.body.unshift(componentMarkerProperty);
    classNode.body.body.unshift(hydratableTagProperty);
    classNode.body.body.unshift(hostTypeIdProperty);
  }

  if (hoistMembers.length > 0) {
    classNode.body.body.unshift(...hoistMembers);
    if (hoistSymbolDeclarations.length > 0) {
      classNode._litsxStaticSymbolDeclarations = hoistSymbolDeclarations;
    }
    if (needsStaticHoistsMixin) {
      classNode.superClass = t.callExpression(
        t.identifier("LitsxStaticHoistsMixin"),
        [classNode.superClass]
      );
      classNode._needsStaticHoistsMixin = true;
    }
  }

  if (lightDomRequested) {
    classNode.superClass = t.callExpression(
      t.identifier("LightDomMixin"),
      [classNode.superClass]
    );
    classNode._needsLightDomMixin = true;
  }

  classNode._needsCss = needsCss;
  classNode._needsUnsafeCss = needsUnsafeCss;
  classNode._needsCallbackRef = needsCallbackRef;
  classNode._needsModuleIdMetadata = needsModuleIdMetadata;

  if (needsModuleIdMetadata) {
    const moduleIdProperty = t.classProperty(
      t.identifier("LITSX_MODULE_ID"),
      t.stringLiteral(moduleId ?? ""),
    );
    moduleIdProperty.static = true;
    moduleIdProperty.computed = true;
    classNode.body.body.unshift(moduleIdProperty);
  }
  return classNode;
}
