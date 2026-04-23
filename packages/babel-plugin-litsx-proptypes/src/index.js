import helperPluginUtils from "@babel/helper-plugin-utils";

const { declare } = helperPluginUtils;

const PROP_TYPES_MODULE = "prop-types";
const PROP_TYPES_RUNTIME_MODULE = "@litsx/prop-types/runtime";

const DIRECT_PROP_TYPE_MAP = new Map(
  Object.entries({
    string: "String",
    number: "Number",
    bool: "Boolean",
    boolean: "Boolean",
    array: "Array",
    object: "Object",
    func: "Object",
    symbol: "Object",
    node: "Object",
    element: "Object",
    elementType: "Object",
    any: "Object",
  })
);

function getImportSource(bindingPath) {
  if (!bindingPath?.parentPath?.isImportDeclaration()) {
    return null;
  }

  return bindingPath.parentPath.node.source.value;
}

function isPropTypesReference(node, scope, t) {
  if (!t.isIdentifier(node)) return false;
  const binding = scope.getBinding(node.name);
  return Boolean(binding?.path && getImportSource(binding.path) === PROP_TYPES_MODULE);
}

function extractPropTypeComponents(node, t) {
  let current = node;
  let required = false;

  while (
    t.isMemberExpression(current) &&
    !current.computed &&
    t.isIdentifier(current.property, { name: "isRequired" })
  ) {
    required = true;
    current = current.object;
  }

  return { expression: current, required };
}

function getPropertyKeyName(key, t) {
  if (t.isIdentifier(key)) return key.name;
  if (t.isStringLiteral(key)) return key.value;
  if (t.isNumericLiteral(key)) return String(key.value);
  return null;
}

function getOrCreateRuntimeImport(programPath, helperName, t) {
  let helperMap = programPath.getData("__litsxPropTypesRuntimeHelpers");
  if (!helperMap) {
    helperMap = new Map();
    programPath.setData("__litsxPropTypesRuntimeHelpers", helperMap);
  }

  if (helperMap.has(helperName)) {
    return helperMap.get(helperName);
  }

  let importPath = programPath.getData("__litsxPropTypesRuntimeImportPath");
  if (!importPath?.isImportDeclaration()) {
    const importNode = t.importDeclaration([], t.stringLiteral(PROP_TYPES_RUNTIME_MODULE));
    const bodyPaths = programPath.get("body");
    const lastImport = [...bodyPaths].reverse().find((bodyPath) => bodyPath.isImportDeclaration());

    if (lastImport) {
      [importPath] = lastImport.insertAfter(importNode);
    } else {
      [importPath] = programPath.unshiftContainer("body", importNode);
    }

    programPath.setData("__litsxPropTypesRuntimeImportPath", importPath);
  }

  const localId = programPath.scope.generateUidIdentifier(`litsxPropType${helperName[0].toUpperCase()}${helperName.slice(1)}`);
  importPath.pushContainer(
    "specifiers",
    t.importSpecifier(t.cloneNode(localId), t.identifier(helperName))
  );
  helperMap.set(helperName, localId);
  return localId;
}

function inferOneOfType(arrayNode, t) {
  if (!t.isArrayExpression(arrayNode)) {
    return "Object";
  }

  const typeSet = new Set();
  arrayNode.elements.forEach((element) => {
    if (!element) return;
    if (t.isStringLiteral(element)) {
      typeSet.add("String");
    } else if (t.isNumericLiteral(element)) {
      typeSet.add("Number");
    } else if (t.isBooleanLiteral(element)) {
      typeSet.add("Boolean");
    } else {
      typeSet.add("Object");
    }
  });

  if (typeSet.size === 1) {
    return typeSet.values().next().value;
  }

  if (typeSet.has("Object")) {
    return "Object";
  }

  return "Object";
}

function buildRuntimeValidatorExpression(node, state) {
  const { t, path, scope, programPath } = state;
  const { expression, required } = extractPropTypeComponents(node, t);
  let validatorExpression;

  if (t.isMemberExpression(expression) && !expression.computed) {
    if (!isPropTypesReference(expression.object, scope, t) || !t.isIdentifier(expression.property)) {
      throw path.buildCodeFrameError("Unsupported propTypes expression.");
    }

    const typeName = DIRECT_PROP_TYPE_MAP.get(expression.property.name) || "Object";
    validatorExpression = t.identifier(typeName);
  } else if (
    t.isCallExpression(expression) &&
    t.isMemberExpression(expression.callee) &&
    !expression.callee.computed &&
    isPropTypesReference(expression.callee.object, scope, t) &&
    t.isIdentifier(expression.callee.property)
  ) {
    const method = expression.callee.property.name;
    switch (method) {
      case "oneOf": {
        const helperId = getOrCreateRuntimeImport(programPath, "oneOf", t);
        validatorExpression = t.callExpression(helperId, [
          t.cloneNode(expression.arguments[0] || t.arrayExpression([]), true),
        ]);
        break;
      }
      case "oneOfType": {
        const helperId = getOrCreateRuntimeImport(programPath, "oneOfType", t);
        const typesArg = expression.arguments[0];
        const elements =
          t.isArrayExpression(typesArg)
            ? typesArg.elements
                .filter(Boolean)
                .map((element) => buildRuntimeValidatorExpression(element, state))
            : [];
        validatorExpression = t.callExpression(helperId, [t.arrayExpression(elements)]);
        break;
      }
      case "arrayOf": {
        const helperId = getOrCreateRuntimeImport(programPath, "arrayOf", t);
        validatorExpression = t.callExpression(helperId, [
          buildRuntimeValidatorExpression(expression.arguments[0], state),
        ]);
        break;
      }
      case "objectOf": {
        const helperId = getOrCreateRuntimeImport(programPath, "objectOf", t);
        validatorExpression = t.callExpression(helperId, [
          buildRuntimeValidatorExpression(expression.arguments[0], state),
        ]);
        break;
      }
      case "shape":
      case "exact": {
        const helperId = getOrCreateRuntimeImport(programPath, method, t);
        const schemaArg = expression.arguments[0];
        const schemaProperties = [];

        if (t.isObjectExpression(schemaArg)) {
          schemaArg.properties.forEach((property) => {
            if (!t.isObjectProperty(property)) {
              throw path.buildCodeFrameError(`PropTypes.${method}(...) only accepts plain object members.`);
            }
            const keyName = getPropertyKeyName(property.key, t);
            if (!keyName) {
              throw path.buildCodeFrameError(`PropTypes.${method}(...) only accepts static property names.`);
            }
            schemaProperties.push(
              t.objectProperty(
                t.isIdentifier(property.key)
                  ? t.identifier(property.key.name)
                  : t.stringLiteral(keyName),
                buildRuntimeValidatorExpression(property.value, state)
              )
            );
          });
        }

        validatorExpression = t.callExpression(helperId, [t.objectExpression(schemaProperties)]);
        break;
      }
      case "instanceOf": {
        const target = expression.arguments[0];
        if (!target) {
          throw path.buildCodeFrameError("PropTypes.instanceOf(...) expects a constructor.");
        }

        if (t.isIdentifier(target, { name: "Date" })) {
          validatorExpression = t.identifier("Date");
        } else {
          const helperId = getOrCreateRuntimeImport(programPath, "instanceOf", t);
          validatorExpression = t.callExpression(helperId, [t.cloneNode(target, true)]);
        }
        break;
      }
      default:
        throw path.buildCodeFrameError(`Unsupported React prop-types helper: PropTypes.${method}(...)`);
    }
  } else {
    throw path.buildCodeFrameError("Custom propTypes validators are not supported yet.");
  }

  if (!required) {
    return validatorExpression;
  }

  const requiredId = getOrCreateRuntimeImport(programPath, "required", t);
  return t.callExpression(requiredId, [validatorExpression]);
}

function buildPropertyDescriptor(node, state) {
  const { t, path, scope, programPath } = state;
  const { expression, required } = extractPropTypeComponents(node, t);
  const properties = [];

  const addRequiredSpread = () => {
    if (!required) return;
    const requiredId = getOrCreateRuntimeImport(programPath, "required", t);
    properties.push(t.spreadElement(t.callExpression(requiredId, [])));
  };

  if (t.isMemberExpression(expression) && !expression.computed) {
    if (!isPropTypesReference(expression.object, scope, t) || !t.isIdentifier(expression.property)) {
      throw path.buildCodeFrameError("Unsupported propTypes expression.");
    }

    const memberName = expression.property.name;
    const typeName = DIRECT_PROP_TYPE_MAP.get(memberName) || "Object";
    properties.push(t.objectProperty(t.identifier("type"), t.identifier(typeName)));

    if (memberName === "func") {
      properties.push(t.objectProperty(t.identifier("attribute"), t.booleanLiteral(false)));
    }

    addRequiredSpread();
    return t.objectExpression(properties);
  }

  if (
    t.isCallExpression(expression) &&
    t.isMemberExpression(expression.callee) &&
    !expression.callee.computed &&
    isPropTypesReference(expression.callee.object, scope, t) &&
    t.isIdentifier(expression.callee.property)
  ) {
    const method = expression.callee.property.name;

    switch (method) {
      case "oneOf": {
        properties.push(
          t.objectProperty(
            t.identifier("type"),
            t.identifier(inferOneOfType(expression.arguments[0], t))
          )
        );
        properties.push(
          t.spreadElement(
            t.callExpression(getOrCreateRuntimeImport(programPath, "oneOf", t), [
              t.cloneNode(expression.arguments[0] || t.arrayExpression([]), true),
            ])
          )
        );
        break;
      }
      case "oneOfType": {
        const typesArg = expression.arguments[0];
        const elements =
          t.isArrayExpression(typesArg)
            ? typesArg.elements
                .filter(Boolean)
                .map((element) => buildRuntimeValidatorExpression(element, state))
            : [];
        properties.push(t.objectProperty(t.identifier("type"), t.identifier("Object")));
        properties.push(
          t.spreadElement(
            t.callExpression(getOrCreateRuntimeImport(programPath, "oneOfType", t), [
              t.arrayExpression(elements),
            ])
          )
        );
        break;
      }
      case "arrayOf": {
        properties.push(t.objectProperty(t.identifier("type"), t.identifier("Array")));
        properties.push(
          t.spreadElement(
            t.callExpression(getOrCreateRuntimeImport(programPath, "arrayOf", t), [
              buildRuntimeValidatorExpression(expression.arguments[0], state),
            ])
          )
        );
        break;
      }
      case "objectOf": {
        properties.push(t.objectProperty(t.identifier("type"), t.identifier("Object")));
        properties.push(t.objectProperty(t.identifier("attribute"), t.booleanLiteral(false)));
        properties.push(
          t.spreadElement(
            t.callExpression(getOrCreateRuntimeImport(programPath, "objectOf", t), [
              buildRuntimeValidatorExpression(expression.arguments[0], state),
            ])
          )
        );
        break;
      }
      case "shape":
      case "exact": {
        const schemaArg = expression.arguments[0];
        const schemaProperties = [];

        if (t.isObjectExpression(schemaArg)) {
          schemaArg.properties.forEach((property) => {
            if (!t.isObjectProperty(property)) {
              throw path.buildCodeFrameError(`PropTypes.${method}(...) only accepts plain object members.`);
            }
            const keyName = getPropertyKeyName(property.key, t);
            if (!keyName) {
              throw path.buildCodeFrameError(`PropTypes.${method}(...) only accepts static property names.`);
            }
            schemaProperties.push(
              t.objectProperty(
                t.isIdentifier(property.key)
                  ? t.identifier(property.key.name)
                  : t.stringLiteral(keyName),
                buildRuntimeValidatorExpression(property.value, state)
              )
            );
          });
        }

        properties.push(t.objectProperty(t.identifier("type"), t.identifier("Object")));
        properties.push(t.objectProperty(t.identifier("attribute"), t.booleanLiteral(false)));
        properties.push(
          t.spreadElement(
            t.callExpression(getOrCreateRuntimeImport(programPath, method, t), [
              t.objectExpression(schemaProperties),
            ])
          )
        );
        break;
      }
      case "instanceOf": {
        const target = expression.arguments[0];
        if (!target) {
          throw path.buildCodeFrameError("PropTypes.instanceOf(...) expects a constructor.");
        }

        if (t.isIdentifier(target, { name: "Date" })) {
          properties.push(t.objectProperty(t.identifier("type"), t.identifier("Date")));
        } else {
          properties.push(t.objectProperty(t.identifier("type"), t.cloneNode(target, true)));
          properties.push(
            t.spreadElement(
              t.callExpression(getOrCreateRuntimeImport(programPath, "instanceOf", t), [
                t.cloneNode(target, true),
              ])
            )
          );
        }
        break;
      }
      default:
        throw path.buildCodeFrameError(`Unsupported React prop-types helper: PropTypes.${method}(...)`);
    }

    addRequiredSpread();
    return t.objectExpression(properties);
  }

  throw path.buildCodeFrameError("Custom propTypes validators are not supported yet.");
}

function ensureBlockBody(functionPath, t) {
  if (functionPath.isArrowFunctionExpression() && !functionPath.get("body").isBlockStatement()) {
    functionPath.get("body").replaceWith(
      t.blockStatement([t.returnStatement(t.cloneNode(functionPath.node.body, true))])
    );
  }

  return functionPath.get("body");
}

function unwrapComponentFunction(path) {
  if (!path) return null;

  if (
    path.isFunctionDeclaration?.() ||
    path.isFunctionExpression?.() ||
    path.isArrowFunctionExpression?.()
  ) {
    return path;
  }

  if (path.isVariableDeclarator?.()) {
    return unwrapComponentFunction(path.get("init"));
  }

  if (path.isExportDefaultDeclaration?.() || path.isExportNamedDeclaration?.()) {
    return unwrapComponentFunction(path.get("declaration"));
  }

  if (path.isCallExpression?.()) {
    const args = path.get("arguments");
    if (!args.length) return null;
    return unwrapComponentFunction(args[0]);
  }

  return null;
}

function buildGeneratedPropertiesObject(propTypes, state) {
  const { t } = state;
  const properties = [];

  propTypes.forEach((property) => {
    if (!t.isObjectProperty(property)) {
      throw state.path.buildCodeFrameError("Custom propTypes validators are not supported yet.");
    }
    const keyName = getPropertyKeyName(property.key, t);
    if (!keyName) return;

    properties.push(
      t.objectProperty(
        t.isIdentifier(property.key)
          ? t.identifier(property.key.name)
          : t.stringLiteral(keyName),
        buildPropertyDescriptor(property.value, state)
      )
    );
  });

  return t.objectExpression(properties);
}

function mergePropertiesObjects(generatedObject, explicitObject, t) {
  const mergedProperties = generatedObject.properties.map((property) => t.cloneNode(property, true));
  const propertyIndexes = new Map();

  mergedProperties.forEach((property, index) => {
    if (!t.isObjectProperty(property)) return;
    const keyName = getPropertyKeyName(property.key, t);
    if (!keyName) return;
    propertyIndexes.set(keyName, index);
  });

  explicitObject.properties.forEach((property) => {
    if (t.isSpreadElement(property)) {
      mergedProperties.push(t.cloneNode(property, true));
      return;
    }

    if (!t.isObjectProperty(property)) {
      mergedProperties.push(t.cloneNode(property, true));
      return;
    }

    const keyName = getPropertyKeyName(property.key, t);
    if (!keyName) {
      mergedProperties.push(t.cloneNode(property, true));
      return;
    }

    const existingIndex = propertyIndexes.get(keyName);
    if (existingIndex == null) {
      propertyIndexes.set(keyName, mergedProperties.length);
      mergedProperties.push(t.cloneNode(property, true));
      return;
    }

    const existing = mergedProperties[existingIndex];
    if (
      t.isObjectProperty(existing) &&
      t.isObjectExpression(existing.value) &&
      t.isObjectExpression(property.value)
    ) {
      mergedProperties[existingIndex] = t.objectProperty(
        t.cloneNode(existing.key, true),
        t.objectExpression([
          t.spreadElement(t.cloneNode(existing.value, true)),
          ...property.value.properties.map((member) => t.cloneNode(member, true)),
        ])
      );
      return;
    }

    mergedProperties[existingIndex] = t.cloneNode(property, true);
  });

  return t.objectExpression(mergedProperties);
}

function findExistingPropertiesHoist(bodyPath, t) {
  return bodyPath.get("body").find((statementPath) => {
    if (!statementPath.isExpressionStatement()) return false;
    const expressionPath = statementPath.get("expression");
    if (!expressionPath.isCallExpression()) return false;
    const callee = expressionPath.get("callee");
    if (!callee.isIdentifier({ name: "__litsx_static_properties" })) return false;
    const args = expressionPath.get("arguments");
    return args.length === 1 && args[0].isObjectExpression();
  }) || null;
}

export default declare((api) => {
  api.assertVersion(7);
  const t = api.types;

  return {
    name: "litsx-proptypes",
    visitor: {
      Program: {
        enter(programPath) {
          programPath.traverse({
            AssignmentExpression(path) {
              if (
                !t.isMemberExpression(path.node.left) ||
                path.node.left.computed ||
                !t.isIdentifier(path.node.left.property, { name: "propTypes" }) ||
                !t.isObjectExpression(path.node.right) ||
                !t.isIdentifier(path.node.left.object)
              ) {
                return;
              }

              const componentName = path.node.left.object.name;
              const binding = path.scope.getBinding(componentName);
              if (!binding) return;

              const functionPath = unwrapComponentFunction(binding.path);
              if (!functionPath) return;

              const bodyPath = ensureBlockBody(functionPath, t);
              if (!bodyPath.isBlockStatement()) return;

              const state = {
                t,
                path,
                scope: path.scope,
                programPath,
              };

              const generatedProperties = buildGeneratedPropertiesObject(path.node.right.properties, state);
              const existingHoistPath = findExistingPropertiesHoist(bodyPath, t);

              if (existingHoistPath) {
                const existingObject = existingHoistPath.node.expression.arguments[0];
                existingHoistPath.node.expression.arguments[0] = mergePropertiesObjects(
                  generatedProperties,
                  existingObject,
                  t
                );
              } else {
                bodyPath.unshiftContainer(
                  "body",
                  t.expressionStatement(
                    t.callExpression(t.identifier("__litsx_static_properties"), [generatedProperties])
                  )
                );
              }

              if (path.parentPath.isExpressionStatement()) {
                path.parentPath.remove();
              } else {
                path.remove();
              }
            },
          });
        },
        exit(programPath) {
          const propTypeImports = programPath.get("body").filter(
            (nodePath) =>
              nodePath.isImportDeclaration() &&
              nodePath.node.source.value === PROP_TYPES_MODULE
          );

          if (propTypeImports.length === 0) {
            return;
          }

          const usedNames = new Set();
          programPath.traverse({
            Identifier(identifierPath) {
              if (
                identifierPath.parentPath?.isImportDefaultSpecifier() ||
                identifierPath.parentPath?.isImportSpecifier() ||
                identifierPath.parentPath?.isImportNamespaceSpecifier()
              ) {
                return;
              }

              usedNames.add(identifierPath.node.name);
            },
          });

          propTypeImports.forEach((importPath) => {
            importPath.get("specifiers").forEach((specifierPath) => {
              const localName = specifierPath.node.local.name;
              if (!usedNames.has(localName)) {
                specifierPath.remove();
              }
            });

            if (importPath.node.specifiers.length === 0) {
              importPath.remove();
            }
          });
        },
      },
    },
  };
});
