import transformJsxHtmlTemplate from "@litsx/babel-plugin-transform-jsx-html-template";
import transformLitsxScopedElements from "@litsx/babel-plugin-transform-litsx-scoped-elements";
import transformLitsxDomRefs from "./internal/transform-litsx-dom-refs.js";
import transformLitsxHooks from "./internal/transform-litsx-hooks.js";
import transformLitsxComponents from "./internal/transform-litsx-components.js";
import transformLitsxRendererProps from "./internal/transform-litsx-renderer-props.js";

const NATIVE_TRANSFORM_OPTION_KEYS = [
  "defaultDomMode",
  "typeResolutionMode",
  "inMemoryFiles",
  "compilerOptions",
  "typescriptSession",
  "suppressNativeClassNameWarning",
  "__litsxCompilationSession",
];

const HOOK_FEATURE_PATTERN = /\b(?:defineHook|useOnConnect|useAfterUpdate|useOnCommit|useMemoValue|useStableCallback|useEvent|useEmit|usePrevious|useReducedState|useState|useControlledState|useAsyncState|useOptimistic|useExpose|useExternalStore|useHost|useHostContent|useSlot|useTextContent|useTransition|useDeferredValue|useStyle|useRef|useCallbackRef|useStableId)\b/;
const REF_FEATURE_PATTERN = /\buseRef\b|\bref\s*=/;
const SCOPED_ELEMENTS_PATTERN = /<\s*(?:[A-Z][\w.]*(?=[\s/>])|[a-z][\w]*-[\w-]*(?=[\s/>]))/;
const LIGHT_DOM_PATTERN = /\^lightDom\b|static\s+lightDom\s*=\s*true\b/;

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

export function detectLitsxSourceFeatures(source, options = {}) {
  const text = typeof source === "string" ? source : "";
  const transformOptions = normalizeTransformLitsxOptions(options);

  return {
    hooks: HOOK_FEATURE_PATTERN.test(text),
    domRefs: REF_FEATURE_PATTERN.test(text),
    scopedElements:
      transformOptions.defaultDomMode === "light" ||
      LIGHT_DOM_PATTERN.test(text) ||
      SCOPED_ELEMENTS_PATTERN.test(text),
  };
}

function shouldIncludeFeaturePlugin(sourceFeatures, key) {
  if (!sourceFeatures) {
    return true;
  }

  return sourceFeatures[key] === true;
}

export function createLitsxPresetPlugins(options = {}, sourceFeatures = null) {
  const plugins = [
    [transformLitsxRendererProps, options.transformLitsxRendererProps || {}],
    [transformLitsxComponents, normalizeTransformLitsxOptions(options)],
  ];

  if (shouldIncludeFeaturePlugin(sourceFeatures, "hooks")) {
    plugins.push([
      transformLitsxHooks,
      {
        ...normalizeTransformLitsxOptions(options),
        ...(options.transformLitsxHooks || {}),
      },
    ]);
  }

  if (shouldIncludeFeaturePlugin(sourceFeatures, "domRefs")) {
    plugins.push([transformLitsxDomRefs, options.transformLitsxDomRefs || {}]);
  }

  if (shouldIncludeFeaturePlugin(sourceFeatures, "scopedElements")) {
    plugins.push([transformLitsxScopedElements, options.transformLitsxScopedElements || {}]);
  }

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
  setTypescriptModule,
} from "./internal/transform-litsx-properties.js";
