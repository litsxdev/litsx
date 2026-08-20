import jsxSyntaxPlugin from "@babel/plugin-syntax-jsx";

function isPascalCaseName(name) {
  return typeof name === "string" && /^[A-Z]/.test(name);
}

function getAssignedStaticName(node, t) {
  if (!t.isMemberExpression(node) || !t.isIdentifier(node.object)) {
    return null;
  }
  if (!node.computed && t.isIdentifier(node.property)) {
    return { componentName: node.object.name, staticName: node.property.name };
  }
  if (node.computed && t.isStringLiteral(node.property)) {
    return { componentName: node.object.name, staticName: node.property.value };
  }
  return null;
}

function getComponentFunctionPath(statementPath, t) {
  const declarationPath = statementPath.isExportNamedDeclaration?.() ||
    statementPath.isExportDefaultDeclaration?.()
    ? statementPath.get("declaration")
    : statementPath;

  if (declarationPath?.isFunctionDeclaration?.()) {
    const name = declarationPath.node.id?.name;
    return isPascalCaseName(name) && declarationPath.node.async !== true
      ? { name, path: declarationPath }
      : null;
  }

  if (!declarationPath?.isVariableDeclaration?.()) return null;
  for (const declaratorPath of declarationPath.get("declarations")) {
    const name = declaratorPath.node.id?.name;
    const initPath = declaratorPath.get("init");
    if (
      isPascalCaseName(name) &&
      initPath.node.async !== true &&
      (initPath?.isArrowFunctionExpression?.() || initPath?.isFunctionExpression?.())
    ) {
      return { name, path: initPath };
    }
  }
  return null;
}

function insertStaticAssignments(functionPath, assignments, t) {
  if (assignments.length === 0) return;
  const statements = assignments.map(({ staticName, value, sourceNode }) => {
    const macroName = staticName === "styles"
      ? "__litsx_static_styles_value"
      : `__litsx_static_${staticName}`;
    const statement = t.expressionStatement(
      t.callExpression(
        t.identifier(macroName),
        [t.cloneNode(value, true)],
      ),
    );
    statement.loc = sourceNode.loc;
    return statement;
  });

  if (functionPath.get("body").isBlockStatement()) {
    functionPath.get("body").unshiftContainer("body", statements);
    return;
  }

  const originalBody = t.cloneNode(functionPath.node.body, true);
  functionPath.node.body = t.blockStatement([
    ...statements,
    t.returnStatement(originalBody),
  ]);
  functionPath.node.expression = false;
}

export default function transformLitsxStaticAssignments(api) {
  api.assertVersion?.(7);
  const t = api.types;

  return {
    name: "transform-litsx-static-assignments",
    inherits: jsxSyntaxPlugin.default || jsxSyntaxPlugin,
    visitor: {
      Program: {
        enter(programPath) {
          const components = new Map();
          for (const statementPath of programPath.get("body")) {
            const component = getComponentFunctionPath(statementPath, t);
            if (component) components.set(component.name, component.path);
          }

          const assignmentsByComponent = new Map();
          for (const statementPath of programPath.get("body")) {
            if (!statementPath.isExpressionStatement()) continue;
            const expression = statementPath.node.expression;
            if (!t.isAssignmentExpression(expression, { operator: "=" })) continue;
            const assigned = getAssignedStaticName(expression.left, t);
            if (!assigned || !components.has(assigned.componentName)) continue;
            if (!/^[$A-Z_a-z][$\w]*$/.test(assigned.staticName)) continue;
            // React propTypes are executable compatibility metadata, not LitSX
            // host configuration. Leave them for react-compat (or userland).
            if (assigned.staticName === "propTypes" || assigned.staticName === "events") continue;

            if (
              assigned.staticName === "styles" &&
              (t.isStringLiteral(expression.right) || t.isTemplateLiteral(expression.right))
            ) {
              throw statementPath.buildCodeFrameError(
                `${assigned.componentName}.styles must be a Lit CSSResultGroup. ` +
                "Use css`...` from lit instead of a plain string or untagged template literal.",
              );
            }

            const assignments = assignmentsByComponent.get(assigned.componentName) || [];
            assignments.push({
              staticName: assigned.staticName,
              value: expression.right,
              sourceNode: statementPath.node,
            });
            assignmentsByComponent.set(assigned.componentName, assignments);
            statementPath.remove();
          }

          for (const [componentName, assignments] of assignmentsByComponent) {
            insertStaticAssignments(components.get(componentName), assignments, t);
          }
        },
      },
    },
  };
}
