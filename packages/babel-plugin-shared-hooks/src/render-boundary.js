export function ensureHooksRenderWrapper(renderMethodPath, t) {
  const bodyPath = renderMethodPath.get("body");
  if (!bodyPath.isBlockStatement()) return false;

  const statements = bodyPath.node.body;
  if (
    statements.length === 1 &&
    t.isReturnStatement(statements[0]) &&
    t.isCallExpression(statements[0].argument) &&
    t.isIdentifier(statements[0].argument.callee, { name: "renderWithHooks" })
  ) {
    return false;
  }

  bodyPath.node.body = [
    t.returnStatement(
      t.callExpression(t.identifier("renderWithHooks"), [
        t.thisExpression(),
        t.arrowFunctionExpression([], t.blockStatement(statements)),
      ])
    ),
  ];
  return true;
}
