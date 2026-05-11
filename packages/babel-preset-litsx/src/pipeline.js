import transformJsxHtmlTemplate from "@litsx/babel-plugin-transform-jsx-html-template";
import transformLitsxScopedElements from "@litsx/babel-plugin-transform-litsx-scoped-elements";
import transformLitsxDomRefs from "./internal/transform-litsx-dom-refs.js";
import transformLitsxHooks from "./internal/transform-litsx-hooks.js";
import transformLitsxComponents from "./internal/transform-litsx-components.js";
import transformLitsxRendererProps from "./internal/transform-litsx-renderer-props.js";
import transformLitsxBoundaries from "./internal/transform-litsx-boundaries.js";
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
const REF_FEATURE_PATTERN = /\buseRef\b|\bref\s*=/;
const SCOPED_ELEMENTS_PATTERN = /<\s*(?:[A-Z][\w.]*(?=[\s/>])|[a-z][\w]*-[\w-]*(?=[\s/>]))/;
const LIGHT_DOM_PATTERN = /\^lightDom\b|static\s+lightDom\s*=\s*true\b/;
const BOUNDARY_PATTERN = /\b(?:ErrorBoundary|SuspenseBoundary)\b/;

function escapeRegExp(value) {
  return String(value).replace(/[\\^$.*+?()[\]{}|]/g, "\\$&");
}

function hasCallToLocal(text, localName) {
  return new RegExp(`\\b${escapeRegExp(localName)}\\s*\\(`).test(text);
}

function isIdentifierChar(char) {
  return /[A-Za-z0-9_$]/.test(char);
}

function isBoundaryChar(char) {
  return !char || !isIdentifierChar(char);
}

function collapseWhitespace(value) {
  let result = "";
  let previousWasWhitespace = false;

  for (const char of String(value)) {
    const isWhitespace = /\s/.test(char);
    if (!isWhitespace) {
      result += char;
      previousWasWhitespace = false;
      continue;
    }

    if (!previousWasWhitespace) {
      result += " ";
      previousWasWhitespace = true;
    }
  }

  return result.trim();
}

function findImportClauseEnd(text, startIndex) {
  let braceDepth = 0;

  for (let index = startIndex; index < text.length; index += 1) {
    const char = text[index];

    if (char === "{") {
      braceDepth += 1;
      continue;
    }

    if (char === "}") {
      braceDepth = Math.max(0, braceDepth - 1);
      continue;
    }

    if (
      braceDepth === 0 &&
      text.startsWith("from", index) &&
      isBoundaryChar(text[index - 1]) &&
      isBoundaryChar(text[index + 4])
    ) {
      return index;
    }
  }

  return -1;
}

function forEachImportClause(text, visit) {
  let startIndex = 0;

  while (startIndex < text.length) {
    const importIndex = text.indexOf("import", startIndex);
    if (importIndex === -1) {
      return;
    }

    if (!isBoundaryChar(text[importIndex - 1]) || !isBoundaryChar(text[importIndex + 6])) {
      startIndex = importIndex + 6;
      continue;
    }

    let clauseStart = importIndex + 6;
    while (clauseStart < text.length && /\s/.test(text[clauseStart])) {
      clauseStart += 1;
    }

    if (
      text.startsWith("type", clauseStart) &&
      isBoundaryChar(text[clauseStart + 4])
    ) {
      startIndex = clauseStart + 4;
      continue;
    }

    const firstClauseChar = text[clauseStart];
    if (firstClauseChar === "'" || firstClauseChar === "\"") {
      startIndex = clauseStart + 1;
      continue;
    }

    const fromIndex = findImportClauseEnd(text, clauseStart);
    if (fromIndex === -1) {
      return;
    }

    const clause = text.slice(clauseStart, fromIndex).trim();
    if (clause) {
      visit(clause);
    }

    startIndex = fromIndex + 4;
  }
}

function getImportedLocalNames(importClause) {
  const locals = [];
  const namedStart = importClause.indexOf("{");
  const namedEnd = namedStart === -1 ? -1 : importClause.indexOf("}", namedStart + 1);
  const namedBlock = namedStart === -1 || namedEnd === -1
    ? ""
    : importClause.slice(namedStart + 1, namedEnd);
  const beforeNamed = (namedStart === -1 ? importClause : importClause.slice(0, namedStart))
    .trim()
    .replace(/,$/, "");

  if (beforeNamed && !beforeNamed.includes("*")) {
    locals.push(beforeNamed);
  }

  if (namedBlock) {
    for (const rawSpecifier of namedBlock.split(",")) {
      const specifier = collapseWhitespace(rawSpecifier);
      if (!specifier || specifier.startsWith("type ")) continue;
      const aliasIndex = specifier.indexOf(" as ");
      const localName = aliasIndex === -1
        ? specifier
        : specifier.slice(aliasIndex + 4).trim();
      if (localName) {
        locals.push(localName);
      }
    }
  }

  return locals.filter((name) => /^use[A-Z0-9][A-Za-z0-9_$]*$/.test(name));
}

function hasImportedCustomHookCall(text) {
  const namespaceNames = [];

  forEachImportClause(text, (importClause) => {
    if (importClause.startsWith("*")) {
      const normalizedClause = collapseWhitespace(importClause);
      if (normalizedClause.startsWith("* as ")) {
        const namespaceName = normalizedClause.slice(5).trim();
        if (namespaceName && /^[A-Za-z_$][\w$]*$/.test(namespaceName)) {
          namespaceNames.push(namespaceName);
        }
      }
      return;
    }

    for (const localName of getImportedLocalNames(importClause)) {
      if (hasCallToLocal(text, localName)) {
        namespaceNames.length = 0;
        namespaceNames.push("__litsx_match__");
        return;
      }
    }
  });

  if (namespaceNames.includes("__litsx_match__")) {
    return true;
  }

  for (const namespaceName of namespaceNames) {
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
    boundaries: BOUNDARY_PATTERN.test(text),
  };
}

function shouldIncludeFeaturePlugin(sourceFeatures, key) {
  if (!sourceFeatures) {
    return true;
  }

  return sourceFeatures[key] === true;
}

export function createLitsxPresetPlugins(options = {}, sourceFeatures = null) {
  const plugins = [];

  if (shouldIncludeFeaturePlugin(sourceFeatures, "boundaries")) {
    plugins.push([
      transformLitsxBoundaries,
      options.transformLitsxBoundaries || {},
    ]);
  }

  plugins.push(
    [transformLitsxRendererProps, options.transformLitsxRendererProps || {}],
    [transformLitsxServerComponents, options.transformLitsxServerComponents || {}],
    [transformLitsxComponents, normalizeTransformLitsxOptions(options)],
  );

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

  plugins.push([transformLitsxSsrRoots, options.transformLitsxSsrRoots || {}]);

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
