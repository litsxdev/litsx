import babelCore from "@babel/core";
import * as babelParser from "@babel/parser";
import * as babelTypes from "@babel/types";
import transformTypescript from "@babel/plugin-transform-typescript";
import transformJsxHtmlTemplate from "@litsx/babel-plugin-transform-jsx-html-template";
import { decodeVirtualAttributeName } from "@litsx/authoring";
import {
  createLitsxPresetPlugins,
  detectLitsxSourceFeatures,
} from "@litsx/babel-preset-litsx";
import { ensureTypescriptModule } from "@litsx/babel-preset-litsx/internal/transform-litsx-properties";
import { parseWithLitsxVirtualization } from "@litsx/authoring/internal/parser";
import {
  createProjectTsSession,
  createStandaloneTsSession,
  normalizeFilePath,
} from "@litsx/typescript-session";
import { SourceMapConsumer } from "source-map-js";
import {
  patchLitAttributeSourcemap,
} from "@litsx/babel-plugin-transform-jsx-html-template";
import {
  ensureLitsxParserPlugins,
  prepareLitsxAuthoredInput,
} from "./authored-input.js";
import { mergeLitsxWarnings } from "./warnings.js";
export {
  ensureLitsxParserPlugins,
  prepareLitsxAuthoredInput,
} from "./authored-input.js";

const { transformFromAstAsync, transformFromAstSync } = babelCore;
const PROFILE_ENABLED = process.env.LITSX_PROFILE === "1";
const PRESET_PLUGIN_CACHE = new WeakMap();
const DEFAULT_PRESET_PLUGIN_CACHE = new Map();

function createStandaloneTsCompilerOptions(ts) {
  return {
    target: ts.ScriptTarget.ESNext,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    jsx: ts.JsxEmit.Preserve,
    allowJs: true,
    checkJs: false,
    skipLibCheck: true,
    strict: false,
    esModuleInterop: true,
    allowSyntheticDefaultImports: true,
    types: [],
  };
}

function getSourceFeaturesCacheKey(sourceFeatures) {
  if (!sourceFeatures) {
    return "all";
  }

  return [
    sourceFeatures.hooks ? "1" : "0",
    sourceFeatures.domRefs ? "1" : "0",
    sourceFeatures.scopedElements ? "1" : "0",
  ].join("");
}

function profilePhase(name, callback, profile = null) {
  if (!PROFILE_ENABLED) {
    return callback();
  }

  const start = performance.now();
  try {
    return callback();
  } finally {
    const durationMs = performance.now() - start;
    if (profile) {
      profile.push({ name, durationMs });
    }
    if (PROFILE_ENABLED) {
      globalThis.__litsxProfileEvents ??= [];
      globalThis.__litsxProfileEvents.push({
        namespace: "compiler",
        name,
        durationMs,
      });
    }
  }
}

function normalizePluginList(plugins) {
  return Array.isArray(plugins) ? plugins : [];
}

function shouldStripTypescriptSyntax(filename = "") {
  return /\.tsx?$/.test(filename);
}

function reparseTemplateLoweringAst(source, options = {}) {
  return parseWithLitsxVirtualization(babelParser.parse, source, {
    sourceType: "module",
    plugins: ensureLitsxParserPlugins(
      options.filename,
      options.parserPlugins,
      { requireJsx: true },
    ),
    sourceFileName: options.filename,
    litsxSourceMap: false,
  });
}

function collectAuthoredTemplateAttributeMappings(
  node,
  mappings = [],
  options = {},
) {
  if (!node || typeof node !== "object") {
    return mappings;
  }

  if (node.type === "JSXElement") {
    for (const attr of node.openingElement?.attributes || []) {
      if (attr?.type !== "JSXAttribute") {
        continue;
      }

      const rawName = decodeVirtualAttributeName(attr.name.name) ?? attr.name.name;
      const prefix = rawName[0];
      const generatedName =
        prefix === "." || prefix === "@" || prefix === "?"
          ? `${prefix}${rawName.slice(1)}`
          : rawName;
      const sourceLocation = attr.name?.loc ?? attr.loc ?? null;

      mappings.push({
        generatedNeedle: attr.value
          ? ` ${generatedName}=`
          : ` ${generatedName}`,
        generatedOffset: 1,
        generatedScope: "html-template",
        source: sourceLocation?.filename ?? options.sourceFileName ?? null,
        line: sourceLocation?.start?.line ?? null,
        column: sourceLocation?.start?.column ?? null,
      });
    }
  }

  const visitorKeys = babelTypes.VISITOR_KEYS?.[node.type];
  if (!visitorKeys) {
    return mappings;
  }

  for (const key of visitorKeys) {
    const value = node[key];
    if (Array.isArray(value)) {
      for (const child of value) {
        collectAuthoredTemplateAttributeMappings(child, mappings, options);
      }
      continue;
    }

    collectAuthoredTemplateAttributeMappings(value, mappings, options);
  }

  return mappings;
}

function jsxTagName(name) {
  if (name?.type !== "JSXIdentifier") {
    return null;
  }

  return name.name.replace(/([a-z])([A-Z])/g, "$1-$2").toLowerCase();
}

function isChildrenExpression(node) {
  return node?.type === "MemberExpression" &&
    node.computed !== true &&
    node.property?.type === "Identifier" &&
    node.property.name === "children";
}

function componentNameFromFunctionNode(node) {
  if (
    node?.type === "FunctionDeclaration" &&
    node.id?.type === "Identifier" &&
    /^[A-Z]/.test(node.id.name)
  ) {
    return node.id.name;
  }

  return null;
}

function componentNameFromVariableNode(node) {
  if (
    node?.type === "VariableDeclarator" &&
    node.id?.type === "Identifier" &&
    (node.init?.type === "ArrowFunctionExpression" || node.init?.type === "FunctionExpression") &&
    /^[A-Z]/.test(node.id.name)
  ) {
    return node.id.name;
  }

  return null;
}

// The component lowering pass creates a class around the authored function.
// Preserve direct anchors for the user-authored render boundary and template
// nodes, because generated class members intentionally have no source location.
function collectAuthoredRenderSourcemapMappings(
  node,
  mappings = [],
  options = {},
  context = { componentRender: false },
) {
  if (!node || typeof node !== "object") {
    return mappings;
  }

  if (node.type === "ReturnStatement" && node.argument?.type === "JSXElement") {
    const returnLocation = node.loc;
    mappings.push({
      generatedNeedle: "return html`",
      generatedScope: "render-return",
      source: returnLocation?.filename ?? options.sourceFileName ?? null,
      line: returnLocation?.start?.line ?? null,
      column: returnLocation?.start?.column ?? null,
    });
    if (context.componentRender) {
      mappings.push({
        generatedNeedle: "render()",
        generatedScope: "render",
        source: returnLocation?.filename ?? options.sourceFileName ?? null,
        line: returnLocation?.start?.line ?? null,
        column: returnLocation?.start?.column ?? null,
      });
    }
  }

  const componentName =
    componentNameFromFunctionNode(node) ?? componentNameFromVariableNode(node);
  if (componentName) {
    const componentLocation = node.loc;
    mappings.push({
      generatedNeedle: `class ${componentName}`,
      generatedScope: "class",
      componentName,
      source: componentLocation?.filename ?? options.sourceFileName ?? null,
      line: componentLocation?.start?.line ?? null,
      column: componentLocation?.start?.column ?? null,
    });
  }

  if (node.type === "JSXElement") {
    const tagName = jsxTagName(node.openingElement?.name);
    const tagLocation = node.openingElement?.name?.loc ?? node.openingElement?.loc;
    if (tagName) {
      mappings.push({
        generatedNeedle: `<${tagName}`,
        generatedScope: "html-template",
        source: tagLocation?.filename ?? options.sourceFileName ?? null,
        line: tagLocation?.start?.line ?? null,
        column: tagLocation?.start?.column ?? null,
      });
    }
  }

  if (node.type === "JSXExpressionContainer" && isChildrenExpression(node.expression)) {
    const expressionLocation = node.expression.loc ?? node.loc;
    mappings.push({
      generatedNeedle: "<slot",
      generatedScope: "html-template",
      source: expressionLocation?.filename ?? options.sourceFileName ?? null,
      line: expressionLocation?.start?.line ?? null,
      column: expressionLocation?.start?.column ?? null,
    });
  }

  const visitorKeys = babelTypes.VISITOR_KEYS?.[node.type];
  if (!visitorKeys) {
    return mappings;
  }

  const nextContext = babelTypes.isFunction(node)
    ? { componentRender: context.componentFunctionRoot === true || componentName !== null }
    : context;

  for (const key of visitorKeys) {
    const value = node[key];
    const childContext =
      componentNameFromVariableNode(node) !== null && key === "init"
        ? { componentRender: true, componentFunctionRoot: true }
        : nextContext;
    if (Array.isArray(value)) {
      for (const child of value) {
        collectAuthoredRenderSourcemapMappings(child, mappings, options, childContext);
      }
      continue;
    }

    collectAuthoredRenderSourcemapMappings(value, mappings, options, childContext);
  }

  return mappings;
}

function remapTemplateAttributeMappings(mappings = [], inputSourceMap = null) {
  if (!Array.isArray(mappings) || mappings.length === 0 || !inputSourceMap) {
    return mappings;
  }

  const consumer = new SourceMapConsumer(inputSourceMap);

  try {
    return mappings.map((mapping) => {
      if (!mapping?.source || mapping.line == null || mapping.column == null) {
        return mapping;
      }

      const original = consumer.originalPositionFor({
        line: mapping.line,
        column: mapping.column,
      });

      if (original.source == null || original.line == null || original.column == null) {
        return mapping;
      }

      return {
        ...mapping,
        source: original.source,
        line: original.line,
        column: original.column,
      };
    });
  } finally {
    consumer.destroy?.();
  }
}

function mergeTemplateLoweringMetadata(
  firstPassMetadata = {},
  secondPassMetadata = {},
  firstPassMap = null,
  authoredTemplateAttributeMappings = [],
) {
  const remappedTemplateAttributeMappings = remapTemplateAttributeMappings(
    secondPassMetadata.litsxTemplateAttributeMappings || [],
    firstPassMap,
  );
  const templateAttributeMappings = authoredTemplateAttributeMappings.length > 0
    ? authoredTemplateAttributeMappings.map((mapping, index) => {
        // The first pass can rename an authored JSX attribute (`onClick` ->
        // `@click`) while retaining its position in traversal order. Babel's
        // intermediate map points generated attribute names at the preceding
        // token in some JSX shapes, so location matching is not reliable here.
        const generated = remappedTemplateAttributeMappings[index];
        return generated
          ? {
              ...mapping,
              generatedNeedle: generated.generatedNeedle,
              generatedOffset: generated.generatedOffset,
            }
          : mapping;
      })
    : remappedTemplateAttributeMappings;

  return {
    ...firstPassMetadata,
    ...secondPassMetadata,
    ...(templateAttributeMappings.length > 0
      ? { litsxTemplateAttributeMappings: templateAttributeMappings }
      : {}),
  };
}

function getStandaloneTsSessionKey(filename = "", ts = ensureTypescriptModule()) {
  const normalizedFilename = normalizeFilePath(filename);
  const directory = normalizedFilename ? normalizedFilename.slice(0, normalizedFilename.lastIndexOf("/")) || "/" : "/";
  return JSON.stringify({
    directory,
    compilerOptions: createStandaloneTsCompilerOptions(ts),
  });
}

function getMemoizedPresetPlugins(options, sourceFeatures = null, session = null) {
  const featureKey = getSourceFeaturesCacheKey(sourceFeatures);
  if (session) {
    const cache = session.presetPluginsByOptions;
    const optionsKey = options && typeof options === "object" ? options : null;

    if (!optionsKey) {
      if (!cache.default.has(featureKey)) {
        cache.default.set(featureKey, createLitsxPresetPlugins({}, sourceFeatures));
      }
      return cache.default.get(featureKey);
    }

    let cachedPluginsByFeature = cache.byOptions.get(optionsKey);
    if (!cachedPluginsByFeature) {
      cachedPluginsByFeature = new Map();
      cache.byOptions.set(optionsKey, cachedPluginsByFeature);
    }

    const cachedPlugins = cachedPluginsByFeature.get(featureKey);
    if (cachedPlugins) {
      return cachedPlugins;
    }

    const plugins = createLitsxPresetPlugins(options, sourceFeatures);
    cachedPluginsByFeature.set(featureKey, plugins);
    return plugins;
  }

  if (!options || typeof options !== "object") {
    if (!DEFAULT_PRESET_PLUGIN_CACHE.has(featureKey)) {
      DEFAULT_PRESET_PLUGIN_CACHE.set(
        featureKey,
        createLitsxPresetPlugins({}, sourceFeatures),
      );
    }
    return DEFAULT_PRESET_PLUGIN_CACHE.get(featureKey);
  }

  let cachedPluginsByFeature = PRESET_PLUGIN_CACHE.get(options);
  if (!cachedPluginsByFeature) {
    cachedPluginsByFeature = new Map();
    PRESET_PLUGIN_CACHE.set(options, cachedPluginsByFeature);
  }

  const cachedPlugins = cachedPluginsByFeature.get(featureKey);
  if (cachedPlugins) {
    return cachedPlugins;
  }

  const plugins = createLitsxPresetPlugins(options, sourceFeatures);
  cachedPluginsByFeature.set(featureKey, plugins);
  return plugins;
}

function getSessionFeatureCacheKey(source, options = {}) {
  return `${options.filename || ""}:${source}`;
}

function createCompilerCaches() {
  return {
    sourceFeatures: new Map(),
    authoredInput: new Map(),
    importedModuleAnalyses: new Map(),
    importedHookModuleAnalyses: new Map(),
    resolvedImports: new Map(),
    presetPluginsByOptions: {
      default: new Map(),
      byOptions: new WeakMap(),
    },
  };
}

function normalizeFinalSourceMap(map, source, options = {}) {
  if (!map || typeof map !== "object") {
    return map ?? null;
  }

  const filename = typeof options.filename === "string" && options.filename.length > 0
    ? options.filename
    : null;

  if (!filename || typeof source !== "string") {
    return map;
  }

  const sources = Array.isArray(map.sources) ? [...map.sources] : [];
  if (sources.length === 0) {
    return map;
  }

  const sourcesContent = Array.isArray(map.sourcesContent)
    ? [...map.sourcesContent]
    : new Array(sources.length).fill(null);

  let changed = false;
  let matched = false;

  for (let index = 0; index < sources.length; index += 1) {
    if (sources[index] !== filename) {
      continue;
    }

    matched = true;
    if (sourcesContent[index] !== source) {
      sourcesContent[index] = source;
      changed = true;
    }
  }

  if (!matched && sources.length === 1) {
    matched = true;
    if (sources[0] !== filename) {
      sources[0] = filename;
      changed = true;
    }
    if (sourcesContent[0] !== source) {
      sourcesContent[0] = source;
      changed = true;
    }
  }

  if (!changed) {
    return map;
  }

  return {
    ...map,
    sources,
    sourcesContent,
  };
}

function createStandaloneCompilerTsSession(options = {}) {
  const typescriptModule = options.typescriptModule || ensureTypescriptModule();
  return createStandaloneTsSession({
    sessionKey: getStandaloneTsSessionKey(options.filename, typescriptModule),
    typescript: typescriptModule,
    compilerOptions: createStandaloneTsCompilerOptions(typescriptModule),
  });
}

function createProjectCompilerTsSession(projectPath, typescriptModule = ensureTypescriptModule()) {
  const configFile = typescriptModule.readConfigFile(projectPath, typescriptModule.sys.readFile);
  if (configFile.error) {
    throw new Error(typescriptModule.flattenDiagnosticMessageText(configFile.error.messageText, "\n"));
  }

  const normalizedProjectPath = normalizeFilePath(projectPath);
  const lastSlash = normalizedProjectPath.lastIndexOf("/");
  const basePath = lastSlash > 0 ? normalizedProjectPath.slice(0, lastSlash) : ".";
  const parsedCommandLine = typescriptModule.parseJsonConfigFileContent(
    configFile.config,
    typescriptModule.sys,
    basePath,
    undefined,
    normalizedProjectPath,
  );
  const configErrors = (parsedCommandLine.errors || [])
    .filter((diagnostic) => diagnostic.code !== 18003);
  if (configErrors.length) {
    throw new Error(configErrors
      .map((diagnostic) => typescriptModule.flattenDiagnosticMessageText(diagnostic.messageText, "\n"))
      .join("\n"));
  }

  return createProjectTsSession({
    sessionKey: `project:${normalizedProjectPath}`,
    typescript: typescriptModule,
    parsedCommandLine,
  });
}

export function createLitsxCompilationSession(sessionOptions = {}) {
  const caches = createCompilerCaches();
  const session = {
    projectPath: sessionOptions.projectPath || null,
    transformOptions: sessionOptions.transformOptions || {},
    typescriptSession:
      sessionOptions.projectPath
        ? createProjectCompilerTsSession(
            sessionOptions.projectPath,
            sessionOptions.typescriptModule,
          )
        : createStandaloneCompilerTsSession({
            filename: sessionOptions.transformOptions?.filename,
            typescriptModule: sessionOptions.typescriptModule,
          }),
    presetPluginsByOptions: caches.presetPluginsByOptions,
    sourceFeaturesCache: caches.sourceFeatures,
    authoredInputCache: caches.authoredInput,
    importedModuleAnalysisCache: caches.importedModuleAnalyses,
    importedHookModuleAnalysisCache: caches.importedHookModuleAnalyses,
    resolvedImportCache: caches.resolvedImports,
    transform(source, options = {}) {
      return transformLitsx(source, {
        ...this.transformOptions,
        ...options,
        typescriptSession: this.typescriptSession,
        __litsxCompilationSession: this,
      });
    },
    transformSync(source, options = {}) {
      return transformLitsxSync(source, {
        ...this.transformOptions,
        ...options,
        typescriptSession: this.typescriptSession,
        __litsxCompilationSession: this,
      });
    },
    invalidate(files = null) {
      if (!files || files.length === 0) {
        this.sourceFeaturesCache.clear();
        this.authoredInputCache.clear();
        this.importedModuleAnalysisCache.clear();
        this.importedHookModuleAnalysisCache.clear();
        this.resolvedImportCache.clear();
        this.typescriptSession?.invalidate?.({ host: true });
        return;
      }

      for (const file of files) {
        const normalizedFile = normalizeFilePath(file);
        for (const key of [...this.sourceFeaturesCache.keys()]) {
          if (key.startsWith(`${normalizedFile}:`)) {
            this.sourceFeaturesCache.delete(key);
          }
        }
        for (const key of [...this.authoredInputCache.keys()]) {
          if (key.startsWith(`${normalizedFile}:`)) {
            this.authoredInputCache.delete(key);
          }
        }
        this.importedModuleAnalysisCache.delete(normalizedFile);
        this.importedHookModuleAnalysisCache.delete(normalizedFile);
        for (const key of [...this.resolvedImportCache.keys()]) {
          if (key.startsWith(`${normalizedFile}::`)) {
            this.resolvedImportCache.delete(key);
          }
        }
        if (/\.[cm]?[jt]sx?$/.test(file)) {
          this.typescriptSession?.invalidate?.();
        }
      }
    },
    dispose() {
      this.invalidate();
      this.typescriptSession?.clearOverlayFiles?.();
      this.typescriptSession = null;
    },
  };
  return session;
}

export function createLitsxTransformConfig(source, options = {}) {
  const profile = PROFILE_ENABLED ? [] : null;
  const compilationSession = options.__litsxCompilationSession || null;
  const memoizationOptions = options.__litsxMemoizeOptions || options;
  const featureCacheKey = getSessionFeatureCacheKey(source, options);
  const sourceFeatures = profilePhase(
    "feature-detection",
    () => {
      if (compilationSession?.sourceFeaturesCache?.has(featureCacheKey)) {
        return compilationSession.sourceFeaturesCache.get(featureCacheKey);
      }
      const detected = detectLitsxSourceFeatures(source, options);
      compilationSession?.sourceFeaturesCache?.set(featureCacheKey, detected);
      return detected;
    },
    profile,
  );
  const authoredInputCacheKey = featureCacheKey;
  const { filename, virtualization, inputAst, authoredWarnings, moduleAnalysis } = profilePhase(
    "authored-input",
    () => {
      if (compilationSession?.authoredInputCache?.has(authoredInputCacheKey)) {
        return compilationSession.authoredInputCache.get(authoredInputCacheKey);
      }
      const prepared = prepareLitsxAuthoredInput(
        source,
        options,
        {
          transformFromAstSync,
        }
      );
      compilationSession?.authoredInputCache?.set(authoredInputCacheKey, prepared);
      return prepared;
    },
    profile,
  );
  const shouldRunFinalTemplatePass = options.jsxTemplate !== false;
  const outputPlugins = normalizePluginList(options.outputPlugins);
  const presetOptions = shouldRunFinalTemplatePass
    ? {
        ...memoizationOptions,
        jsxTemplate: false,
      }
    : memoizationOptions;
  const presetPlugins = profilePhase(
    "preset-plugins",
    () => getMemoizedPresetPlugins(presetOptions, sourceFeatures, compilationSession),
    profile,
  );

  const finalTemplatePlugins = shouldRunFinalTemplatePass
    ? [
        [
          transformJsxHtmlTemplate,
          {
            ssr: options.ssr === true,
            componentAttributeFallback: false,
            ...(options.jsxTemplateOptions || {}),
          },
        ],
        ...outputPlugins,
        ...(shouldStripTypescriptSyntax(filename)
          ? [[transformTypescript, { isTSX: true, allowDeclareFields: true }]]
          : []),
      ]
    : [];
  const authoredTemplateAttributeMappings =
    shouldRunFinalTemplatePass && options.sourceMaps === true
      ? [
          ...collectAuthoredTemplateAttributeMappings(inputAst.program, [], {
            sourceFileName: filename,
          }),
          ...collectAuthoredRenderSourcemapMappings(inputAst.program, [], {
            sourceFileName: filename,
          }),
        ]
      : [];

  return {
    filename,
    inputAst,
    authoredWarnings,
    moduleAnalysis,
    profile,
    shouldRunFinalTemplatePass,
    finalTemplatePlugins,
    authoredTemplateAttributeMappings,
    babelOptions: {
      filename,
      sourceFileName: filename,
      configFile: false,
      babelrc: false,
      inputSourceMap:
        options.sourceMaps === true ? virtualization?.map ?? undefined : undefined,
      sourceMaps: options.sourceMaps === true,
      plugins: shouldRunFinalTemplatePass
        ? [...presetPlugins]
        : [
            ...presetPlugins,
            ...outputPlugins,
            ...(shouldStripTypescriptSyntax(filename)
              ? [[transformTypescript, { isTSX: true, allowDeclareFields: true }]]
              : []),
          ],
    },
  };
}

function finalizeTransformResult(
  result,
  source,
  options,
  authoredWarnings = [],
  moduleAnalysis = null,
  profile = [],
) {
  if (!result) {
    return {
      code: "",
      map: null,
      metadata: {
        ...(moduleAnalysis ? { litsxModuleAnalysis: moduleAnalysis } : {}),
        ...(profile?.length > 0 ? { litsxProfile: profile } : {}),
      },
    };
  }

  const metadata = {
    ...(result.metadata || {}),
  };
  if (moduleAnalysis) {
    metadata.litsxModuleAnalysis = moduleAnalysis;
  }
  const mergedWarnings = mergeLitsxWarnings(
    metadata.litsxWarnings || [],
    authoredWarnings,
    { filename: options.filename }
  );
  if (mergedWarnings.length > 0) {
    metadata.litsxWarnings = mergedWarnings;
  }
  if (profile?.length > 0) {
    metadata.litsxProfile = profile;
  }
  const templateAttributeMappings = metadata.litsxTemplateAttributeMappings || [];
  const map =
    options.sourceMaps === true
      ? options.jsxTemplate === false
        ? normalizeFinalSourceMap(result.map ?? null, source, options)
        : templateAttributeMappings.length === 0
          ? normalizeFinalSourceMap(result.map ?? null, source, options)
          : profilePhase(
            "sourcemap-patching",
            () => patchLitAttributeSourcemap(
              result.code || "",
              result.map ?? null,
              templateAttributeMappings,
            ),
            profile,
          )
      : null;
  const normalizedMap =
    options.sourceMaps === true
      ? normalizeFinalSourceMap(map, source, options)
      : null;

  return {
    code: result.code || "",
    map: normalizedMap,
    metadata,
  };
}

export async function transformLitsx(source, options = {}) {
  if (!options.__litsxCompilationSession) {
    const standaloneTsSession = createStandaloneCompilerTsSession({
      filename: options.filename,
    });
    const nextOptions = {
      ...options,
      typescriptSession: standaloneTsSession,
      __litsxMemoizeOptions: options,
    };
    const {
      inputAst,
      babelOptions,
      shouldRunFinalTemplatePass,
      finalTemplatePlugins,
      authoredTemplateAttributeMappings,
      authoredWarnings,
      moduleAnalysis,
      profile,
    } = createLitsxTransformConfig(source, nextOptions);
    const firstPassResult = await profilePhase(
      "babel-transform",
      () => transformFromAstAsync(inputAst, source, {
        ...babelOptions,
        ast: shouldRunFinalTemplatePass,
        plugins: babelOptions.plugins,
      }),
      profile,
    );
    const result = shouldRunFinalTemplatePass
      ? await profilePhase(
          "template-lowering",
          async () => {
            const reparsedTemplateAst = reparseTemplateLoweringAst(
              firstPassResult?.code ?? source,
              nextOptions,
            );
            const secondPassResult = await transformFromAstAsync(
              reparsedTemplateAst,
              firstPassResult?.code ?? source,
              {
                filename: babelOptions.filename,
                sourceFileName: babelOptions.sourceFileName,
                configFile: false,
                babelrc: false,
                inputSourceMap:
                  options.sourceMaps === true ? firstPassResult?.map ?? undefined : undefined,
                sourceMaps: options.sourceMaps === true,
                plugins: finalTemplatePlugins,
              }
            );

            return {
              ...secondPassResult,
              metadata: mergeTemplateLoweringMetadata(
                firstPassResult?.metadata || {},
                secondPassResult?.metadata || {},
                firstPassResult?.map ?? null,
                authoredTemplateAttributeMappings,
              ),
            };
          },
          profile,
        )
      : firstPassResult;
    return finalizeTransformResult(
      result,
      source,
      nextOptions,
      authoredWarnings,
      moduleAnalysis,
      profile,
    );
  }

  const {
    inputAst,
    babelOptions,
    shouldRunFinalTemplatePass,
    finalTemplatePlugins,
    authoredTemplateAttributeMappings,
    authoredWarnings,
    moduleAnalysis,
    profile,
  } = createLitsxTransformConfig(source, options);
  const firstPassResult = await profilePhase(
    "babel-transform",
    () => transformFromAstAsync(inputAst, source, {
      ...babelOptions,
      ast: shouldRunFinalTemplatePass,
      plugins: babelOptions.plugins,
    }),
    profile,
  );
  const result = shouldRunFinalTemplatePass
    ? await profilePhase(
        "template-lowering",
        async () => {
          const reparsedTemplateAst = reparseTemplateLoweringAst(
            firstPassResult?.code ?? source,
            options,
          );
          const secondPassResult = await transformFromAstAsync(
            reparsedTemplateAst,
            firstPassResult?.code ?? source,
            {
              filename: babelOptions.filename,
              sourceFileName: babelOptions.sourceFileName,
              configFile: false,
              babelrc: false,
              inputSourceMap:
                options.sourceMaps === true ? firstPassResult?.map ?? undefined : undefined,
              sourceMaps: options.sourceMaps === true,
              plugins: finalTemplatePlugins,
            }
          );

          return {
            ...secondPassResult,
            metadata: mergeTemplateLoweringMetadata(
              firstPassResult?.metadata || {},
              secondPassResult?.metadata || {},
              firstPassResult?.map ?? null,
              authoredTemplateAttributeMappings,
            ),
          };
        },
        profile,
      )
    : firstPassResult;
  return finalizeTransformResult(
    result,
    source,
    options,
    authoredWarnings,
    moduleAnalysis,
    profile,
  );
}

export function transformLitsxSync(source, options = {}) {
  if (!options.__litsxCompilationSession) {
    const standaloneTsSession = createStandaloneCompilerTsSession({
      filename: options.filename,
    });
    const nextOptions = {
      ...options,
      typescriptSession: standaloneTsSession,
      __litsxMemoizeOptions: options,
    };
    const {
      inputAst,
      babelOptions,
      shouldRunFinalTemplatePass,
      finalTemplatePlugins,
      authoredTemplateAttributeMappings,
      authoredWarnings,
      moduleAnalysis,
      profile,
    } = createLitsxTransformConfig(source, nextOptions);
    const firstPassResult = profilePhase(
      "babel-transform",
      () => transformFromAstSync(inputAst, source, {
        ...babelOptions,
        ast: shouldRunFinalTemplatePass,
      }),
      profile,
    );
    const result = shouldRunFinalTemplatePass
      ? profilePhase(
          "template-lowering",
          () => {
            const reparsedTemplateAst = reparseTemplateLoweringAst(
              firstPassResult?.code ?? source,
              nextOptions,
            );
            const secondPassResult = transformFromAstSync(
              reparsedTemplateAst,
              firstPassResult?.code ?? source,
              {
                filename: babelOptions.filename,
                sourceFileName: babelOptions.sourceFileName,
                configFile: false,
                babelrc: false,
                inputSourceMap:
                  options.sourceMaps === true ? firstPassResult?.map ?? undefined : undefined,
                sourceMaps: options.sourceMaps === true,
                plugins: finalTemplatePlugins,
              }
            );

            return {
              ...secondPassResult,
              metadata: mergeTemplateLoweringMetadata(
                firstPassResult?.metadata || {},
                secondPassResult?.metadata || {},
                firstPassResult?.map ?? null,
                authoredTemplateAttributeMappings,
              ),
            };
          },
          profile,
        )
      : firstPassResult;
    return finalizeTransformResult(
      result,
      source,
      nextOptions,
      authoredWarnings,
      moduleAnalysis,
      profile,
    );
  }

  const {
    inputAst,
    babelOptions,
    shouldRunFinalTemplatePass,
    finalTemplatePlugins,
    authoredTemplateAttributeMappings,
    authoredWarnings,
    moduleAnalysis,
    profile,
  } = createLitsxTransformConfig(source, options);
  const firstPassResult = profilePhase(
    "babel-transform",
    () => transformFromAstSync(inputAst, source, {
      ...babelOptions,
      ast: shouldRunFinalTemplatePass,
    }),
    profile,
  );
  const result = shouldRunFinalTemplatePass
    ? profilePhase(
        "template-lowering",
        () => {
          const reparsedTemplateAst = reparseTemplateLoweringAst(
            firstPassResult?.code ?? source,
            options,
          );
          const secondPassResult = transformFromAstSync(
            reparsedTemplateAst,
            firstPassResult?.code ?? source,
            {
              filename: babelOptions.filename,
              sourceFileName: babelOptions.sourceFileName,
              configFile: false,
              babelrc: false,
              inputSourceMap:
                options.sourceMaps === true ? firstPassResult?.map ?? undefined : undefined,
              sourceMaps: options.sourceMaps === true,
              plugins: finalTemplatePlugins,
            }
          );

          return {
            ...secondPassResult,
            metadata: mergeTemplateLoweringMetadata(
              firstPassResult?.metadata || {},
              secondPassResult?.metadata || {},
              firstPassResult?.map ?? null,
              authoredTemplateAttributeMappings,
            ),
          };
        },
        profile,
      )
    : firstPassResult;
  return finalizeTransformResult(
    result,
    source,
    options,
    authoredWarnings,
    moduleAnalysis,
    profile,
  );
}

export default transformLitsx;
