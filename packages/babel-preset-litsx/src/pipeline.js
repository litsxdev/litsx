import transformJsxHtmlTemplate from "../../babel-plugin-transform-jsx-html-template/src/index.js";
import transformLitsxScopedElements from "../../babel-plugin-transform-litsx-scoped-elements/src/index.js";
import transformLitsxDomRefs from "./internal/transform-litsx-dom-refs.js";
import transformLitsxHooks from "./internal/transform-litsx-hooks.js";
import transformLitsxComponents from "./internal/transform-litsx-components.js";
import transformLitsxProperties from "./internal/transform-litsx-properties.js";
import transformLitsxStaticHoists from "./internal/transform-litsx-static-hoists.js";
import transformLitsxHandlers from "./internal/transform-litsx-handlers.js";

const NATIVE_TRANSFORM_OPTION_KEYS = [
  "defaultDomMode",
  "typeResolutionMode",
  "inMemoryFiles",
  "suppressNativeClassNameWarning",
];

export function normalizeTransformLitsxOptions(options = {}) {
  const transformLitsxOptions = {
    ...(options.transformLitsx || {}),
  };

  for (const key of NATIVE_TRANSFORM_OPTION_KEYS) {
    if (Object.prototype.hasOwnProperty.call(options, key)) {
      transformLitsxOptions[key] = options[key];
    }
  }

  return transformLitsxOptions;
}

export function createLitsxPresetPlugins(options = {}) {
  const plugins = [
    [transformLitsxComponents, normalizeTransformLitsxOptions(options)],
    [transformLitsxHooks, options.transformLitsxHooks || {}],
    [transformLitsxDomRefs, options.transformLitsxDomRefs || {}],
    [transformLitsxProperties, options.transformLitsxProperties || {}],
    [transformLitsxStaticHoists, options.transformLitsxStaticHoists || {}],
    [transformLitsxHandlers, options.transformLitsxHandlers || {}],
    [transformLitsxScopedElements, options.transformLitsxScopedElements || {}],
  ];

  if (options.jsxTemplate !== false) {
    if (options.jsxTemplateOptions && Object.keys(options.jsxTemplateOptions).length > 0) {
      plugins.push([transformJsxHtmlTemplate, options.jsxTemplateOptions]);
    } else {
      plugins.push(transformJsxHtmlTemplate);
    }
  }

  return plugins;
}

export {
  default as transformLitsxComponents,
  createTransformFunctionToClassPlugin as createTransformLitsxComponentsPlugin,
} from "./internal/transform-litsx-components.js";
export {
  default as transformLitsxProperties,
  setTypescriptModule,
} from "./internal/transform-litsx-properties.js";
export {
  default as transformLitsxStaticHoists,
} from "./internal/transform-litsx-static-hoists.js";
export {
  default as transformLitsxHandlers,
} from "./internal/transform-litsx-handlers.js";
