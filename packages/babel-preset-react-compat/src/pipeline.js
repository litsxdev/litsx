import litsxPropTypes from "@litsx/babel-plugin-litsx-proptypes";
import transformJsxHtmlTemplate from "@litsx/babel-plugin-transform-jsx-html-template";
import transformLitsxScopedElements from "@litsx/babel-plugin-transform-litsx-scoped-elements";
import { normalizeTransformLitsxOptions } from "@litsx/babel-preset-litsx/pipeline";
import transformLitsxDomRefs from "@litsx/babel-preset-litsx/internal/transform-litsx-dom-refs";
import transformLitsxHooks from "@litsx/babel-preset-litsx/internal/transform-litsx-hooks";
import transformLitsxComponents from "@litsx/babel-preset-litsx/internal/transform-litsx-components";
import transformLitsxJsxBindings from "@litsx/babel-preset-litsx/internal/transform-litsx-jsx-bindings";
import transformLitsxStaticAssignments from "@litsx/babel-preset-litsx/internal/transform-litsx-static-assignments";
import transformLitsxRendererProps from "@litsx/babel-preset-litsx/internal/transform-litsx-renderer-props";
import transformTypescriptNamespaceCollisions from "@litsx/babel-preset-litsx/internal/transform-typescript-namespace-collisions";
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
import reactKeys from "./internal/react-keys.js";
import reactUnsupportedHooks from "./internal/react-unsupported-hooks.js";
import reactHookExportAliases from "./internal/react-hook-export-aliases.js";

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
    transformTypescriptNamespaceCollisions,
    reactHookExportAliases,
    [reactAttributes, options.reactAttributes || {}],
    [reactWrappers, options.reactWrappers || {}],
    [reactContext, options.reactContext || {}],
    [litsxPropTypes, options.litsxPropTypes || {}],
    [transformLitsxRendererProps, {
      deferComponentImportsFrom: ["react", "react-error-boundary"],
      ...(options.transformLitsxRendererProps || {}),
    }],
    transformLitsxStaticAssignments,
    [transformLitsxJsxBindings, {
      ...normalizedOptions.transformLitsx,
      reactCompatBoundaries: true,
      reactCompatEvents: true,
      reactCompatKeys: options.reactKeys !== false,
    }],
    [
      transformLitsxComponents,
      {
        ...normalizedOptions.transformLitsx,
        getWrapperMetadata: getReactWrapperMetadata,
      },
    ],
    ...(options.reactKeys === false
      ? []
      : [[reactKeys, options.reactKeys || {}]]),
    [
      transformLitsxHooks,
      {
        ...normalizedOptions.transformLitsx,
        ignoredCustomHookSources: ["react", "@litsx/core/context"],
        runtimeCustomHookSources: ["react"],
        runtimeCustomHookNames: ["startTransition"],
        ...(options.transformLitsxHooks || {}),
      },
    ],
    [transformLitsxDomRefs, options.transformLitsxDomRefs || {}],
    [reactHooks, {
      // The structural hook pass immediately above already rewrites imported
      // hooks whose implementation proves that they need the active host.
      // Avoid treating every opaque third-party `use*` export as host-aware.
      transformImportedCustomHooks: false,
      ...(options.reactHooks || {}),
    }],
    [reactUseState, { allowReactAttributes: true, ...(options.reactUseState || {}) }],
    [reactUseRef, options.reactUseRef || {}],
    [reactLazy, options.reactLazy || {}],
    [reactErrorBoundary, options.reactErrorBoundary || {}],
    [reactSuspense, options.reactSuspense || {}],
    reactUnsupportedHooks,
    [reactDomAttributes, options.reactDomAttributes || {}],
    [reactEvents, options.reactEvents || {}],
    [transformLitsxScopedElements, options.transformLitsxScopedElements || {}],
  ];

  if (options.jsxTemplate !== false) {
    plugins.push([transformJsxHtmlTemplate, {
      componentAttributeFallback: false,
      reactCompatEvents: true,
      ...(options.jsxTemplateOptions || {}),
    }]);
  }

  return plugins;
}
