import helperPluginUtils from "@babel/helper-plugin-utils";
import jsxSyntaxPlugin from "@babel/plugin-syntax-jsx";

const { declare } = helperPluginUtils;

const REACT_MODULES = new Set(["react", "@litsx/react"]);
const RUNTIME_MODULE = "litsx/context";
const PROVIDER_IMPORT_NAME = "LitsxContextProviderElement";
const PROVIDER_LOCAL_NAME = "LitsxContextProvider";
const CREATE_CONTEXT_IMPORT_NAME = "createContext";
const USE_CONTEXT_IMPORT_NAME = "useContext";
const RENDER_CONTEXT_IMPORT_NAME = "renderContext";

function isExpression(path, t) {
  return Boolean(path?.node) && t.isExpression(path.node);
}

function isReactSource(source) {
  return REACT_MODULES.has(source);
}

function getReactImportedLocalNames(programPath, t, importedName) {
  const locals = [];

  for (const bodyPath of programPath.get("body")) {
    if (!bodyPath.isImportDeclaration()) continue;
    if (!isReactSource(bodyPath.node.source.value)) continue;

    for (const specifierPath of bodyPath.get("specifiers")) {
      if (
        specifierPath.isImportSpecifier() &&
        t.isIdentifier(specifierPath.node.imported, { name: importedName })
      ) {
        locals.push(specifierPath.node.local.name);
      }
    }
  }

  return locals;
}

function removeReactNamedImports(programPath, t, importedName) {
  for (const bodyPath of programPath.get("body")) {
    if (!bodyPath.isImportDeclaration()) continue;
    if (!isReactSource(bodyPath.node.source.value)) continue;

    const remainingSpecifiers = bodyPath.node.specifiers.filter((specifier) => {
      return !(
        t.isImportSpecifier(specifier) &&
        t.isIdentifier(specifier.imported, { name: importedName })
      );
    });

    if (remainingSpecifiers.length === 0) {
      bodyPath.remove();
      continue;
    }

    if (remainingSpecifiers.length !== bodyPath.node.specifiers.length) {
      bodyPath.node.specifiers = remainingSpecifiers;
    }
  }
}

function jsxNameToExpression(nameNode, t) {
  if (t.isJSXIdentifier(nameNode)) {
    return t.identifier(nameNode.name);
  }

  if (t.isJSXMemberExpression(nameNode)) {
    return t.memberExpression(
      jsxNameToExpression(nameNode.object, t),
      jsxNameToExpression(nameNode.property, t)
    );
  }

  throw new Error("react-context: unsupported JSX name shape.");
}

function getMemberPropertyName(node, t) {
  if (t.isIdentifier(node.property) && node.computed === false) {
    return node.property.name;
  }

  if (t.isStringLiteral(node.property)) {
    return node.property.value;
  }

  return null;
}

function getJsxMemberPropertyName(node, t) {
  if (t.isJSXIdentifier(node.property)) {
    return node.property.name;
  }

  return null;
}

function addNamedImport(programPath, t, importedName, localName = importedName) {
  const bodyPaths = programPath.get("body");

  for (const bodyPath of bodyPaths) {
    if (!bodyPath.isImportDeclaration()) continue;
    if (bodyPath.node.source.value !== RUNTIME_MODULE) continue;

    const hasSpecifier = bodyPath.node.specifiers.some(
      (specifier) =>
        t.isImportSpecifier(specifier) &&
        t.isIdentifier(specifier.imported, { name: importedName }) &&
        t.isIdentifier(specifier.local, { name: localName })
    );

    if (!hasSpecifier) {
      bodyPath.pushContainer(
        "specifiers",
        t.importSpecifier(t.identifier(localName), t.identifier(importedName))
      );
    }

    return;
  }

  programPath.unshiftContainer(
    "body",
    t.importDeclaration(
      [t.importSpecifier(t.identifier(localName), t.identifier(importedName))],
      t.stringLiteral(RUNTIME_MODULE)
    )
  );
}

function createCompileError(path, message) {
  throw path.buildCodeFrameError(message);
}

function getRenderFunctionFromConsumer(path, t) {
  const children = path.node.children.filter((child) => {
    if (t.isJSXText(child)) {
      return child.value.trim() !== "";
    }

    if (
      t.isJSXExpressionContainer(child) &&
      (child.expression == null || t.isJSXEmptyExpression(child.expression))
    ) {
      return false;
    }

    return true;
  });

  if (children.length !== 1) {
    createCompileError(
      path,
      "React context Consumer requires exactly one function child."
    );
  }

  const [child] = children;
  if (!t.isJSXExpressionContainer(child)) {
    createCompileError(
      path,
      "React context Consumer requires a function child."
    );
  }

  const expression = child.expression;
  if (!t.isArrowFunctionExpression(expression) && !t.isFunctionExpression(expression)) {
    createCompileError(
      path,
      "React context Consumer requires a function child."
    );
  }

  return t.cloneNode(expression, true);
}

function wrapExpressionForParent(path, expression, t) {
  if (path.parentPath?.isJSXElement() || path.parentPath?.isJSXFragment()) {
    return t.jsxExpressionContainer(expression);
  }

  return expression;
}

function extractJsxAttributeExpression(valueNode, t) {
  if (!valueNode) {
    return t.booleanLiteral(true);
  }

  if (t.isJSXExpressionContainer(valueNode)) {
    if (!valueNode.expression || valueNode.expression.type === "JSXEmptyExpression") {
      return t.booleanLiteral(true);
    }
    return t.cloneNode(valueNode.expression, true);
  }

  if (t.isStringLiteral(valueNode)) {
    return t.stringLiteral(valueNode.value);
  }

  return t.cloneNode(valueNode, true);
}

function removeUnusedReactImports(programPath, t, state) {
  programPath.scope.crawl();

  for (const bodyPath of programPath.get("body")) {
    if (!bodyPath.isImportDeclaration()) continue;
    if (!isReactSource(bodyPath.node.source.value)) continue;

    const remainingSpecifiers = [];

    for (const specifier of bodyPath.node.specifiers) {
      if (
        t.isImportSpecifier(specifier) &&
        (
          state.createContextLocalNames.has(specifier.local.name) ||
          state.useContextLocalNames.has(specifier.local.name)
        )
      ) {
        const binding = programPath.scope.getBinding(specifier.local.name);
        if (!binding || binding.referencePaths.length === 0) {
          continue;
        }
      }

      if (
        (t.isImportDefaultSpecifier(specifier) || t.isImportNamespaceSpecifier(specifier)) &&
        state.reactNamespaceNames.has(specifier.local.name)
      ) {
        const binding = programPath.scope.getBinding(specifier.local.name);
        if (!binding || binding.referencePaths.length === 0) {
          continue;
        }
      }

      remainingSpecifiers.push(specifier);
    }

    if (remainingSpecifiers.length === 0) {
      bodyPath.remove();
    } else if (remainingSpecifiers.length !== bodyPath.node.specifiers.length) {
      bodyPath.node.specifiers = remainingSpecifiers;
    }
  }
}

function isIdentifierImportedFromReact(path, importedName, t) {
  if (!path.isIdentifier()) {
    return false;
  }

  const binding = path.scope.getBinding(path.node.name);
  if (!binding || !binding.path.isImportSpecifier()) {
    return false;
  }

  const importDecl = binding.path.parentPath;
  if (!importDecl?.isImportDeclaration()) {
    return false;
  }

  return (
    isReactSource(importDecl.node.source.value) &&
    t.isIdentifier(binding.path.node.imported, { name: importedName })
  );
}

export default declare((api) => {
  api.assertVersion(7);
  const t = api.types;

  function getCreateContextKind(calleePath, state) {
    if (isIdentifierImportedFromReact(calleePath, "createContext", t)) {
      return true;
    }

    if (calleePath.isMemberExpression({ computed: false })) {
      const object = calleePath.get("object");
      const property = calleePath.get("property");
      return (
        object.isIdentifier() &&
        state.reactNamespaceNames.has(object.node.name) &&
        property.isIdentifier({ name: "createContext" })
      );
    }

    return false;
  }

  function getUseContextKind(calleePath, state) {
    if (isIdentifierImportedFromReact(calleePath, "useContext", t)) {
      return true;
    }

    if (calleePath.isMemberExpression({ computed: false })) {
      const object = calleePath.get("object");
      const property = calleePath.get("property");
      return (
        object.isIdentifier() &&
        state.reactNamespaceNames.has(object.node.name) &&
        property.isIdentifier({ name: "useContext" })
      );
    }

    return false;
  }

  function getContextMemberKind(nameNode, state) {
    if (!t.isJSXMemberExpression(nameNode)) {
      return null;
    }

    const propertyName = getJsxMemberPropertyName(nameNode, t);
    if (propertyName !== "Provider" && propertyName !== "Consumer") {
      return null;
    }

    return {
      kind: propertyName,
      contextExpression: jsxNameToExpression(nameNode.object, t),
    };
  }

  return {
    name: "transform-react-context",
    inherits: jsxSyntaxPlugin.default || jsxSyntaxPlugin,
    visitor: {
      Program: {
        enter(path, state) {
          state.createContextLocalNames = new Set();
          state.useContextLocalNames = new Set();
          state.reactNamespaceNames = new Set();
          state.localContextBindingNames = new Set();
          state.needsCreateReactContext = false;
          state.needsUseReactContext = false;
          state.needsRenderReactContext = false;
          state.needsContextProvider = false;
        },
        exit(path, state) {
          const createContextLocals = state.needsCreateReactContext
            ? getReactImportedLocalNames(path, t, "createContext")
            : [];
          const useContextLocals = state.needsUseReactContext
            ? getReactImportedLocalNames(path, t, "useContext")
            : [];

          if (state.needsCreateReactContext) {
            removeReactNamedImports(path, t, "createContext");
          }

          if (state.needsUseReactContext) {
            removeReactNamedImports(path, t, "useContext");
          }

          if (state.needsCreateReactContext) {
            if (createContextLocals.length === 0) {
              addNamedImport(path, t, CREATE_CONTEXT_IMPORT_NAME);
            } else {
              for (const localName of createContextLocals) {
                addNamedImport(path, t, CREATE_CONTEXT_IMPORT_NAME, localName);
              }
            }
          }

          if (state.needsUseReactContext) {
            if (useContextLocals.length === 0) {
              addNamedImport(path, t, USE_CONTEXT_IMPORT_NAME);
            } else {
              for (const localName of useContextLocals) {
                addNamedImport(path, t, USE_CONTEXT_IMPORT_NAME, localName);
              }
            }
          }

          if (state.needsRenderReactContext) {
            addNamedImport(path, t, RENDER_CONTEXT_IMPORT_NAME);
          }

          if (state.needsContextProvider) {
            addNamedImport(path, t, PROVIDER_IMPORT_NAME, PROVIDER_LOCAL_NAME);
          }

          removeUnusedReactImports(path, t, state);
        },
      },
      ImportDeclaration(path, state) {
        if (!isReactSource(path.node.source.value)) {
          return;
        }

        for (const specifier of path.node.specifiers) {
          if (
            t.isImportSpecifier(specifier) &&
            t.isIdentifier(specifier.imported, { name: "createContext" })
          ) {
            state.createContextLocalNames.add(specifier.local.name);
          }

          if (
            t.isImportSpecifier(specifier) &&
            t.isIdentifier(specifier.imported, { name: "useContext" })
          ) {
            state.useContextLocalNames.add(specifier.local.name);
          }

          if (
            t.isImportDefaultSpecifier(specifier) ||
            t.isImportNamespaceSpecifier(specifier)
          ) {
            state.reactNamespaceNames.add(specifier.local.name);
          }
        }
      },
      CallExpression(path, state) {
        if (path.node.__litsxContextLowered) {
          return;
        }

        const calleePath = path.get("callee");

        if (getCreateContextKind(calleePath, state)) {
          state.needsCreateReactContext = true;
          path.node.callee = t.identifier(CREATE_CONTEXT_IMPORT_NAME);
          path.node.__litsxContextLowered = true;

          const parent = path.parentPath;
          if (
            parent?.isVariableDeclarator() &&
            t.isIdentifier(parent.node.id)
          ) {
            state.localContextBindingNames.add(parent.node.id.name);
          }
          return;
        }

        if (getUseContextKind(calleePath, state)) {
          const argPaths = path.get("arguments");
          const args = path.node.arguments;
          const isHostAwareCall =
            args.length === 2 &&
            isExpression(argPaths[0], t) &&
            isExpression(argPaths[1], t);
          const isSimpleCall =
            args.length === 1 &&
            isExpression(argPaths[0], t);

          if (!isHostAwareCall && !isSimpleCall) {
            createCompileError(
              path,
              "useContext requires a context object."
            );
          }

          state.needsUseReactContext = true;
          const replacement = t.callExpression(
            t.identifier(USE_CONTEXT_IMPORT_NAME),
            isHostAwareCall
              ? args.map((arg) => t.cloneNode(arg, true))
              : [t.cloneNode(args[0], true)]
          );
          replacement.__litsxContextLowered = true;
          replacement.__litsxCompatUseContext = true;
          path.replaceWith(replacement);
        }
      },
      JSXElement(path, state) {
        const contextMember = getContextMemberKind(path.node.openingElement.name, state);
        if (!contextMember) {
          return;
        }

        if (contextMember.kind === "Provider") {
          const attributes = path.node.openingElement.attributes ?? [];
          const valueAttr = attributes.find(
            (attr) => t.isJSXAttribute(attr) && t.isJSXIdentifier(attr.name, { name: "value" })
          );

          if (!valueAttr) {
            createCompileError(
              path,
              "React context Provider requires a value prop."
            );
          }

          const nextAttributes = [];
          for (const attr of attributes) {
            if (!t.isJSXAttribute(attr)) {
              createCompileError(
                path,
                "React context Provider does not support spread attributes."
              );
            }

            const attrName = t.isJSXIdentifier(attr.name) ? attr.name.name : null;
            if (attrName === "value") {
              nextAttributes.push(
                t.jsxAttribute(
                  t.jsxIdentifier(".value"),
                  t.jsxExpressionContainer(
                    extractJsxAttributeExpression(attr.value, t)
                  )
                )
              );
              continue;
            }

            if (attrName === "key") {
              nextAttributes.push(t.cloneNode(attr, true));
              continue;
            }

            createCompileError(
              path,
              `React context Provider does not support the "${attrName}" prop.`
            );
          }

          nextAttributes.unshift(
            t.jsxAttribute(
              t.jsxIdentifier(".context"),
              t.jsxExpressionContainer(t.cloneNode(contextMember.contextExpression, true))
            )
          );

          state.needsContextProvider = true;

          path.replaceWith(
            t.jsxElement(
              t.jsxOpeningElement(
                t.jsxIdentifier(PROVIDER_LOCAL_NAME),
                nextAttributes,
                false
              ),
              t.jsxClosingElement(t.jsxIdentifier(PROVIDER_LOCAL_NAME)),
              path.node.children.map((child) => t.cloneNode(child, true)),
              false
            )
          );
          path.requeue();
          return;
        }

        const renderFn = getRenderFunctionFromConsumer(path, t);
        state.needsRenderReactContext = true;
        path.replaceWith(
          wrapExpressionForParent(
            path,
            t.callExpression(
              t.identifier(RENDER_CONTEXT_IMPORT_NAME),
              [
                t.thisExpression(),
                t.cloneNode(contextMember.contextExpression, true),
                renderFn,
              ]
            ),
            t
          )
        );
      },
      AssignmentExpression(path, state) {
        const left = path.node.left;
        if (!t.isMemberExpression(left)) {
          return;
        }

        const propertyName = getMemberPropertyName(left, t);
        if (propertyName === "contextType") {
          createCompileError(
            path,
            "React class contextType is not supported by @litsx/babel-preset-react-compat."
          );
        }

        if (
          propertyName === "displayName" &&
          t.isIdentifier(left.object) &&
          state.localContextBindingNames.has(left.object.name)
        ) {
          createCompileError(
            path,
            "React context displayName is not supported by @litsx/babel-preset-react-compat."
          );
        }
      },
      ClassProperty(path) {
        if (
          path.node.static &&
          t.isIdentifier(path.node.key, { name: "contextType" })
        ) {
          createCompileError(
            path,
            "React class contextType is not supported by @litsx/babel-preset-react-compat."
          );
        }
      },
    },
  };
});
