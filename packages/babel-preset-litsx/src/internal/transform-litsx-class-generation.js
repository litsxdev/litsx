let t;

export function setClassGenerationBabelTypes(nextTypes) {
  t = nextTypes;
}

function createThisMemberExpression(propName) {
  return t.memberExpression(t.thisExpression(), t.identifier(propName));
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
  classMembers,
  hoistMembers,
  hoistSymbolDeclarations,
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
  classNode._litsxLightDom = lightDomRequested;
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
