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
import { parseWithLitsxVirtualization } from "@litsx/authoring/parser";
import { createLitsxTypecheckSession } from "@litsx/typescript/typecheck";
import {
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
  return /\.(?:ts|tsx|litsx)$/.test(filename) || filename.endsWith(".litsx.jsx");
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
  const templateAttributeMappings =
    authoredTemplateAttributeMappings.length > 0
      ? authoredTemplateAttributeMappings
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

function createStandaloneCompilerTsSession(options = {}) {
  const typescriptModule = options.typescriptModule || ensureTypescriptModule();
  return createStandaloneTsSession({
    sessionKey: getStandaloneTsSessionKey(options.filename, typescriptModule),
    typescript: typescriptModule,
    compilerOptions: createStandaloneTsCompilerOptions(typescriptModule),
  });
}

export function createLitsxCompilationSession(sessionOptions = {}) {
  const caches = createCompilerCaches();
  const session = {
    projectPath: sessionOptions.projectPath || null,
    transformOptions: sessionOptions.transformOptions || {},
    typescriptSession:
      sessionOptions.projectPath
        ? createLitsxTypecheckSession(["--project", sessionOptions.projectPath]).projectSession
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
    getTypecheckSession(rawArgs = this.projectPath ? ["--project", this.projectPath] : []) {
      return createLitsxTypecheckSession(rawArgs, {
        projectSession: this.typescriptSession,
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
        if (/\.(jsx|tsx|js|ts|litsx)$/.test(file) || file.endsWith(".litsx.jsx")) {
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
  const { filename, virtualization, inputAst, authoredWarnings } = profilePhase(
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
        ...(options.jsxTemplateOptions && Object.keys(options.jsxTemplateOptions).length > 0
          ? [[transformJsxHtmlTemplate, options.jsxTemplateOptions]]
          : [transformJsxHtmlTemplate]),
        ...outputPlugins,
        ...(shouldStripTypescriptSyntax(filename)
          ? [[transformTypescript, { isTSX: true, allowDeclareFields: true }]]
          : []),
      ]
    : [];
  const authoredTemplateAttributeMappings =
    shouldRunFinalTemplatePass && options.sourceMaps === true
      ? collectAuthoredTemplateAttributeMappings(inputAst.program, [], {
          sourceFileName: filename,
        })
      : [];

  return {
    filename,
    inputAst,
    authoredWarnings,
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

function finalizeTransformResult(result, options, authoredWarnings = [], profile = []) {
  if (!result) {
    return {
      code: "",
      map: null,
      metadata: profile?.length > 0 ? { litsxProfile: profile } : {},
    };
  }

  const metadata = {
    ...(result.metadata || {}),
  };
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
        ? result.map ?? null
        : templateAttributeMappings.length === 0
          ? result.map ?? null
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

  return {
    code: result.code || "",
    map,
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
    return finalizeTransformResult(result, nextOptions, authoredWarnings, profile);
  }

  const {
    inputAst,
    babelOptions,
    shouldRunFinalTemplatePass,
    finalTemplatePlugins,
    authoredTemplateAttributeMappings,
    authoredWarnings,
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
  return finalizeTransformResult(result, options, authoredWarnings, profile);
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
    return finalizeTransformResult(result, nextOptions, authoredWarnings, profile);
  }

  const {
    inputAst,
    babelOptions,
    shouldRunFinalTemplatePass,
    finalTemplatePlugins,
    authoredTemplateAttributeMappings,
    authoredWarnings,
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
  return finalizeTransformResult(result, options, authoredWarnings, profile);
}

export default transformLitsx;
