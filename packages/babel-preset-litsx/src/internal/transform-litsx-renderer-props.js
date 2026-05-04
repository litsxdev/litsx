import jsxSyntaxPlugin from "@babel/plugin-syntax-jsx";
import { decodeVirtualAttributeName } from "@litsx/jsx-authoring";

let t;

function createHostReferenceExpression() {
  return t.conditionalExpression(
    t.binaryExpression(
      "===",
      t.unaryExpression("typeof", t.thisExpression(), true),
      t.stringLiteral("undefined")
    ),
    t.nullLiteral(),
    t.thisExpression()
  );
}

function shouldBindRendererContext(rawName, expression) {
  if (typeof rawName !== "string" || rawName[0] !== ".") {
    return false;
  }

  if (!rawName.endsWith("Renderer")) {
    return false;
  }

  return t.isArrowFunctionExpression(expression) || t.isFunctionExpression(expression);
}

function mergeProjectionDecisions(...decisions) {
  if (decisions.includes("projected")) {
    return "projected";
  }
  if (decisions.every((decision) => decision === "inline")) {
    return "inline";
  }
  return "unknown";
}

function stringifyJsxName(nameNode) {
  if (t.isJSXIdentifier(nameNode)) {
    return nameNode.name;
  }

  if (t.isJSXMemberExpression(nameNode)) {
    return `${stringifyJsxName(nameNode.object)}.${nameNode.property.name}`;
  }

  if (t.isJSXNamespacedName(nameNode)) {
    return `${nameNode.namespace.name}:${nameNode.name.name}`;
  }

  return "unknown";
}

function getTag(node) {
  const name = stringifyJsxName(node.name);
  const isCapitalized = name.charAt(0) === name.charAt(0).toUpperCase();
  const isComponent = !isCapitalized && node.name.type !== "JSXIdentifier";
  return { name, isComponent };
}

function analyzeJsxProjection(node) {
  if (t.isJSXFragment(node)) {
    return mergeProjectionDecisions(
      ...node.children.map(analyzeJsxProjectionChild)
    );
  }

  if (!t.isJSXElement(node)) {
    return "unknown";
  }

  const { name, isComponent } = getTag(node.openingElement);
  if (isComponent || name.includes("-")) {
    return "projected";
  }

  const childDecision = mergeProjectionDecisions(
    ...node.children.map(analyzeJsxProjectionChild)
  );

  const attributeDecision = mergeProjectionDecisions(
    ...node.openingElement.attributes.map((attr) => {
      if (attr.type !== "JSXAttribute" || !attr.value) {
        return "inline";
      }
      if (attr.value.type !== "JSXExpressionContainer") {
        return "inline";
      }
      return analyzeRendererValueProjection(attr.value.expression);
    })
  );

  return mergeProjectionDecisions("inline", childDecision, attributeDecision);
}

function analyzeJsxProjectionChild(child) {
  if (t.isJSXText(child)) {
    return "inline";
  }
  if (t.isJSXExpressionContainer(child)) {
    return analyzeRendererValueProjection(child.expression);
  }
  if (t.isJSXElement(child) || t.isJSXFragment(child)) {
    return analyzeJsxProjection(child);
  }
  return "unknown";
}

function analyzeRendererBodyProjection(node) {
  if (t.isBlockStatement(node)) {
    const decisions = [];
    for (const statement of node.body) {
      if (t.isReturnStatement(statement)) {
        decisions.push(analyzeRendererValueProjection(statement.argument));
      } else if (t.isIfStatement(statement)) {
        decisions.push(
          mergeProjectionDecisions(
            analyzeRendererBodyProjection(statement.consequent),
            statement.alternate
              ? analyzeRendererBodyProjection(statement.alternate)
              : "inline"
          )
        );
      }
    }
    return decisions.length > 0
      ? mergeProjectionDecisions(...decisions)
      : "inline";
  }

  return analyzeRendererValueProjection(node);
}

function analyzeRendererValueProjection(node) {
  if (!node) {
    return "inline";
  }

  if (t.isJSXElement(node) || t.isJSXFragment(node)) {
    return analyzeJsxProjection(node);
  }

  if (
    t.isStringLiteral(node) ||
    t.isNumericLiteral(node) ||
    t.isBooleanLiteral(node) ||
    t.isNullLiteral(node) ||
    t.isTemplateLiteral(node)
  ) {
    return "inline";
  }

  if (t.isIdentifier(node, { name: "undefined" })) {
    return "inline";
  }

  if (t.isParenthesizedExpression?.(node)) {
    return analyzeRendererValueProjection(node.expression);
  }

  if (t.isTSAsExpression?.(node) || t.isTSSatisfiesExpression?.(node) || t.isTypeCastExpression?.(node)) {
    return analyzeRendererValueProjection(node.expression);
  }

  if (t.isConditionalExpression(node)) {
    return mergeProjectionDecisions(
      analyzeRendererValueProjection(node.consequent),
      analyzeRendererValueProjection(node.alternate)
    );
  }

  if (t.isLogicalExpression(node)) {
    return mergeProjectionDecisions(
      analyzeRendererValueProjection(node.left),
      analyzeRendererValueProjection(node.right)
    );
  }

  if (t.isSequenceExpression(node)) {
    return mergeProjectionDecisions(
      ...node.expressions.map(analyzeRendererValueProjection)
    );
  }

  if (t.isArrayExpression(node)) {
    return mergeProjectionDecisions(
      ...node.elements.filter(Boolean).map(analyzeRendererValueProjection)
    );
  }

  if (t.isUnaryExpression(node) && node.operator === "void") {
    return "inline";
  }

  return "unknown";
}

function ensureRendererBindingImport(programPath) {
  const bodyPaths = programPath.get("body");
  const runtimeImports = bodyPaths.filter(
    (path) =>
      path.isImportDeclaration() &&
      path.node.source.value === "@litsx/litsx/internal/runtime-render-context"
  );

  const importSpecifier = t.importSpecifier(
    t.identifier("bindRendererContext"),
    t.identifier("bindRendererContext")
  );

  for (const importPath of runtimeImports) {
    const { specifiers } = importPath.node;
    const hasImport = specifiers.some(
      (specifier) =>
        t.isImportSpecifier(specifier) &&
        t.isIdentifier(specifier.imported, { name: "bindRendererContext" })
    );

    if (hasImport) {
      return;
    }

    specifiers.push(importSpecifier);
    return;
  }

  programPath.unshiftContainer("body", t.importDeclaration(
    [importSpecifier],
    t.stringLiteral("@litsx/litsx/internal/runtime-render-context")
  ));
}

export default function transformLitsxRendererProps(api) {
  api.assertVersion?.(7);
  t = api.types;

  return {
    name: "transform-litsx-renderer-props",
    inherits: jsxSyntaxPlugin.default || jsxSyntaxPlugin,
    visitor: {
      Program: {
        enter(_, state) {
          state.__litsxNeedsRendererBindingImport = false;
        },
        exit(programPath, state) {
          if (state.__litsxNeedsRendererBindingImport) {
            ensureRendererBindingImport(programPath);
          }
        },
      },
      JSXAttribute(path, state) {
        const { node } = path;
        if (node.value?.type !== "JSXExpressionContainer") {
          return;
        }

        const rawName = decodeVirtualAttributeName(node.name.name) ?? node.name.name;
        const expression = node.value.expression;
        if (!shouldBindRendererContext(rawName, expression)) {
          return;
        }

        state.__litsxNeedsRendererBindingImport = true;
        const projected = analyzeRendererBodyProjection(
          expression.body ?? expression
        ) !== "inline";

        node.value.expression = t.callExpression(
          t.identifier("bindRendererContext"),
          [
            createHostReferenceExpression(),
            expression,
            t.objectExpression([
              t.objectProperty(
                t.identifier("projected"),
                t.booleanLiteral(projected)
              ),
            ]),
          ]
        );
      },
    },
  };
}
