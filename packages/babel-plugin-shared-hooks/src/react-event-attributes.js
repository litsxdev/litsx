export function isReactEventAttribute(node, t) {
  if (!t.isJSXIdentifier(node)) return false;
  return /^on[A-Z]/.test(node.name);
}

export function assertNoReactEventAttributes(path, t, errorMessage) {
  path.traverse({
    JSXAttribute(attrPath) {
      if (isReactEventAttribute(attrPath.node.name, t)) {
        throw attrPath.buildCodeFrameError(errorMessage);
      }
    },
  });
}
