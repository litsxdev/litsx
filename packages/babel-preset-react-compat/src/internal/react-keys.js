import { declare } from "@babel/helper-plugin-utils";
import jsxSyntaxPlugin from "@babel/plugin-syntax-jsx";

const REPEAT_MODULE = "lit/directives/repeat.js";
const KEYED_MODULE = "lit/directives/keyed.js";

function getKeyAttribute(element, t) {
  if (!t.isJSXElement(element)) return null;
  return element.openingElement.attributes.find(
    (attribute) =>
      t.isJSXAttribute(attribute) &&
      t.isJSXIdentifier(attribute.name, { name: "key" }),
  ) ?? null;
}

function attributeValueToExpression(attribute, t) {
  if (!attribute?.value) return t.booleanLiteral(true);
  if (t.isJSXExpressionContainer(attribute.value)) {
    return t.isJSXEmptyExpression(attribute.value.expression)
      ? t.booleanLiteral(true)
      : t.cloneNode(attribute.value.expression, true);
  }
  return t.cloneNode(attribute.value, true);
}

function removeAttribute(element, attribute) {
  const attributes = element.openingElement.attributes;
  const index = attributes.indexOf(attribute);
  if (index >= 0) attributes.splice(index, 1);
}

function isMapCall(expression, t) {
  return (
    t.isCallExpression(expression) &&
    !expression.optional &&
    t.isMemberExpression(expression.callee) &&
    !expression.callee.optional &&
    !expression.callee.computed &&
    t.isIdentifier(expression.callee.property, { name: "map" })
  );
}

function getReturnedElement(callback, t) {
  if (t.isJSXElement(callback.body)) {
    return { element: callback.body, returnStatement: null };
  }
  if (
    t.isBlockStatement(callback.body) &&
    callback.body.body.length > 0
  ) {
    const returnStatement = callback.body.body.at(-1);
    if (t.isReturnStatement(returnStatement) && t.isJSXElement(returnStatement.argument)) {
      return {
        element: returnStatement.argument,
        returnStatement: callback.body.body.length === 1 ? null : returnStatement,
      };
    }
  }
  return null;
}

function getMapParts(expression, t) {
  if (
    !isMapCall(expression, t) ||
    expression.arguments.length !== 1 ||
    !t.isMemberExpression(expression.callee)
  ) {
    return null;
  }

  const callback = expression.arguments[0];
  if (
    (!t.isArrowFunctionExpression(callback) && !t.isFunctionExpression(callback)) ||
    callback.async ||
    callback.generator ||
    callback.params.length > 2
  ) {
    return null;
  }

  const returned = getReturnedElement(callback, t);
  if (!returned) return null;
  const keyAttribute = getKeyAttribute(returned.element, t);
  if (!keyAttribute) return null;
  return {
    items: expression.callee.object,
    callback,
    element: returned.element,
    returnStatement: returned.returnStatement,
    keyAttribute,
  };
}

function createDecoratedRepeat(parts, keyExpression, repeatLocalName, t) {
  const decoratedCallback = t.cloneNode(parts.callback, true);
  const returnStatement = decoratedCallback.body.body.at(-1);
  returnStatement.argument = t.arrayExpression([
    t.cloneNode(keyExpression, true),
    returnStatement.argument,
  ]);

  const entryForKey = t.identifier("entry");
  const entryForValue = t.identifier("entry");
  return t.callExpression(t.identifier(repeatLocalName), [
    t.callExpression(
      t.memberExpression(t.cloneNode(parts.items, true), t.identifier("map")),
      [decoratedCallback],
    ),
    t.arrowFunctionExpression(
      [entryForKey],
      t.memberExpression(t.cloneNode(entryForKey), t.numericLiteral(0), true),
    ),
    t.arrowFunctionExpression(
      [entryForValue],
      t.memberExpression(t.cloneNode(entryForValue), t.numericLiteral(1), true),
    ),
  ]);
}

function lowerMapParts(parts, state, t) {
  const keyExpression = attributeValueToExpression(parts.keyAttribute, t);
  removeAttribute(parts.element, parts.keyAttribute);
  state.repeatNeeded = true;
  if (parts.returnStatement) {
    return createDecoratedRepeat(parts, keyExpression, state.repeatLocalName, t);
  }

  const keyFunction = t.arrowFunctionExpression(
    parts.callback.params.map((parameter) => t.cloneNode(parameter, true)),
    keyExpression,
  );
  return t.callExpression(t.identifier(state.repeatLocalName), [
    t.cloneNode(parts.items, true),
    keyFunction,
    parts.callback,
  ]);
}

function isInsideMapCallback(path, t) {
  const callbackPath = path.findParent(
    (parentPath) =>
      parentPath.isArrowFunctionExpression?.() ||
      parentPath.isFunctionExpression?.(),
  );
  if (!callbackPath) return false;
  const callPath = callbackPath.parentPath;
  return Boolean(
    callPath?.isCallExpression?.() &&
    isMapCall(callPath.node, t) &&
    callPath.node.arguments.includes(callbackPath.node),
  );
}

function findExistingImport(programPath, source, importedName, t) {
  for (const statementPath of programPath.get("body")) {
    if (!statementPath.isImportDeclaration()) continue;
    if (statementPath.node.source.value !== source) continue;
    for (const specifier of statementPath.node.specifiers) {
      if (
        t.isImportSpecifier(specifier) &&
        t.isIdentifier(specifier.imported, { name: importedName })
      ) {
        return specifier.local.name;
      }
    }
  }
  return null;
}

function chooseLocalName(programPath, source, importedName, t) {
  const existing = findExistingImport(programPath, source, importedName, t);
  if (existing) return existing;
  return programPath.scope.hasBinding(importedName)
    ? programPath.scope.generateUidIdentifier(importedName).name
    : importedName;
}

function addDirectiveImport(programPath, source, importedName, localName, t) {
  if (findExistingImport(programPath, source, importedName, t)) return;
  const specifier = t.importSpecifier(
    t.identifier(localName),
    t.identifier(importedName),
  );
  const existingDeclaration = programPath.get("body").find(
    (statementPath) =>
      statementPath.isImportDeclaration() &&
      statementPath.node.source.value === source &&
      !statementPath.node.specifiers.some((entry) => t.isImportNamespaceSpecifier(entry)),
  );
  if (existingDeclaration) {
    existingDeclaration.pushContainer("specifiers", specifier);
    return;
  }
  programPath.unshiftContainer(
    "body",
    t.importDeclaration([specifier], t.stringLiteral(source)),
  );
}

function wrapForJsxParent(path, expression, t) {
  return path.parentPath?.isJSXElement() || path.parentPath?.isJSXFragment()
    ? t.jsxExpressionContainer(expression)
    : expression;
}

export default declare((api) => {
  api.assertVersion("^8.0.0");
  const t = api.types;

  return {
    name: "transform-react-keys",
    inherits: jsxSyntaxPlugin.default || jsxSyntaxPlugin,
    visitor: {
      Program: {
        enter(path, state) {
          state.repeatLocalName = chooseLocalName(path, REPEAT_MODULE, "repeat", t);
          state.keyedLocalName = chooseLocalName(path, KEYED_MODULE, "keyed", t);
          state.repeatNeeded = false;
          state.keyedNeeded = false;
        },
        exit(path, state) {
          if (state.repeatNeeded) {
            addDirectiveImport(path, REPEAT_MODULE, "repeat", state.repeatLocalName, t);
          }
          if (state.keyedNeeded) {
            addDirectiveImport(path, KEYED_MODULE, "keyed", state.keyedLocalName, t);
          }
        },
      },
      JSXExpressionContainer(path, state) {
        const parts = getMapParts(path.node.expression, t);
        if (!parts) return;
        path.node.expression = lowerMapParts(parts, state, t);
      },
      CallExpression(path, state) {
        const parts = getMapParts(path.node, t);
        if (!parts) return;
        path.replaceWith(lowerMapParts(parts, state, t));
      },
      JSXElement(path, state) {
        const keyAttribute = getKeyAttribute(path.node, t);
        if (!keyAttribute) return;
        if (isInsideMapCallback(path, t)) {
          throw path.buildCodeFrameError(
            "React key inside this map() callback cannot be lowered safely. " +
            "Use repeat(items, keyFn, renderItem) from lit/directives/repeat.js explicitly.",
          );
        }

        const keyExpression = attributeValueToExpression(keyAttribute, t);
        removeAttribute(path.node, keyAttribute);
        state.keyedNeeded = true;
        path.replaceWith(
          wrapForJsxParent(
            path,
            t.callExpression(t.identifier(state.keyedLocalName), [
              keyExpression,
              t.cloneNode(path.node, true),
            ]),
            t,
          ),
        );
      },
    },
  };
});
