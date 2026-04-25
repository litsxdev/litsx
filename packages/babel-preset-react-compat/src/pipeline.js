import litsxPropTypes from "../../babel-plugin-litsx-proptypes/src/index.js";
import transformJsxHtmlTemplate from "../../babel-plugin-transform-jsx-html-template/src/index.js";
import transformLitsxScopedElements from "../../babel-plugin-transform-litsx-scoped-elements/src/index.js";
import { normalizeTransformLitsxOptions } from "../../babel-preset-litsx/src/pipeline.js";
import transformLitsxDomRefs from "../../babel-preset-litsx/src/internal/transform-litsx-dom-refs.js";
import transformLitsxHooks from "../../babel-preset-litsx/src/internal/transform-litsx-hooks.js";
import transformLitsxComponents from "../../babel-preset-litsx/src/internal/transform-litsx-components.js";
import reactAttributes from "./internal/react-attributes.js";
import reactDomAttributes from "./internal/react-dom-attributes.js";
import reactHooks from "./internal/react-hooks.js";
import reactWrappers, { getReactWrapperMetadata } from "./internal/react-wrappers.js";
import { reactUseState, reactUseRef } from "./internal/react-shared-hooks.js";
import reactLazy from "./internal/react-lazy.js";
import reactSuspense from "./internal/react-suspense.js";
import reactErrorBoundary from "./internal/react-error-boundary.js";
import reactEvents from "./internal/react-events.js";
import reactContext from "./internal/react-context.js";

export function normalizeReactCompatOptions(options = {}) {
  const domMode = options.domMode === "light" ? "light" : "shadow";

  return {
    domMode,
    transformLitsx: normalizeTransformLitsxOptions({
      ...options,
      defaultDomMode: domMode,
      suppressNativeClassNameWarning: true,
      transformLitsx: {
        ...(options.transformLitsx || {}),
      },
    }),
  };
}

export function createReactCompatPresetPlugins(options = {}) {
  const normalizedOptions = normalizeReactCompatOptions(options);

  const plugins = [
    [reactAttributes, options.reactAttributes || {}],
    [reactWrappers, options.reactWrappers || {}],
    [reactContext, options.reactContext || {}],
    [litsxPropTypes, options.litsxPropTypes || {}],
    [
      transformLitsxComponents,
      {
        ...normalizedOptions.transformLitsx,
        getWrapperMetadata: getReactWrapperMetadata,
      },
    ],
    [transformLitsxHooks, options.transformLitsxHooks || {}],
    [transformLitsxDomRefs, options.transformLitsxDomRefs || {}],
    [reactHooks, options.reactHooks || {}],
    [reactUseState, { allowReactAttributes: true, ...(options.reactUseState || {}) }],
    [reactUseRef, options.reactUseRef || {}],
    [reactLazy, options.reactLazy || {}],
    [reactErrorBoundary, options.reactErrorBoundary || {}],
    [reactSuspense, options.reactSuspense || {}],
    [transformLitsxScopedElements, options.transformLitsxScopedElements || {}],
    [reactDomAttributes, options.reactDomAttributes || {}],
    [reactEvents, options.reactEvents || {}],
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
