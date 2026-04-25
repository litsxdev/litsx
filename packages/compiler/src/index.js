import babelCore from "@babel/core";
import {
  createLitsxPresetPlugins,
  detectLitsxSourceFeatures,
} from "../../babel-preset-litsx/src/index.js";
import { ensureTypescriptModule } from "../../babel-preset-litsx/src/internal/transform-litsx-properties.js";
import { createLitsxTypecheckSession } from "../../typescript-plugin-litsx/src/typecheck.js";
import {
  createStandaloneTsSession,
  normalizeFilePath,
} from "../../shared/typescript-session/src/index.js";
import {
  patchLitAttributeSourcemap,
} from "../../babel-plugin-transform-jsx-html-template/src/index.js";
import {
  ensureLitsxParserPlugins,
  prepareLitsxAuthoredInput,
} from "./authored-input.js";
export {
  ensureLitsxParserPlugins,
  prepareLitsxAuthoredInput,
} from "./authored-input.js";

const { transformFromAstAsync, transformFromAstSync } = babelCore;
const PROFILE_ENABLED = process.env.LITSX_PROFILE === "1";
const PRESET_PLUGIN_CACHE = new WeakMap();
const DEFAULT_PRESET_PLUGIN_CACHE = new Map();
const STANDALONE_TS_COMPILER_OPTIONS = {
  target: 99,
  module: 99,
  moduleResolution: 100,
  jsx: 1,
  allowJs: true,
  checkJs: false,
  skipLibCheck: true,
  strict: false,
  esModuleInterop: true,
  allowSyntheticDefaultImports: true,
};

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

function getStandaloneTsSessionKey(filename = "") {
  const normalizedFilename = normalizeFilePath(filename);
  const directory = normalizedFilename ? normalizedFilename.slice(0, normalizedFilename.lastIndexOf("/")) || "/" : "/";
  return JSON.stringify({
    directory,
    compilerOptions: STANDALONE_TS_COMPILER_OPTIONS,
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
    presetPluginsByOptions: {
      default: new Map(),
      byOptions: new WeakMap(),
    },
  };
}

function createStandaloneCompilerTsSession(options = {}) {
  return createStandaloneTsSession({
    sessionKey: getStandaloneTsSessionKey(options.filename),
    typescript: options.typescriptModule || ensureTypescriptModule(),
    compilerOptions: STANDALONE_TS_COMPILER_OPTIONS,
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
        if (/\.(jsx|tsx|js|ts)$/.test(file)) {
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

function mergeWarnings(existingWarnings = [], additionalWarnings = []) {
  const merged = [];
  const seen = new Set();

  for (const warning of [...existingWarnings, ...additionalWarnings]) {
    const key = [
      warning?.code ?? "",
      warning?.attributeName ?? "",
      warning?.tagName ?? "",
      warning?.line ?? "",
      warning?.column ?? "",
    ].join(":");

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    merged.push(warning);
  }

  return merged;
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
  const outputPlugins = normalizePluginList(options.outputPlugins);
  const presetPlugins = profilePhase(
    "preset-plugins",
    () => getMemoizedPresetPlugins(memoizationOptions, sourceFeatures, compilationSession),
    profile,
  );

  return {
    filename,
    inputAst,
    authoredWarnings,
    profile,
    babelOptions: {
      filename,
      sourceFileName: filename,
      configFile: false,
      babelrc: false,
      inputSourceMap:
        options.sourceMaps === true ? virtualization?.map ?? undefined : undefined,
      sourceMaps: options.sourceMaps === true,
      plugins: [
        ...presetPlugins,
        ...outputPlugins,
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
  const mergedWarnings = mergeWarnings(metadata.litsxWarnings || [], authoredWarnings);
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
      authoredWarnings,
      profile,
    } = createLitsxTransformConfig(source, nextOptions);
    const result = await profilePhase(
      "babel-transform",
      () => transformFromAstAsync(inputAst, source, {
        ...babelOptions,
        plugins: babelOptions.plugins,
      }),
      profile,
    );
    return finalizeTransformResult(result, nextOptions, authoredWarnings, profile);
  }

  const {
    inputAst,
    babelOptions,
    authoredWarnings,
    profile,
  } = createLitsxTransformConfig(source, options);
  const result = await profilePhase(
    "babel-transform",
    () => transformFromAstAsync(inputAst, source, {
      ...babelOptions,
      plugins: babelOptions.plugins,
    }),
    profile,
  );
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
      authoredWarnings,
      profile,
    } = createLitsxTransformConfig(source, nextOptions);
    const result = profilePhase(
      "babel-transform",
      () => transformFromAstSync(inputAst, source, babelOptions),
      profile,
    );
    return finalizeTransformResult(result, nextOptions, authoredWarnings, profile);
  }

  const {
    inputAst,
    babelOptions,
    authoredWarnings,
    profile,
  } = createLitsxTransformConfig(source, options);
  const result = profilePhase(
    "babel-transform",
    () => transformFromAstSync(inputAst, source, babelOptions),
    profile,
  );
  return finalizeTransformResult(result, options, authoredWarnings, profile);
}

export default transformLitsx;
