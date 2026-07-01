import path from "node:path";
import { createStableIdentity } from "../../babel-preset-litsx/src/internal/stable-identity.js";

function createSymbolForExpression(t, symbolKey) {
  return t.callExpression(
    t.memberExpression(t.identifier("Symbol"), t.identifier("for")),
    [t.stringLiteral(symbolKey)]
  );
}

function isSymbolForExpression(t, node, symbolKey) {
  return (
    t.isCallExpression(node) &&
    t.isMemberExpression(node.callee) &&
    !node.callee.computed &&
    t.isIdentifier(node.callee.object, { name: "Symbol" }) &&
    t.isIdentifier(node.callee.property, { name: "for" }) &&
    node.arguments.length === 1 &&
    t.isStringLiteral(node.arguments[0], { value: symbolKey })
  );
}

function isElementLikeSuperClass(t, node) {
  return (
    t.isIdentifier(node, { name: "LitElement" }) ||
    t.isIdentifier(node, { name: "ReactiveElement" }) ||
    t.isIdentifier(node, { name: "HTMLElement" })
  );
}

function hasStaticSymbolField(t, classPath, symbolKey) {
  return classPath.get("body.body").some((memberPath) => (
    memberPath.isClassProperty() &&
    memberPath.node.static === true &&
    memberPath.node.computed === true &&
    isSymbolForExpression(t, memberPath.node.key, symbolKey)
  ));
}

function isTopLevelFunctionLike(path) {
  return (
    path.parentPath?.isProgram?.() ||
    path.parentPath?.isExportNamedDeclaration?.() ||
    path.parentPath?.isExportDefaultDeclaration?.()
  );
}

function createStaticSymbolField(t, symbolKey, valueNode) {
  const field = t.classProperty(
    t.identifier("__litsx_placeholder"),
    valueNode
  );
  field.key = createSymbolForExpression(t, symbolKey);
  field.computed = true;
  field.static = true;
  return field;
}

export default function annotateCompiledRuntimeMetadata({ types: t }) {
  return {
    name: "annotate-compiled-runtime-metadata",
    visitor: {
      Program(programPath, state) {
        const filename = state.file?.opts?.filename || "";
        if (!filename.includes(`${path.sep}packages${path.sep}core${path.sep}src${path.sep}`)) {
          return;
        }

        for (const statementPath of programPath.get("body")) {
          const declarationPath = statementPath.isExportNamedDeclaration()
            ? statementPath.get("declaration")
            : statementPath;

          if (
            declarationPath?.isClassDeclaration?.() &&
            declarationPath.node.id?.name &&
            isElementLikeSuperClass(t, declarationPath.node.superClass)
          ) {
            if (!hasStaticSymbolField(t, declarationPath, "litsx.hostTypeId")) {
              declarationPath.get("body").pushContainer("body", createStaticSymbolField(
                t,
                "litsx.hostTypeId",
                t.stringLiteral(createStableIdentity("litsx-host-type-", declarationPath, state))
              ));
            }

            if (!hasStaticSymbolField(t, declarationPath, "litsx.component")) {
              declarationPath.get("body").pushContainer("body", createStaticSymbolField(
                t,
                "litsx.component",
                t.booleanLiteral(true)
              ));
            }
          }
        }

        programPath.traverse({
          FunctionDeclaration(functionPath) {
            if (!isTopLevelFunctionLike(functionPath)) {
              return;
            }

            const functionName = functionPath.node.id?.name;
            if (!/^use[A-Z0-9]/.test(functionName || "")) {
              return;
            }

            const anchorPath = functionPath.parentPath.isExportNamedDeclaration()
              ? functionPath.parentPath
              : functionPath;

            anchorPath.insertAfter(
              t.expressionStatement(
                t.assignmentExpression(
                  "=",
                  t.memberExpression(
                    t.identifier(functionName),
                    createSymbolForExpression(t, "litsx.hook"),
                    true
                  ),
                  t.booleanLiteral(true)
                )
              )
            );
          },
          VariableDeclarator(variablePath) {
            if (!variablePath.parentPath.parentPath?.isProgram?.() &&
                !variablePath.parentPath.parentPath?.isExportNamedDeclaration?.()) {
              return;
            }

            if (!t.isIdentifier(variablePath.node.id)) {
              return;
            }

            const functionName = variablePath.node.id.name;
            if (!/^use[A-Z0-9]/.test(functionName)) {
              return;
            }

            const initPath = variablePath.get("init");
            if (!initPath.isArrowFunctionExpression() && !initPath.isFunctionExpression()) {
              return;
            }

            const anchorPath = variablePath.parentPath.parentPath.isExportNamedDeclaration()
              ? variablePath.parentPath.parentPath
              : variablePath.parentPath;

            anchorPath.insertAfter(
              t.expressionStatement(
                t.assignmentExpression(
                  "=",
                  t.memberExpression(
                    t.identifier(functionName),
                    createSymbolForExpression(t, "litsx.hook"),
                    true
                  ),
                  t.booleanLiteral(true)
                )
              )
            );
          },
        });
      },
    },
  };
}
