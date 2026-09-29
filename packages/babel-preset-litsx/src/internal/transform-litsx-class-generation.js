import { componentNameToTagName } from "@litsx/authoring";

let t;

export function setClassGenerationBabelTypes(nextTypes) {
  t = nextTypes;
}

function createThisMemberExpression(propName) {
  const computed = !t.isValidIdentifier(propName);
  return t.memberExpression(
    t.thisExpression(),
    computed ? t.stringLiteral(propName) : t.identifier(propName),
    computed,
  );
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

export function buildClassMembers({
  classMembers = [],
  defaults,
  renderStatements,
  handlerInfos,
  createHandlerClassMember,
  wrapRender = false,
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

  const renderBody = wrapRender
    ? [
        t.returnStatement(
          t.callExpression(t.identifier("renderWithHooks"), [
            t.thisExpression(),
            t.arrowFunctionExpression([], t.blockStatement(renderStatements)),
          ])
        ),
      ]
    : renderStatements;

  const renderMethod = t.classMethod(
    "method",
    t.identifier("render"),
    [],
    t.blockStatement(renderBody)
  );

  classMembers.push(...handlerMembers, renderMethod);
  return classMembers;
}

export function createComponentClass({
  className,
  tagName = null,
  classMembers,
  hoistMembers,
  hostTypeId,
  eventMetadata,
  needsPropertyDeclarationMerge,
  lightDomRequested,
  lightDomStyleStrategy = "scoped",
  needsCss,
  needsUnsafeCss,
  needsCallbackRef = false,
  restProps = null,
  needsModuleIdMetadata = false,
  needsHydrationSuspenseMixin = false,
  moduleId = null,
}) {
  const classNode = t.classDeclaration(
    t.identifier(className),
    t.identifier("LitElement"),
    t.classBody(classMembers)
  );
  classNode.__litsxGeneratedComponent = true;

  if (restProps?.propertyName) {
    classNode.body.body.unshift(createStaticRuntimeMetadataProperty(
      "litsx.restProps",
      t.objectExpression([
        t.objectProperty(
          t.identifier("property"),
          t.stringLiteral(restProps.propertyName)
        ),
      ])
    ));
  }

  if (hostTypeId) {
    const componentMarkerProperty = createStaticRuntimeMetadataProperty(
      "litsx.component",
      t.booleanLiteral(true)
    );
    const hydratableTagProperty = createStaticRuntimeMetadataProperty(
      "litsx.hydratableTag",
      t.stringLiteral(tagName ?? componentNameToTagName(className))
    );
    const hostTypeIdProperty = createStaticRuntimeMetadataProperty(
      "litsx.hostTypeId",
      t.stringLiteral(hostTypeId)
    );
    classNode.body.body.unshift(componentMarkerProperty);
    classNode.body.body.unshift(hydratableTagProperty);
    classNode.body.body.unshift(hostTypeIdProperty);
    if (lightDomRequested && lightDomStyleStrategy === "scoped") {
      classNode.body.body.unshift(createStaticRuntimeMetadataProperty(
        "litsx.lightDomStyleScope",
        t.stringLiteral(hostTypeId.replace(/^litsx-host-type-/, "")),
      ));
    }
  }

  if (eventMetadata?.events?.length > 0 || eventMetadata?.complete === false) {
    const createEventMetadataValue = () => t.objectExpression([
        t.objectProperty(
          t.identifier("events"),
          t.arrayExpression(eventMetadata.events.map((name) => t.stringLiteral(name))),
        ),
        t.objectProperty(t.identifier("complete"), t.booleanLiteral(eventMetadata.complete)),
      ]);
    if (!eventMetadata.explicit) {
      const publicEventsProperty = t.classProperty(
        t.identifier("events"),
        createEventMetadataValue(),
      );
      publicEventsProperty.static = true;
      classNode.body.body.unshift(publicEventsProperty);
    }
    classNode.body.body.unshift(createStaticRuntimeMetadataProperty(
      "litsx.events",
      createEventMetadataValue(),
    ));
  }

  if (hoistMembers.length > 0) {
    classNode.body.body.unshift(...hoistMembers);
  }

  classNode._needsPropertyDeclarationMerge = needsPropertyDeclarationMerge;

  if (lightDomRequested) {
    classNode.superClass = t.callExpression(
      t.identifier("LightDomMixin"),
      [classNode.superClass]
    );
    classNode._needsLightDomMixin = true;
  }

  if (needsHydrationSuspenseMixin) {
    classNode.superClass = t.callExpression(
      t.identifier("HydrationSuspenseMixin"),
      [classNode.superClass]
    );
    classNode._needsHydrationSuspenseMixin = true;
  }

  classNode._needsCss = needsCss;
  classNode._needsUnsafeCss = needsUnsafeCss;
  classNode._needsCallbackRef = needsCallbackRef;
  classNode._needsRenderWithHooks = needsCallbackRef;
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
