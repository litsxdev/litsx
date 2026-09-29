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
import transformLitsxLazy from "@litsx/babel-preset-litsx/internal/transform-litsx-lazy";
import reactSuspense from "./internal/react-suspense.js";
import reactErrorBoundary from "./internal/react-error-boundary.js";
import reactEvents from "./internal/react-events.js";
import reactContext from "./internal/react-context.js";
import reactKeys from "./internal/react-keys.js";
import reactUnsupportedHooks from "./internal/react-unsupported-hooks.js";
import reactHookExportAliases from "./internal/react-hook-export-aliases.js";
import reactElementRuntime from "./internal/react-element-runtime.js";
import reactPolymorphicElements from "./internal/react-polymorphic-elements.js";
import reactRefs from "./internal/react-refs.js";

export function normalizeReactCompatOptions(options = {}) {
  const domMode = options.domMode === "shadow" ? "shadow" : "light";

  return {
    domMode,
    transformLitsx: normalizeTransformLitsxOptions({
      ...options,
      defaultDomMode: domMode,
      lightDomStyles: "global",
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
    reactElementRuntime,
    reactRefs,
    reactPolymorphicElements,
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
      importedComponentRestProps: true,
    }],
    [
      transformLitsxComponents,
      {
        ...normalizedOptions.transformLitsx,
        allowNullRender: true,
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
        ignoredCustomHookSources: ["react", "@litsx/core", "@litsx/core/context"],
        runtimeCustomHookSources: ["react"],
        runtimeCustomHookNames: ["startTransition"],
        ...(options.transformLitsxHooks || {}),
      },
    ],
    [transformLitsxDomRefs, options.transformLitsxDomRefs || {}],
    [reactHooks, {
      // The structural hook pass immediately above already rewrites imported
      // hooks whose implementation proves that they use the LitSX runtime.
      // Avoid treating every opaque third-party `use*` export as compatible.
      transformImportedCustomHooks: false,
      ...(options.reactHooks || {}),
    }],
    [reactUseState, { allowReactAttributes: true, ...(options.reactUseState || {}) }],
    [reactUseRef, options.reactUseRef || {}],
    [transformLitsxLazy, {
      sources: ["react"],
      ...(options.reactLazy || {}),
    }],
    [reactErrorBoundary, options.reactErrorBoundary || {}],
    [reactSuspense, options.reactSuspense || {}],
    reactUnsupportedHooks,
    [reactDomAttributes, options.reactDomAttributes || {}],
    [reactEvents, options.reactEvents || {}],
    [transformLitsxScopedElements, {
      reactCompat: true,
      ...(options.transformLitsxScopedElements || {}),
    }],
  ];

  if (options.jsxTemplate !== false) {
    plugins.push([transformJsxHtmlTemplate, {
      componentAttributeFallback: false,
      reactCompatEvents: true,
      componentRestProps: true,
      importedComponentRestProps: true,
      reactCompatRefs: true,
      ...(options.jsxTemplateOptions || {}),
    }]);
  }

  return plugins;
}
