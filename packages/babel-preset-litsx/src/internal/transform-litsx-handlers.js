let t;

export function setHandlersBabelTypes(types) {
  t = types;
}

function isHoistableHandler(exprPath, componentPath) {
  let hoistable = true;

  exprPath.traverse({
    Identifier(identifierPath) {
      if (!identifierPath.isReferencedIdentifier()) return;

      const name = identifierPath.node.name;
      const ownBinding = exprPath.scope.getOwnBinding(name);
      if (ownBinding) return;

      const binding = identifierPath.scope.getBinding(name);
      if (!binding) return;

      if (binding.scope === componentPath.scope) {
        hoistable = false;
        identifierPath.stop();
      }
    },
  });

  return hoistable;
}

function ensureUniqueHandlerName(baseName, usedNames) {
  let candidate = baseName;
  let suffix = 2;

  while (usedNames.has(candidate)) {
    candidate = `${baseName}${suffix}`;
    suffix += 1;
  }

  usedNames.add(candidate);
  return candidate;
}

function generateHandlerName(attrName, usedNames) {
  const eventSegment = attrName.slice(2) || "Event";
  const base = `handle${eventSegment}`;
  return ensureUniqueHandlerName(base, usedNames);
}

function normalizeHandlerBody(body) {
  if (t.isBlockStatement(body)) {
    return t.cloneNode(body, true);
  }

  return t.blockStatement([t.returnStatement(t.cloneNode(body, true))]);
}

function hoistDeclaredHandlers(functionPath, usedNames) {
  const handlerInfos = [];
  const bodyPath = functionPath.get("body");
  if (!bodyPath.isBlockStatement()) {
    return handlerInfos;
  }

  functionPath.traverse({
    VariableDeclarator(path) {
      if (path.getFunctionParent() !== functionPath) return;

      const id = path.node.id;
      if (!t.isIdentifier(id)) return;

      const initPath = path.get("init");
      if (!initPath.isArrowFunctionExpression() && !initPath.isFunctionExpression()) {
        return;
      }

      const statementParent = path.getStatementParent();
      if (!statementParent || statementParent.parentPath !== bodyPath) {
        return;
      }

      if (!isHoistableHandler(initPath, functionPath)) return;

      const originalName = id.name;
      usedNames.delete(originalName);
      const handlerName = ensureUniqueHandlerName(originalName, usedNames);
      const binding = path.scope.getBinding(originalName);

      if (!binding) return;

      binding.referencePaths.slice().forEach((refPath) => {
        if (!refPath.node || refPath.removed) return;
        refPath.replaceWith(
          t.memberExpression(t.thisExpression(), t.identifier(handlerName))
        );
      });

      handlerInfos.push({
        name: handlerName,
        params: initPath.node.params.map((param) => t.cloneNode(param, true)),
        body: normalizeHandlerBody(initPath.node.body),
        async: initPath.node.async,
        generator: initPath.node.generator,
      });

      path.remove();

      if (
        statementParent.isVariableDeclaration() &&
        statementParent.node.declarations.length === 0
      ) {
        statementParent.remove();
      }

      binding.scope.removeBinding(originalName);
    },
  });

  return handlerInfos;
}

function hoistEventHandlers(functionPath, usedNames) {
  const handlerInfos = [];

  functionPath.traverse({
    JSXAttribute(attrPath) {
      if (attrPath.getFunctionParent() !== functionPath) return;

      const { node } = attrPath;
      if (!t.isJSXIdentifier(node.name)) return;

      const attrName = node.name.name;
      if (!/^on[A-Z]/.test(attrName)) return;

      const valuePath = attrPath.get("value");
      if (!valuePath.isJSXExpressionContainer()) return;

      const exprPath = valuePath.get("expression");
      if (
        !exprPath.isArrowFunctionExpression() &&
        !exprPath.isFunctionExpression()
      ) {
        return;
      }

      if (!isHoistableHandler(exprPath, functionPath)) return;

      const handlerName = generateHandlerName(attrName, usedNames);

      handlerInfos.push({
        name: handlerName,
        params: exprPath.node.params.map((param) => t.cloneNode(param, true)),
        body: normalizeHandlerBody(exprPath.node.body),
        async: exprPath.node.async,
        generator: exprPath.node.generator,
      });

      valuePath.replaceWith(
        t.jsxExpressionContainer(
          t.memberExpression(t.thisExpression(), t.identifier(handlerName))
        )
      );
    },
  });

  return handlerInfos;
}

function isNativeIntrinsicJsxElement(nameNode) {
  return t.isJSXIdentifier(nameNode) && /^[a-z]/.test(nameNode.name);
}

export function collectNativeClassNameWarnings(functionPath, warn, options = {}) {
  if (typeof warn !== "function" || options.suppressNativeClassNameWarning === true) {
    return;
  }

  functionPath.traverse({
    JSXAttribute(attrPath) {
      if (attrPath.getFunctionParent() !== functionPath) return;

      const openingElement = attrPath.parentPath;
      if (!openingElement?.isJSXOpeningElement()) return;
      if (!isNativeIntrinsicJsxElement(openingElement.node.name)) return;

      const { node } = attrPath;
      if (!t.isJSXIdentifier(node.name, { name: "className" })) return;

      warn({
        code: "LITSX_NATIVE_CLASSNAME",
        message:
          '`className` is not native LitSX syntax. Use `class` in native LitSX, or add the React compatibility layer to rewrite `className`.',
        attributeName: "className",
        tagName: openingElement.node.name.name,
        line: node.loc?.start?.line ?? null,
        column: node.loc?.start?.column ?? null,
      });
    },
  });
}

export function processHandlers(functionPath, usedNames) {
  const declaredHandlers = hoistDeclaredHandlers(functionPath, usedNames);
  const inlineHandlers = hoistEventHandlers(functionPath, usedNames);
  return [...declaredHandlers, ...inlineHandlers];
}

export function createHandlerClassMember({ name, params, body, async, generator }) {
  const method = t.classMethod(
    "method",
    t.identifier(name),
    params.map((param) => t.cloneNode(param, true)),
    t.cloneNode(body, true)
  );

  method.async = Boolean(async);
  method.generator = Boolean(generator);

  return method;
}
