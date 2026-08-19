import helperPluginUtils from "@babel/helper-plugin-utils";

const { declare } = helperPluginUtils;

const JSX_RUNTIME_SOURCES = new Set(["react/jsx-runtime", "react/jsx-dev-runtime"]);

function importedName(specifier) {
  if (specifier.type === "ImportDefaultSpecifier") return "default";
  if (specifier.type === "ImportNamespaceSpecifier") return "*";
  return specifier.imported?.name ?? specifier.imported?.value ?? null;
}

function isUndefined(node, t) {
  return t.isIdentifier(node, { name: "undefined" }) ||
    (t.isUnaryExpression(node, { operator: "void" }) && t.isNumericLiteral(node.argument));
}

function memberToJsxName(node, t) {
  if (t.isIdentifier(node)) return t.jsxIdentifier(node.name);
  if (!t.isMemberExpression(node, { computed: false })) return null;
  const object = memberToJsxName(node.object, t);
  if (!object || !t.isIdentifier(node.property)) return null;
  return t.jsxMemberExpression(object, t.jsxIdentifier(node.property.name));
}

function typeToJsxName(node, t) {
  if (t.isStringLiteral(node) && /^[A-Za-z][A-Za-z0-9:._-]*$/.test(node.value)) {
    return t.jsxIdentifier(node.value);
  }
  return memberToJsxName(node, t);
}

function propertyName(node, computed, t) {
  if (computed) return null;
  if (t.isIdentifier(node) || t.isStringLiteral(node)) return node.name ?? node.value;
  return null;
}

function expressionToChild(node, t) {
  if (t.isStringLiteral(node)) return t.jsxText(node.value);
  if (t.isJSXElement(node) || t.isJSXFragment(node) || t.isJSXText(node)) return node;
  return t.jsxExpressionContainer(node);
}

function expressionToChildren(node, t) {
  if (t.isArrayExpression(node)) {
    return node.elements
      .filter(Boolean)
      .map((element) => expressionToChild(element, t));
  }
  return [expressionToChild(node, t)];
}

function createAttribute(name, value, t) {
  const attributeName = t.jsxIdentifier(name);
  if (t.isBooleanLiteral(value, { value: true })) {
    return t.jsxAttribute(attributeName, null);
  }
  if (t.isStringLiteral(value)) {
    return t.jsxAttribute(attributeName, t.stringLiteral(value.value));
  }
  return t.jsxAttribute(attributeName, t.jsxExpressionContainer(value));
}

function normalizeProps(propsNode, explicitChildren, keyNode, path, t) {
  const attributes = [];
  let children = explicitChildren;

  if (propsNode && !t.isNullLiteral(propsNode) && !isUndefined(propsNode, t)) {
    if (!t.isObjectExpression(propsNode)) {
      attributes.push(t.jsxSpreadAttribute(propsNode));
    } else {
      for (const property of propsNode.properties) {
        if (t.isSpreadElement(property)) {
          attributes.push(t.jsxSpreadAttribute(property.argument));
          continue;
        }
        if (!t.isObjectProperty(property)) {
          throw path.buildCodeFrameError(
            "Cannot transform React element runtime call containing a computed props method."
          );
        }
        const name = propertyName(property.key, property.computed, t);
        if (!name) {
          throw path.buildCodeFrameError(
            "Cannot transform React element runtime call containing a computed prop name."
          );
        }
        if (name === "children") {
          if (children == null) children = expressionToChildren(property.value, t);
          continue;
        }
        attributes.push(createAttribute(name, property.value, t));
      }
    }
  }

  if (keyNode && !t.isNullLiteral(keyNode) && !isUndefined(keyNode, t)) {
    attributes.push(createAttribute("key", keyNode, t));
  }

  return { attributes, children: children || [] };
}

function createJsxElement(typeNode, propsNode, explicitChildren, keyNode, fragmentLocals, path, t) {
  const isFragment =
    (t.isIdentifier(typeNode) && fragmentLocals.has(typeNode.name)) ||
    (
      t.isMemberExpression(typeNode, { computed: false }) &&
      t.isIdentifier(typeNode.object) &&
      t.isIdentifier(typeNode.property, { name: "Fragment" }) &&
      fragmentLocals.has(typeNode.object.name)
    );
  const normalized = normalizeProps(propsNode, explicitChildren, keyNode, path, t);

  if (isFragment) {
    if (normalized.attributes.length > 0) {
      throw path.buildCodeFrameError(
        "Cannot transform a keyed or attributed React Fragment runtime call yet."
      );
    }
    return t.jsxFragment(
      t.jsxOpeningFragment(),
      t.jsxClosingFragment(),
      normalized.children,
    );
  }

  const name = typeToJsxName(typeNode, t);
  if (!name) {
    throw path.buildCodeFrameError(
      "Cannot transform React element runtime call with a dynamic element type. Use a statically named HTML tag or component."
    );
  }
  const opening = t.jsxOpeningElement(name, normalized.attributes, normalized.children.length === 0);
  return t.jsxElement(
    opening,
    normalized.children.length === 0 ? null : t.jsxClosingElement(t.cloneNode(name)),
    normalized.children,
    normalized.children.length === 0,
  );
}

function transformElementRuntimeCall(callPath, state, t) {
  const callee = callPath.node.callee;
  if (t.isIdentifier(callee) && state.cloneElementLocals.has(callee.name)) {
    throw callPath.buildCodeFrameError(
      "React.cloneElement cannot be transformed safely because it mutates an already-created element."
    );
  }
  if (t.isIdentifier(callee) && state.createPortalLocals.has(callee.name)) {
    throw callPath.buildCodeFrameError(
      "ReactDOM.createPortal has no automatic LitSX template equivalent. Use an explicit portal adapter."
    );
  }
  if (
    t.isMemberExpression(callee, { computed: false }) &&
    t.isIdentifier(callee.object) &&
    state.reactDomNamespaces.has(callee.object.name) &&
    t.isIdentifier(callee.property, { name: "createPortal" })
  ) {
    throw callPath.buildCodeFrameError(
      "ReactDOM.createPortal has no automatic LitSX template equivalent. Use an explicit portal adapter."
    );
  }

  let kind = null;
  if (t.isIdentifier(callee) && state.createElementLocals.has(callee.name)) {
    kind = "createElement";
  } else if (t.isIdentifier(callee) && state.jsxRuntimeLocals.has(callee.name)) {
    kind = state.jsxRuntimeLocals.get(callee.name);
  } else if (
    t.isMemberExpression(callee, { computed: false }) &&
    t.isIdentifier(callee.object) &&
    state.reactNamespaces.has(callee.object.name) &&
    t.isIdentifier(callee.property)
  ) {
    if (callee.property.name === "createElement") kind = "createElement";
    if (callee.property.name === "cloneElement") {
      throw callPath.buildCodeFrameError(
        "React.cloneElement cannot be transformed safely because it mutates an already-created element."
      );
    }
  } else if (
    t.isMemberExpression(callee, { computed: false }) &&
    t.isIdentifier(callee.object) &&
    state.jsxRuntimeNamespaces.has(callee.object.name) &&
    t.isIdentifier(callee.property) &&
    (callee.property.name === "jsx" ||
      callee.property.name === "jsxs" ||
      callee.property.name === "jsxDEV")
  ) {
    kind = callee.property.name;
  }
  if (!kind) return;

  const args = callPath.node.arguments;
  if (args.some((argument) => t.isSpreadElement(argument))) {
    throw callPath.buildCodeFrameError(
      "Cannot transform a React element runtime call with spread call arguments."
    );
  }
  const typeNode = args[0];
  if (!typeNode) {
    throw callPath.buildCodeFrameError("React element runtime call is missing its element type.");
  }
  const propsNode = args[1] || t.nullLiteral();
  const explicitChildren = kind === "createElement" && args.length > 2
    ? args.slice(2).map((child) => expressionToChild(child, t))
    : null;
  const keyNode = kind === "jsx" || kind === "jsxs" || kind === "jsxDEV"
    ? args[2]
    : null;
  callPath.replaceWith(
    createJsxElement(
      typeNode,
      propsNode,
      explicitChildren,
      keyNode,
      state.fragmentLocals,
      callPath,
      t,
    ),
  );
}

export default declare((api) => {
  api.assertVersion(7);
  const t = api.types;

  return {
    name: "react-element-runtime-to-jsx",
    visitor: {
      Program: {
        enter(programPath, state) {
          state.reactNamespaces = new Set();
          state.createElementLocals = new Set();
          state.fragmentLocals = new Set();
          state.jsxRuntimeLocals = new Map();
          state.jsxRuntimeNamespaces = new Set();
          state.cloneElementLocals = new Set();
          state.createPortalLocals = new Set();
          state.reactDomNamespaces = new Set();

          for (const statement of programPath.node.body) {
            if (statement.type !== "ImportDeclaration") continue;
            const source = statement.source.value;
            for (const specifier of statement.specifiers) {
              const imported = importedName(specifier);
              const local = specifier.local?.name;
              if (!local) continue;
              if (source === "react") {
                if (imported === "*" || imported === "default") {
                  state.reactNamespaces.add(local);
                  state.fragmentLocals.add(local);
                } else if (imported === "createElement") {
                  state.createElementLocals.add(local);
                } else if (imported === "cloneElement") {
                  state.cloneElementLocals.add(local);
                } else if (imported === "Fragment") {
                  state.fragmentLocals.add(local);
                }
              } else if (JSX_RUNTIME_SOURCES.has(source)) {
                if (imported === "*") {
                  state.jsxRuntimeNamespaces.add(local);
                  state.fragmentLocals.add(local);
                } else if (imported === "jsx" || imported === "jsxs" || imported === "jsxDEV") {
                  state.jsxRuntimeLocals.set(local, imported);
                } else if (imported === "Fragment") {
                  state.fragmentLocals.add(local);
                }
              } else if (source === "react-dom") {
                if (imported === "createPortal") {
                  state.createPortalLocals.add(local);
                } else if (imported === "*" || imported === "default") {
                  state.reactDomNamespaces.add(local);
                }
              }
            }
          }

          programPath.traverse({
            CallExpression: {
              exit(callPath) {
                transformElementRuntimeCall(callPath, state, t);
              },
            },
          });
        },
        exit(programPath) {
          programPath.scope.crawl();
          for (const statementPath of programPath.get("body")) {
            if (!statementPath.isImportDeclaration()) continue;
            const source = statementPath.node.source.value;
            if (source !== "react" && source !== "react-dom" && !JSX_RUNTIME_SOURCES.has(source)) continue;
            for (const specifierPath of statementPath.get("specifiers")) {
              const local = specifierPath.node.local?.name;
              if (local && !programPath.scope.getBinding(local)?.referenced) {
                specifierPath.remove();
              }
            }
            if (statementPath.node.specifiers.length === 0) statementPath.remove();
          }
        },
      },
    },
  };
});
