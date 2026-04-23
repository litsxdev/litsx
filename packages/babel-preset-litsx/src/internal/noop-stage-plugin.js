import helperPluginUtils from "@babel/helper-plugin-utils";
import jsxSyntaxPlugin from "@babel/plugin-syntax-jsx";

const { declare } = helperPluginUtils;

export function createNoopStagePlugin(pluginName) {
  return declare((api) => {
    api.assertVersion(7);

    return {
      name: pluginName,
      inherits: jsxSyntaxPlugin.default || jsxSyntaxPlugin,
      visitor: {},
    };
  });
}
