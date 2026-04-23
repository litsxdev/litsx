import helperPluginUtils from "@babel/helper-plugin-utils";

const { declare } = helperPluginUtils;
function transformAttribute(attrPath, t) {
  if (!attrPath.isJSXAttribute()) return false;

  const { node } = attrPath;
  if (!t.isJSXIdentifier(node.name, { name: "className" })) return false;

  attrPath.replaceWith(
    t.jsxAttribute(t.jsxIdentifier("class"), node.value ? t.cloneNode(node.value, true) : null)
  );
  return true;
}

function transformTemplateLiteral(quasi) {
  const { quasis } = quasi;

  for (const templateElement of quasis) {
    const raw = templateElement.value.raw;
    const cooked = templateElement.value.cooked;

    if (!raw.includes("className=")) {
      continue;
    }

    templateElement.value.raw = raw.replace(/(\s)className(?=\s*=)/g, "$1class");
    templateElement.value.cooked = cooked.replace(/(\s)className(?=\s*=)/g, "$1class");
  }
}

export default declare((api) => {
  api.assertVersion(7);
  const t = api.types;

  return {
    name: "@litsx/babel-plugin-transform-react-attributes",
    visitor: {
      JSXOpeningElement(path) {
        path.get("attributes").forEach((attrPath) => {
          transformAttribute(attrPath, t);
        });
      },
      TaggedTemplateExpression(path) {
        const { node } = path;
        if (!t.isTemplateLiteral(node.quasi)) return;
        transformTemplateLiteral(node.quasi);
      },
    },
  };
});
