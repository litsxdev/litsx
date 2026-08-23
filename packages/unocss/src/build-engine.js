import fs from "node:fs";
import path from "node:path";
import { createGenerator } from "unocss";
import {
  createUnoCssPreflightModuleSource,
  decodeUnoCssGuardPayload,
  escapeUnoCssTemplateCss,
  UNO_CSS_GUARD_PATTERN,
  UNO_CSS_DYNAMIC_WILDCARD,
  UNO_CSS_PREFLIGHT_BUILD_PLACEHOLDER,
} from "./protocol.js";
import { resolveStaticGuardExport } from "./static-guards.js";

function normalizeDependency(file) {
  try {
    return fs.realpathSync(file);
  } catch {
    return path.resolve(file);
  }
}

function createResolvedPreflightConfig(config, preflights) {
  const {
    configResolved: _configResolved,
    presets: _presets,
    ...resolvedConfig
  } = config;
  return {
    ...resolvedConfig,
    // A resolved config already contains the rules, variants and theme from
    // its presets. Resolving the presets again would duplicate them.
    presets: [],
    preflights,
  };
}

function uniquePreflightLayers(generator) {
  return [
    ...new Set(
      generator.config.preflights.map(
        (preflight) => preflight.layer || "preflights",
      ),
    ),
  ];
}

function defaultPreflightLayerSelector({ destination, layer }) {
  return destination === "global" || layer !== "theme";
}

function resolvePreflightLayerSelector(options, destination) {
  return (
    options.preflightLayers?.[destination] ?? defaultPreflightLayerSelector
  );
}

function includesPreflightLayer(selector, layer, destination, layers) {
  if (Array.isArray(selector)) return selector.includes(layer);
  return selector({ layer, destination, layers });
}

async function resolveValue(value) {
  return typeof value === "function" ? value() : value;
}

function dynamicPatternMatcher(pattern) {
  const source = pattern
    .split(UNO_CSS_DYNAMIC_WILDCARD)
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"))
    .join("[^\\s]*");
  return new RegExp(`^${source}$`, "u");
}

function resolveConfiguredSafelist(generator) {
  const context = { generator, theme: generator.config.theme };
  return generator.config.safelist
    .flatMap((entry) => (typeof entry === "function" ? entry(context) : entry))
    .map((entry) => entry.trim())
    .filter(Boolean);
}

/**
 * Build-tool-neutral UnoCSS state machine.
 *
 * Adapters provide a resolved generator and optionally their own extraction,
 * readiness and token-store primitives. The engine owns LitSX guard
 * materialization, dependency tracking and preflight generation.
 */
export function createUnoCssBuildEngine(options = {}) {
  let generatorSource = options.generator;
  let preflightGeneratorSource =
    options.preflightGenerator ?? options.generator;
  const ownedTokens = new Set();
  const ownedGlobalTokens = new Set();
  const tokenStore = () =>
    (typeof options.tokens === "function"
      ? options.tokens()
      : options.tokens) ?? ownedTokens;
  const globalTokenStore = () =>
    (typeof options.globalTokens === "function"
      ? options.globalTokens()
      : options.globalTokens) ?? ownedGlobalTokens;
  const dependencyImporters = new Map();
  const importerDependencies = new Map();

  async function ready() {
    await resolveValue(options.ready);
    if (typeof options.flushTasks === "function") {
      await options.flushTasks();
    }
  }

  async function generator() {
    await ready();
    const resolved = await resolveValue(generatorSource);
    if (!resolved || typeof resolved.generate !== "function") {
      throw new Error(
        "@litsx/unocss requires a resolved UnoCSS generator before transforming modules.",
      );
    }
    return resolved;
  }

  function forgetModule(id) {
    for (const dependency of importerDependencies.get(id) || []) {
      const importers = dependencyImporters.get(dependency);
      importers?.delete(id);
      if (importers?.size === 0) dependencyImporters.delete(dependency);
    }
    importerDependencies.delete(id);
  }

  function trackModule(id, dependencies) {
    forgetModule(id);
    const normalized = new Set(
      [...dependencies].map((dependency) => normalizeDependency(dependency)),
    );
    importerDependencies.set(id, normalized);
    for (const dependency of normalized) {
      let importers = dependencyImporters.get(dependency);
      if (!importers)
        dependencyImporters.set(dependency, (importers = new Set()));
      importers.add(id);
    }
  }

  function isIncluded(code, id) {
    return !(typeof options.filter === "function" && !options.filter(code, id));
  }

  async function collect(code, id = "") {
    await ready();
    if (!isIncluded(code, id)) return tokenStore();
    const uno = await generator();
    const extracted = await uno.applyExtractors(code, id, new Set());
    for (const token of extracted) globalTokenStore().add(token);
    if (typeof options.extract === "function") {
      await options.extract(code, id, tokenStore());
      return tokenStore();
    }
    for (const token of extracted) tokenStore().add(token);
    return tokenStore();
  }

  async function scan(code, id = "", { global = true } = {}) {
    await ready();
    if (!isIncluded(code, id)) return new Set();
    const uno = await generator();
    const extracted = await uno.applyExtractors(code, id, new Set());
    if (global) {
      for (const token of extracted) globalTokenStore().add(token);
    }
    if (typeof options.extract === "function") {
      await options.extract(code, id, tokenStore());
      return new Set(extracted);
    }
    const tokens = tokenStore();
    for (const token of extracted) tokens.add(token);
    return new Set(extracted);
  }

  async function materializeModule(code, id) {
    const pattern = new RegExp(UNO_CSS_GUARD_PATTERN.source, "g");
    const matches = [...code.matchAll(pattern)];
    if (matches.length === 0) {
      forgetModule(id);
      return null;
    }

    const uno = await generator();
    const dependencies = new Set();
    const resolvedGuards = new Map();
    const generatedCss = new Map();
    const emittedCandidates = new Map();
    let configuredSafelist;
    let transformed = code;

    for (const match of matches) {
      const payload = decodeUnoCssGuardPayload(match[1]);
      let candidates = payload.candidates || [];
      for (const dependency of payload.dependencies || []) {
        dependencies.add(dependency);
      }

      if (payload.descriptor) {
        const descriptorKey = JSON.stringify(payload.descriptor);
        let resolved = resolvedGuards.get(descriptorKey);
        if (!resolved) {
          try {
            resolved = resolveStaticGuardExport(payload.descriptor);
          } catch (error) {
            throw new Error(
              `@litsx/unocss could not refresh guard ${payload.descriptor.exportName ?? payload.descriptor.localName} ` +
                `from ${payload.descriptor.file}: ${error.message}`,
              { cause: error },
            );
          }
          resolvedGuards.set(descriptorKey, resolved);
        }
        candidates = resolved.candidates;
        dependencies.add(payload.descriptor.file);
        for (const dependency of resolved.dependencies || []) {
          dependencies.add(dependency);
        }
      }

      if (payload.dynamicPatterns?.length > 0) {
        configuredSafelist ??= resolveConfiguredSafelist(uno);
        const matchers = payload.dynamicPatterns.map(dynamicPatternMatcher);
        candidates = [
          ...candidates,
          ...configuredSafelist.filter((candidate) =>
            matchers.some((matcher) => matcher.test(candidate)),
          ),
        ];
      }

      if (payload.emit === "none") {
        transformed = transformed.replace(match[0], "");
        continue;
      }
      await scan(
        candidates.join(" "),
        `${id}?litsx-unocss-guard=${match.index}`,
        { global: payload.emit === "global" },
      );
      if (payload.emit === "global") {
        transformed = transformed.replace(match[0], "");
        continue;
      }
      const candidateSet = new Set(candidates);
      if (payload.owner) {
        let emitted = emittedCandidates.get(payload.owner);
        if (!emitted)
          emittedCandidates.set(payload.owner, (emitted = new Set()));
        for (const candidate of emitted) candidateSet.delete(candidate);
        for (const candidate of candidateSet) emitted.add(candidate);
      }
      const candidatesKey = JSON.stringify([
        payload.scope || "",
        [...candidateSet].sort(),
      ]);
      let cssText = generatedCss.get(candidatesKey);
      if (cssText === undefined) {
        const generated = await uno.generate(candidateSet, {
          preflights: false,
          safelist: false,
        });
        cssText = payload.scope
          ? `@scope (${payload.scope}) to ([data-litsx-style-scope]) {\n${generated.css}\n}`
          : generated.css;
        generatedCss.set(candidatesKey, cssText);
      }
      transformed = transformed.replace(
        match[0],
        escapeUnoCssTemplateCss(cssText),
      );
    }

    trackModule(id, dependencies);
    return {
      code: transformed,
      map: null,
      dependencies: [...dependencies],
    };
  }

  function captureResolvedConfig(config, { detachPreflights = true } = {}) {
    const preflights = [...(config.preflights || [])];
    if (detachPreflights) {
      preflightGeneratorSource = createGenerator(
        createResolvedPreflightConfig(config, preflights),
      );
      config.preflights = [];
    } else {
      // Vite's resolved context already owns the complete configuration. Keep
      // one generator/token lifecycle and expose destination-filtered views of
      // its GenerateResult instead of resolving the presets a second time.
      preflightGeneratorSource = generatorSource;
    }
  }

  async function generatePreflight() {
    return generatePreflightFor("component");
  }

  function routeGeneratedResult(result, destination, source) {
    const preflightLayers = uniquePreflightLayers(source);
    const selector = resolvePreflightLayerSelector(options, destination);
    const excluded = preflightLayers.filter(
      (layer) =>
        !includesPreflightLayer(selector, layer, destination, preflightLayers),
    );
    const excludedSet = new Set(excluded);
    return {
      ...result,
      layers: result.layers.filter((layer) => !excludedSet.has(layer)),
      get css() {
        return result.getLayers(undefined, excluded);
      },
      getLayer(layer) {
        return excludedSet.has(layer) ? "" : result.getLayer(layer);
      },
      getLayers(includes, excludes = []) {
        return result.getLayers(includes, [
          ...new Set([...excludes, ...excluded]),
        ]);
      },
      setLayer: result.setLayer.bind(result),
    };
  }

  async function generatePreflightFor(destination) {
    await ready();
    const preflightGenerator = await resolveValue(preflightGeneratorSource);
    if (!preflightGenerator) return "";
    const result = await preflightGenerator.generate(new Set(tokenStore()), {
      preflights: true,
      safelist: true,
    });
    const routed = routeGeneratedResult(
      result,
      destination,
      preflightGenerator,
    );
    return routed.getLayers(uniquePreflightLayers(preflightGenerator));
  }

  async function generateGlobalCss() {
    const uno = await generator();
    const globalGenerated = await uno.generate(new Set(globalTokenStore()), {
      preflights: false,
      safelist: true,
    });
    const preflight = await generatePreflightFor("global");
    return [preflight, globalGenerated.css].filter(Boolean).join("\n");
  }

  function getImporters(file) {
    return [
      ...(dependencyImporters.get(normalizeDependency(file)) || new Set()),
    ];
  }

  return {
    get tokens() {
      return tokenStore();
    },
    get globalTokens() {
      return globalTokenStore();
    },
    collect,
    scan,
    materializeModule,
    captureResolvedConfig,
    generatePreflight,
    generatePreflightFor,
    generateGlobalCss,
    routeGeneratedResult(result, destination = "component") {
      return generator().then((uno) =>
        routeGeneratedResult(result, destination, uno),
      );
    },
    createPreflightModuleSource: createUnoCssPreflightModuleSource,
    finalizePreflight(code, placeholder = UNO_CSS_PREFLIGHT_BUILD_PLACEHOLDER) {
      return generatePreflight().then((css) =>
        code.replaceAll(placeholder, escapeUnoCssTemplateCss(css)),
      );
    },
    finalizeGlobalCss(
      code,
      placeholder = "__LITSX_UNOCSS_GLOBAL_CSS_PLACEHOLDER__",
    ) {
      return generateGlobalCss().then((css) =>
        code.replaceAll(placeholder, css),
      );
    },
    getImporters,
    invalidate: getImporters,
    forgetModule,
    setGenerator(value) {
      generatorSource = value;
    },
    setPreflightGenerator(value) {
      preflightGeneratorSource = value;
    },
  };
}

/** Create a standalone engine for Rollup, webpack, esbuild or custom builds. */
export async function createUnoCssIntegration(
  config = {},
  integrationOptions = {},
) {
  const generator = await createGenerator(config);
  return createUnoCssBuildEngine({ generator, ...integrationOptions });
}
