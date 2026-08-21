import fs from "node:fs";
import path from "node:path";
import { createGenerator } from "unocss";
import {
  createUnoCssPreflightModuleSource,
  decodeUnoCssGuardPayload,
  escapeUnoCssTemplateCss,
  UNO_CSS_GUARD_PATTERN,
  UNO_CSS_PLACEHOLDER,
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

async function resolveValue(value) {
  return typeof value === "function" ? value() : value;
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
  const tokenStore = () =>
    (typeof options.tokens === "function" ? options.tokens() : options.tokens) ??
    ownedTokens;
  const dependencyImporters = new Map();
  const importerDependencies = new Map();
  const moduleTokens = new Map();

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
      if (!importers) dependencyImporters.set(dependency, (importers = new Set()));
      importers.add(id);
    }
  }

  function isIncluded(code, id) {
    return !(
      typeof options.filter === "function" &&
      !options.filter(code, id)
    );
  }

  async function collect(code, id = "") {
    await ready();
    if (!isIncluded(code, id)) return tokenStore();
    if (typeof options.extract === "function") {
      await options.extract(code, id, tokenStore());
      return tokenStore();
    }
    const uno = await generator();
    await uno.applyExtractors(code, id, tokenStore());
    return tokenStore();
  }

  async function scan(code, id = "") {
    await ready();
    if (!isIncluded(code, id)) return new Set();
    const uno = await generator();
    const extracted = await uno.applyExtractors(code, id, new Set());
    moduleTokens.set(id, new Set(extracted));
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
    const hasPlaceholder = code.includes(UNO_CSS_PLACEHOLDER);
    if (matches.length === 0 && !hasPlaceholder) {
      forgetModule(id);
      return null;
    }

    const uno = await generator();
    const extracted = await scan(code, id);
    const dependencies = new Set();
    const resolvedGuards = new Map();
    const generatedCss = new Map();
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

      await scan(
        candidates.join(" "),
        `${id}?litsx-unocss-guard=${match.index}`,
      );
      const candidateSet = new Set(candidates);
      const candidatesKey = [...candidateSet].sort().join("\0");
      let cssText = generatedCss.get(candidatesKey);
      if (cssText === undefined) {
        const generated = await uno.generate(candidateSet, {
          preflights: false,
          safelist: false,
        });
        cssText = generated.css;
        generatedCss.set(candidatesKey, cssText);
      }
      transformed = transformed.replace(
        match[0],
        escapeUnoCssTemplateCss(cssText),
      );
    }

    if (hasPlaceholder) {
      const candidates = moduleTokens.get(id) || extracted;
      const generated = await uno.generate(new Set(candidates), {
        preflights: false,
        safelist: true,
      });
      transformed = transformed.replace(
        UNO_CSS_PLACEHOLDER,
        escapeUnoCssTemplateCss(generated.css),
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
    preflightGeneratorSource = createGenerator(
      createResolvedPreflightConfig(config, preflights),
    );
    if (detachPreflights) config.preflights = [];
  }

  async function generatePreflight() {
    await ready();
    const preflightGenerator = await resolveValue(preflightGeneratorSource);
    if (!preflightGenerator) return "";
    const result = await preflightGenerator.generate(new Set(tokenStore()), {
      preflights: true,
      safelist: true,
    });
    return result.getLayers(uniquePreflightLayers(preflightGenerator));
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
    collect,
    scan,
    materializeModule,
    captureResolvedConfig,
    generatePreflight,
    createPreflightModuleSource: createUnoCssPreflightModuleSource,
    finalizePreflight(code, placeholder = UNO_CSS_PREFLIGHT_BUILD_PLACEHOLDER) {
      return generatePreflight().then((css) =>
        code.replaceAll(placeholder, escapeUnoCssTemplateCss(css)),
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
export async function createUnoCssIntegration(config = {}) {
  const generator = await createGenerator(config);
  return createUnoCssBuildEngine({ generator });
}
