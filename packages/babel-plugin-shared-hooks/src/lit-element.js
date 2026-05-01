export function isLitElementSuperClass(superClass, t) {
  if (!superClass) return false;
  if (t.isIdentifier(superClass, { name: 'LitElement' })) return true;
  if (t.isCallExpression(superClass) && superClass.arguments.length > 0) {
    return isLitElementSuperClass(superClass.arguments[0], t);
  }
  return false;
}
