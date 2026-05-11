import transformJsxHtmlTemplate from "@litsx/babel-plugin-transform-jsx-html-template";
import transformLitsxScopedElements from "@litsx/babel-plugin-transform-litsx-scoped-elements";
import transformLitsxDomRefs from "./internal/transform-litsx-dom-refs.js";
import transformLitsxHooks from "./internal/transform-litsx-hooks.js";
import transformLitsxComponents from "./internal/transform-litsx-components.js";
import transformLitsxRendererProps from "./internal/transform-litsx-renderer-props.js";
import transformLitsxServerComponents from "./internal/transform-litsx-server-components.js";
import transformLitsxSsrRoots from "./internal/transform-litsx-ssr-roots.js";

const NATIVE_TRANSFORM_OPTION_KEYS = [
  "ssr",
  "defaultDomMode",
  "typeResolutionMode",
  "inMemoryFiles",
  "compilerOptions",
  "typescriptSession",
  "suppressNativeClassNameWarning",
  "__litsxCompilationSession",
];

const HOOK_FEATURE_PATTERN = /\bdefineHook\b/;
const DEFAULT_OR_NAMED_IMPORT_PATTERN = /\bimport\s+(?!type\b)([^'";]+?)\s+from\b/g;
const NAMESPACE_IMPORT_PATTERN = /\bimport\s+(?!type\b)\*\s+as\s+([A-Za-z_$][\w$]*)\s+from\b/g;
const REF_FEATURE_PATTERN = /\buseRef\b|\bref\s*=/;
const SCOPED_ELEMENTS_PATTERN = /<\s*(?:[A-Z][\w.]*(?=[\s/>])|[a-z][\w]*-[\w-]*(?=[\s/>]))/;
const LIGHT_DOM_PATTERN = /\^lightDom\b|static\s+lightDom\s*=\s*true\b/;

function escapeRegExp(value) {
  return String(value).replace(/[\\^$.*+?()[\]{}|]/g, "\\$&");
}

function hasCallToLocal(text, localName) {
  return new RegExp(`\\b${escapeRegExp(localName)}\\s*\\(`).test(text);
}

function getImportedLocalNames(importClause) {
  const locals = [];
  const namedMatch = importClause.match(/\{([^}]*)\}/);
  const beforeNamed = importClause.split("{", 1)[0].replace(/,$/, "").trim();

  if (beforeNamed && !beforeNamed.includes("*")) {
    locals.push(beforeNamed);
  }

  if (namedMatch) {
    for (const rawSpecifier of namedMatch[1].split(",")) {
      const specifier = rawSpecifier.trim();
      if (!specifier || specifier.startsWith("type ")) continue;
      const parts = specifier.split(/\s+as\s+/);
      const localName = (parts[1] || parts[0]).trim();
      if (localName) {
        locals.push(localName);
      }
    }
  }

  return locals.filter((name) => /^use[A-Z0-9][A-Za-z0-9_$]*$/.test(name));
}

function hasImportedCustomHookCall(text) {
  DEFAULT_OR_NAMED_IMPORT_PATTERN.lastIndex = 0;
  let match;
  while ((match = DEFAULT_OR_NAMED_IMPORT_PATTERN.exec(text))) {
    for (const localName of getImportedLocalNames(match[1])) {
      if (hasCallToLocal(text, localName)) {
        return true;
      }
    }
  }

  NAMESPACE_IMPORT_PATTERN.lastIndex = 0;
  while ((match = NAMESPACE_IMPORT_PATTERN.exec(text))) {
    const namespaceName = match[1];
    if (
      new RegExp(`\\b${escapeRegExp(namespaceName)}\\s*\\.\\s*use[A-Z0-9][A-Za-z0-9_$]*\\s*\\(`)
        .test(text)
    ) {
      return true;
    }
  }

  return false;
}

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
    hooks:
      HOOK_FEATURE_PATTERN.test(text) ||
      hasImportedCustomHookCall(text),
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
  const normalizedTransformOptions = normalizeTransformLitsxOptions(options);
  const plugins = [
    [transformLitsxRendererProps, options.transformLitsxRendererProps || {}],
    [
      transformLitsxServerComponents,
      {
        ...normalizedTransformOptions,
        ...(options.transformLitsxServerComponents || {}),
      },
    ],
    [transformLitsxComponents, normalizedTransformOptions],
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

  plugins.push([
    transformLitsxSsrRoots,
    {
      ...normalizedTransformOptions,
      ...(options.transformLitsxSsrRoots || {}),
    },
  ]);

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
