export function ensurePrepareEffectsCall(renderMethodPath, t) {
  const bodyPath = renderMethodPath.get('body');
  if (!bodyPath.isBlockStatement()) return false;

  const statements = bodyPath.get('body');
  if (statements.length > 0) {
    const first = statements[0];
    if (
      first.isExpressionStatement() &&
      t.isCallExpression(first.node.expression) &&
      t.isIdentifier(first.node.expression.callee, { name: 'prepareEffects' }) &&
      first.node.expression.arguments.length === 1 &&
      t.isThisExpression(first.node.expression.arguments[0])
    ) {
      return false;
    }
  }

  const prepareCall = t.expressionStatement(
    t.callExpression(t.identifier('prepareEffects'), [t.thisExpression()])
  );

  bodyPath.unshiftContainer('body', prepareCall);
  return true;
}
