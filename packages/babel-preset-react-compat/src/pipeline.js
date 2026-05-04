import litsxPropTypes from "@litsx/babel-plugin-litsx-proptypes";
import transformJsxHtmlTemplate from "@litsx/babel-plugin-transform-jsx-html-template";
import transformLitsxScopedElements from "@litsx/babel-plugin-transform-litsx-scoped-elements";
import { normalizeTransformLitsxOptions } from "@litsx/babel-preset-litsx/pipeline";
import transformLitsxDomRefs from "@litsx/babel-preset-litsx/internal/transform-litsx-dom-refs";
import transformLitsxHooks from "@litsx/babel-preset-litsx/internal/transform-litsx-hooks";
import transformLitsxComponents from "@litsx/babel-preset-litsx/internal/transform-litsx-components";
import transformLitsxRendererProps from "@litsx/babel-preset-litsx/internal/transform-litsx-renderer-props";
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
    [transformLitsxRendererProps, options.transformLitsxRendererProps || {}],
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
