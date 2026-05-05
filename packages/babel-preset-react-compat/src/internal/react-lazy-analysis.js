let t;

export function setReactLazyAnalysisBabelTypes(nextTypes) {
  t = nextTypes;
}

function toKebab(name) {
  return name.replace(/([a-z])([A-Z])/g, "$1-$2").toLowerCase();
}

function getExpressionKey(node) {
  if (t.isIdentifier(node)) {
    return node.name;
  }
  if (t.isMemberExpression(node) && !node.computed) {
    const objectKey = getExpressionKey(node.object);
    const propertyKey = t.isIdentifier(node.property) ? node.property.name : null;
    if (!objectKey || !propertyKey) return null;
    return `${objectKey}.${propertyKey}`;
  }
  return null;
}

export function cloneLazyMarked(node) {
  const cloned = t.cloneNode(node, true);
  cloned.__litsxLazyOrigin = true;
  return cloned;
}

export function isLazyCallee(path, state) {
  const callee = path.get("callee");

  if (callee.isIdentifier()) {
    return state.lazyLocalNames.has(callee.node.name);
  }

  if (callee.isMemberExpression({ computed: false })) {
    const object = callee.get("object");
    const property = callee.get("property");
    return (
      object.isIdentifier() &&
      state.reactNamespaceNames.has(object.node.name) &&
      property.isIdentifier({ name: "lazy" })
    );
  }

  return false;
}

function getReturnedExpression(node) {
  if (t.isArrowFunctionExpression(node) && t.isExpression(node.body)) {
    return node.body;
  }

  if (
    (t.isArrowFunctionExpression(node) || t.isFunctionExpression(node)) &&
    t.isBlockStatement(node.body)
  ) {
    const returnStatement = node.body.body.find((statement) =>
      t.isReturnStatement(statement)
    );
    return returnStatement?.argument ?? null;
  }

  return null;
}

function isImportCall(node) {
  return t.isCallExpression(node) && t.isImport(node.callee);
}

function isLoaderLike(node) {
  if (!node) return false;

  if (t.isArrowFunctionExpression(node) || t.isFunctionExpression(node)) {
    return isLoaderLike(getReturnedExpression(node));
  }

  if (isImportCall(node)) {
    return true;
  }

  if (t.isCallExpression(node) && t.isMemberExpression(node.callee)) {
    return isLoaderLike(node.callee.object);
  }

  if (t.isConditionalExpression(node)) {
    return isLoaderLike(node.consequent) || isLoaderLike(node.alternate);
  }

  return false;
}

function resolveObjectPropertyEntry(objectNode, propertyName) {
  return objectNode.properties.find((entry) => {
    if (!t.isObjectProperty(entry) || entry.computed) return false;
    return (
      (t.isIdentifier(entry.key) && entry.key.name === propertyName) ||
      (t.isStringLiteral(entry.key) && entry.key.value === propertyName)
    );
  });
}

function collectIfReturns(statement, returns) {
  const consequent = statement.consequent;
  const alternate = statement.alternate;

  const collect = (node) => {
    if (!node) return;
    if (t.isReturnStatement(node)) {
      returns.push(node.argument ?? t.identifier("undefined"));
      return;
    }
    if (t.isBlockStatement(node)) {
      node.body.forEach((entry) => collect(entry));
      return;
    }
    if (t.isIfStatement(node)) {
      collectIfReturns(node, returns);
    }
  };

  collect(consequent);
  collect(alternate);
}

function collectSwitchReturns(statement, returns) {
  statement.cases.forEach((switchCase) => {
    switchCase.consequent.forEach((entry) => {
      if (t.isReturnStatement(entry)) {
        returns.push(entry.argument ?? t.identifier("undefined"));
      }
    });
  });
}

function resolveFunctionReturnNode(callNode, scope, state, seen) {
  const callee = callNode.callee;
  if (!t.isIdentifier(callee)) {
    return null;
  }

  const binding = scope.getBinding(callee.name);
  if (!binding) return null;
  if (seen.has(binding.path.node)) return null;
  seen.add(binding.path.node);

  let fnNode = null;
  if (binding.path.isFunctionDeclaration()) {
    fnNode = binding.path.node;
  } else if (binding.path.isVariableDeclarator()) {
    const init = binding.path.node.init;
    if (t.isArrowFunctionExpression(init) || t.isFunctionExpression(init)) {
      fnNode = init;
    }
  }

  if (!fnNode) return null;

  if (t.isExpression(fnNode.body)) {
    return fnNode.body;
  }

  if (!t.isBlockStatement(fnNode.body)) return null;

  const returns = [];
  for (const statement of fnNode.body.body) {
    if (t.isReturnStatement(statement)) {
      returns.push(statement.argument ?? t.identifier("undefined"));
      continue;
    }
    if (t.isIfStatement(statement)) {
      collectIfReturns(statement, returns);
    }
    if (t.isSwitchStatement(statement)) {
      collectSwitchReturns(statement, returns);
    }
  }

  if (returns.length === 0) return null;
  if (returns.length === 1) return returns[0];
  return returns;
}

function resolveObjectProperty(node, propertyName, scope, state, seen) {
  const objectNode = resolveValueNode(node, scope, state, seen);
  if (!objectNode || !t.isObjectExpression(objectNode)) {
    return null;
  }

  const property = resolveObjectPropertyEntry(objectNode, propertyName);
  if (!property) return null;
  return property.value;
}

export function resolveValueNode(node, scope, state, seen = new Set()) {
  if (!node) return null;
  if (node.__litsxLazyOrigin) return node;
  if (t.isNullLiteral(node)) return node;
  if (t.isIdentifier(node, { name: "undefined" })) return node;
  if (t.isClassExpression(node) || t.isClassDeclaration(node)) return node;
  if (t.isObjectExpression(node)) return node;

  if (t.isIdentifier(node)) {
    const binding = scope.getBinding(node.name);
    if (!binding) return node;
    if (seen.has(binding.path.node)) return null;
    seen.add(binding.path.node);

    if (binding.path.isVariableDeclarator()) {
      return resolveValueNode(binding.path.node.init, binding.path.scope, state, seen);
    }

    if (binding.path.isClassDeclaration()) {
      return binding.path.node;
    }

    return null;
  }

  if (t.isMemberExpression(node) && !node.computed) {
    if (!t.isIdentifier(node.property)) return null;
    return resolveObjectProperty(node.object, node.property.name, scope, state, seen);
  }

  if (t.isConditionalExpression(node)) {
    const consequent = resolveValueNode(node.consequent, scope, state, seen);
    const alternate = resolveValueNode(node.alternate, scope, state, seen);
    return consequent && alternate ? node : null;
  }

  if (t.isCallExpression(node)) {
    if (node.__litsxLazyOrigin) return node;
    const resolved = resolveFunctionReturnNode(node, scope, state, seen);
    if (!resolved) return null;
    if (Array.isArray(resolved)) {
      return resolved.every((entry) => resolveValueNode(entry, scope, state, new Set(seen)))
        ? node
        : null;
    }
    return resolveValueNode(resolved, scope, state, seen) ? node : null;
  }

  return null;
}

export function hasLazyOrigin(node, scope, state, seen = new Set()) {
  if (!node) return false;
  if (node.__litsxLazyOrigin) return true;

  if (t.isIdentifier(node)) {
    const binding = scope.getBinding(node.name);
    if (!binding) return false;
    if (seen.has(binding.path.node)) return false;
    seen.add(binding.path.node);

    if (binding.path.isVariableDeclarator()) {
      return hasLazyOrigin(binding.path.node.init, binding.path.scope, state, seen);
    }

    return false;
  }

  if (t.isMemberExpression(node) && !node.computed) {
    if (!t.isIdentifier(node.property)) return false;
    const objectNode = resolveValueNode(node.object, scope, state, seen);
    if (!objectNode || !t.isObjectExpression(objectNode)) {
      return false;
    }

    const property = resolveObjectPropertyEntry(objectNode, node.property.name);
    if (!property) return false;
    if (property.__litsxLazyOrigin) return true;
    return hasLazyOrigin(property.value, scope, state, seen);
  }

  if (t.isConditionalExpression(node)) {
    return (
      hasLazyOrigin(node.consequent, scope, state, new Set(seen)) ||
      hasLazyOrigin(node.alternate, scope, state, new Set(seen))
    );
  }

  if (t.isCallExpression(node)) {
    const resolved = resolveFunctionReturnNode(node, scope, state, seen);
    if (!resolved) return false;
    if (Array.isArray(resolved)) {
      return resolved.some((entry) => hasLazyOrigin(entry, scope, state, new Set(seen)));
    }
    return hasLazyOrigin(resolved, scope, state, seen);
  }

  if (isLoaderLike(node)) {
    return true;
  }

  return false;
}

function createExpressionFromJSXName(node) {
  if (t.isJSXIdentifier(node)) {
    return t.identifier(node.__scopedOriginal || node.name);
  }
  if (t.isJSXMemberExpression(node)) {
    return t.memberExpression(
      createExpressionFromJSXName(node.object),
      t.identifier(node.property.name)
    );
  }
  return null;
}

function getSpecialMemberAttribute(openingElement) {
  return (openingElement.attributes ?? []).find(
    (attribute) =>
      t.isJSXAttribute(attribute) &&
      t.isJSXIdentifier(attribute.name) &&
      attribute.value == null &&
      attribute.name.name.startsWith(".")
  ) ?? null;
}

function rewriteJSXName(node, tagName) {
  if (t.isJSXIdentifier(node)) {
    node.name = tagName;
    return;
  }
  if (t.isJSXMemberExpression(node)) {
    node.type = "JSXIdentifier";
    node.name = tagName;
    delete node.object;
    delete node.property;
  }
}

function getRenderedTagName(node) {
  if (t.isJSXIdentifier(node)) {
    return toKebab(node.name);
  }
  if (t.isJSXMemberExpression(node)) {
    return toKebab(node.property.name);
  }
  return null;
}

function getLazyComponentReference(path) {
  const opening = path.node.openingElement;
  if (!opening) return null;

  const specialMemberAttribute = getSpecialMemberAttribute(opening);
  if (specialMemberAttribute) {
    const objectName = opening.name;
    if (!t.isJSXIdentifier(objectName)) {
      return null;
    }

    const propertyName = specialMemberAttribute.name.name.slice(1);
    if (!propertyName) {
      return null;
    }

    return {
      expression: t.memberExpression(
        t.identifier(objectName.name),
        t.identifier(propertyName)
      ),
      tag: toKebab(propertyName),
      rewrite() {
        opening.name = t.jsxIdentifier(toKebab(propertyName));
        opening.attributes = opening.attributes.filter(
          (attribute) => attribute !== specialMemberAttribute
        );
        if (path.node.closingElement) {
          path.node.closingElement.name = t.jsxIdentifier(toKebab(propertyName));
        }
      },
    };
  }

  const nameNode = opening.name;
  if (!t.isJSXIdentifier(nameNode) && !t.isJSXMemberExpression(nameNode)) {
    return null;
  }

  const expression = createExpressionFromJSXName(nameNode);
  if (!expression) return null;

  const tag = getRenderedTagName(nameNode);
  if (!tag) return null;

  return {
    expression,
    tag,
    rewrite() {
      rewriteJSXName(opening.name, tag);
      if (path.node.closingElement) {
        rewriteJSXName(path.node.closingElement.name, tag);
      }
    },
  };
}

export function trackLazyUsage(path, state, ensureRequirementBucket) {
  const reference = getLazyComponentReference(path);
  if (!reference) return;
  const { expression, tag } = reference;

  if (!hasLazyOrigin(expression, path.scope, state)) return;

  const resolvedNode = resolveValueNode(expression, path.scope, state);
  if (!resolvedNode) return;

  const renderPath = path.findParent(
    (entry) =>
      entry.isClassMethod({ kind: "method" }) &&
      t.isIdentifier(entry.node.key, { name: "render" })
  );
  if (!renderPath) return;

  const requirements = ensureRequirementBucket(renderPath, state);
  const exprKey = getExpressionKey(expression);
  const requirementKey = `${tag}:${exprKey || tag}`;
  requirements.set(requirementKey, { tag, expression });

  reference.rewrite();
}
