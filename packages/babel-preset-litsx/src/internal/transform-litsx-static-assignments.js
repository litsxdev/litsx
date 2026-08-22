import jsxSyntaxPlugin from "@babel/plugin-syntax-jsx";
import { createImportedStaticStyleClassifier } from "./static-style-validation.js";

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

function unwrapTypeExpression(node, t) {
  while (
    t.isTSAsExpression?.(node) ||
    t.isTSSatisfiesExpression?.(node) ||
    t.isTSNonNullExpression?.(node) ||
    t.isParenthesizedExpression?.(node)
  ) node = node.expression;
  return node;
}

function findDefiniteNonRuntimeStyle(
  node,
  scope,
  t,
  seen = new Set(),
  importedClassifier = null,
) {
  node = unwrapTypeExpression(node, t);
  if (!node) return null;
  if (t.isStringLiteral(node) || t.isTemplateLiteral(node) || t.isObjectExpression(node)) return node;
  if (t.isArrayExpression(node)) {
    for (const element of node.elements) {
      if (!element) continue;
      const invalid = findDefiniteNonRuntimeStyle(
        t.isSpreadElement(element) ? element.argument : element,
        scope,
        t,
        seen,
        importedClassifier,
      );
      if (invalid) return invalid;
    }
    return null;
  }
  if (t.isConditionalExpression(node) || t.isLogicalExpression(node)) {
    return findDefiniteNonRuntimeStyle(
      node.consequent ?? node.left,
      scope,
      t,
      seen,
      importedClassifier,
    ) || findDefiniteNonRuntimeStyle(
      node.alternate ?? node.right,
      scope,
      t,
      seen,
      importedClassifier,
    );
  }
  if (t.isIdentifier(node) && !seen.has(node.name)) {
    const binding = scope.getBinding(node.name);
    const init = binding?.path?.isVariableDeclarator?.() ? binding.path.node.init : null;
    if (init) {
      seen.add(node.name);
      return findDefiniteNonRuntimeStyle(
        init,
        binding.path.scope,
        t,
        seen,
        importedClassifier,
      );
    }
    if (importedClassifier?.(binding?.path)) return node;
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

function isReplaceStylesBinding(path, t) {
  if (path?.isImportSpecifier?.()) {
    const imported = path.node.imported;
    return (
      (t.isIdentifier(imported, { name: "replaceStyles" }) ||
        t.isStringLiteral(imported, { value: "replaceStyles" })) &&
      path.parentPath?.node?.source?.value === "@litsx/core"
    );
  }
  return false;
}

function unwrapReplaceStyles(expressionPath, t) {
  if (!expressionPath?.isCallExpression?.()) return null;
  const calleePath = expressionPath.get("callee");
  let isHelper = false;

  if (calleePath.isIdentifier()) {
    isHelper = isReplaceStylesBinding(
      expressionPath.scope.getBinding(calleePath.node.name)?.path,
      t,
    );
  } else if (
    calleePath.isMemberExpression() &&
    !calleePath.node.computed &&
    t.isIdentifier(calleePath.node.property, { name: "replaceStyles" }) &&
    t.isIdentifier(calleePath.node.object)
  ) {
    const binding = expressionPath.scope.getBinding(calleePath.node.object.name);
    isHelper = Boolean(
      binding?.path?.isImportNamespaceSpecifier?.() &&
      binding.path.parentPath?.node?.source?.value === "@litsx/core",
    );
  }

  if (!isHelper) return null;
  if (expressionPath.node.arguments.length !== 1) {
    throw expressionPath.buildCodeFrameError(
      "replaceStyles() expects exactly one Lit CSSResultGroup.",
    );
  }
  const [argument] = expressionPath.node.arguments;
  if (t.isSpreadElement(argument)) {
    throw expressionPath.buildCodeFrameError(
      "replaceStyles() does not accept a spread argument.",
    );
  }
  return argument;
}

function insertStaticAssignments(functionPath, assignments, t) {
  if (assignments.length === 0) return;
  const statements = assignments.map(({ staticName, value, sourceNode, replaceInheritedStyles }) => {
    const macroName = staticName === "styles"
      ? replaceInheritedStyles
        ? "__litsx_static_styles_replace_value"
        : "__litsx_static_styles_value"
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
  api.assertVersion("^8.0.0");
  const t = api.types;

  return {
    name: "transform-litsx-static-assignments",
    inherits: jsxSyntaxPlugin.default || jsxSyntaxPlugin,
    visitor: {
      Program: {
        enter(programPath, state) {
          const importedStyleClassifier = createImportedStaticStyleClassifier(
            state.filename || state.file.opts.filename,
          );
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

            if (![
              "elements",
              "expose",
              "lightDom",
              "properties",
              "shadowRootOptions",
              "styles",
            ].includes(assigned.staticName)) continue;

            const replacement = assigned.staticName === "styles"
              ? unwrapReplaceStyles(statementPath.get("expression.right"), t)
              : null;
            if (assigned.staticName === "styles") {
              const styleValue = replacement ?? expression.right;
              const invalidStyle = findDefiniteNonRuntimeStyle(
                styleValue,
                statementPath.scope,
                t,
                new Set(),
                importedStyleClassifier,
              );
              if (invalidStyle) {
                throw statementPath.buildCodeFrameError(
                  `${assigned.componentName}.styles must be a Lit CSSResultGroup. ` +
                  "Use css`...` from lit, or enable an authoring integration that consumes static style guards.",
                );
              }
            }

            const assignments = assignmentsByComponent.get(assigned.componentName) || [];
            assignments.push({
              staticName: assigned.staticName,
              value: assigned.staticName === "styles"
                ? (replacement ?? expression.right)
                : expression.right,
              replaceInheritedStyles:
                assigned.staticName === "styles" &&
                replacement !== null,
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
