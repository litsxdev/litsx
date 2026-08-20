import UnoCSS from "unocss/vite";
import { createGenerator } from "unocss";
import { litsx } from "@litsx/vite-plugin";
import {
  UNO_CSS_PREFLIGHT_EXPORT,
  UNO_CSS_PREFLIGHT_MODULE_ID,
  withUnoCssCompiler,
} from "./index.js";

const RESOLVED_PREFLIGHT_MODULE_ID = `\0${UNO_CSS_PREFLIGHT_MODULE_ID}`;
const PREFLIGHT_BUILD_PLACEHOLDER =
  "__LITSX_UNOCSS_PREFLIGHT_BUILD_PLACEHOLDER__";

function escapeTemplateCss(cssText) {
  return cssText
    .replace(/\\/g, "\\\\")
    .replace(/`/g, "\\`")
    .replace(/\$\{/g, "\\${");
}

function createPreflightModuleSource(cssText) {
  return [
    'import { css } from "@litsx/core";',
    `export const ${UNO_CSS_PREFLIGHT_EXPORT} = css\`${escapeTemplateCss(cssText)}\`;`,
  ].join("\n");
}

function createResolvedPreflightConfig(config, preflights) {
  const {
    configResolved: _configResolved,
    presets: _presets,
    ...resolvedConfig
  } = config;

  return {
    ...resolvedConfig,
    // The resolved config already contains the rules, theme and variants from
    // every preset. Resolving those presets again would duplicate them.
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

function createSharedPreflightState() {
  let preflightGeneratorPromise;

  return {
    captureResolvedConfig(config) {
      const preflights = [...config.preflights];
      preflightGeneratorPromise = createGenerator(
        createResolvedPreflightConfig(config, preflights),
      );
      // The official shadow-dom transform keeps generating module utilities,
      // but the shared virtual module owns all resolved preflight layers.
      config.preflights = [];
    },
    async generate(context) {
      await context.ready;
      await context.flushTasks();
      const generator = await preflightGeneratorPromise;
      if (!generator) {
        return "";
      }
      const result = await generator.generate(new Set(context.tokens), {
        preflights: true,
        safelist: true,
      });
      return result.getLayers(uniquePreflightLayers(generator));
    },
  };
}

function createUnoCssTokenCollector(context) {
  async function extract(code, id) {
    await context.ready;
    if (context.filter(code, id)) {
      await context.extract(code, id);
    }
  }

  return {
    name: "litsx:unocss-token-collector",
    enforce: "pre",
    async transform(code, id) {
      await extract(code, id);
      return null;
    },
    async handleHotUpdate(hotContext) {
      // Collect new tokens directly from the changed authored module. Relying
      // only on the following transform pass leaves the shared preflight stale
      // until Vite happens to evaluate that module again, which is observable
      // in SSR middleware and other lazy module graphs.
      await extract(await hotContext.read(), hotContext.file);
    },
  };
}

function createUnoCssPreflightVitePlugin(context, state) {
  let command = "serve";
  let server;

  function invalidatePreflightModule() {
    if (!server) {
      return;
    }
    const module = server.moduleGraph.getModuleById(
      RESOLVED_PREFLIGHT_MODULE_ID,
    );
    if (!module) {
      return;
    }
    server.moduleGraph.invalidateModule(module);
    server.ws.send({
      type: "update",
      updates: [
        {
          acceptedPath: module.url,
          path: module.url,
          timestamp: Date.now(),
          type: "js-update",
        },
      ],
    });
  }

  context.onInvalidate(invalidatePreflightModule);

  return {
    name: "litsx:unocss-preflight",
    enforce: "pre",
    configResolved(config) {
      command = config.command;
    },
    configureServer(viteServer) {
      server = viteServer;
    },
    resolveId(id) {
      return id === UNO_CSS_PREFLIGHT_MODULE_ID
        ? RESOLVED_PREFLIGHT_MODULE_ID
        : null;
    },
    async load(id) {
      if (id !== RESOLVED_PREFLIGHT_MODULE_ID) {
        return null;
      }
      if (command === "build") {
        return createPreflightModuleSource(PREFLIGHT_BUILD_PLACEHOLDER);
      }
      return createPreflightModuleSource(await state.generate(context));
    },
    async renderChunk(code) {
      if (!code.includes(PREFLIGHT_BUILD_PLACEHOLDER)) {
        return null;
      }
      const css = escapeTemplateCss(await state.generate(context));
      return {
        code: code.replaceAll(PREFLIGHT_BUILD_PLACEHOLDER, css),
        map: null,
      };
    },
  };
}

export function createUnoCssVitePlugins(options = {}) {
  const state = createSharedPreflightState();
  const userConfigResolved = options.configResolved;
  const unoPlugins = UnoCSS({
    ...options,
    configResolved(config) {
      userConfigResolved?.(config);
      state.captureResolvedConfig(config);
    },
    mode: "shadow-dom",
  });
  const normalizedPlugins = Array.isArray(unoPlugins)
    ? unoPlugins
    : [unoPlugins];
  const apiPlugin = normalizedPlugins.find(
    (plugin) => plugin.name === "unocss:api",
  );
  const context = apiPlugin?.api?.getContext?.();
  if (!context) {
    throw new Error("Unable to access the resolved UnoCSS plugin context.");
  }

  return [
    createUnoCssTokenCollector(context),
    createUnoCssPreflightVitePlugin(context, state),
    ...normalizedPlugins,
  ];
}

export function withUnoCssViteCompiler(options = {}, integrationOptions = {}) {
  return withUnoCssCompiler(options, {
    ...integrationOptions,
    preflightModule:
      integrationOptions.preflightModule ?? UNO_CSS_PREFLIGHT_MODULE_ID,
  });
}

/**
 * Compose LitSX and UnoCSS in the order required by shadow-dom mode.
 *
 * LitSX first emits the shared component stylesheet placeholder. UnoCSS then
 * extracts utilities from the generated module and replaces that placeholder.
 */
export function litsxUnoCss(options = {}) {
  const {
    litsx: litsxOptions = {},
    unocss: unoCssOptions = {},
    integration: integrationOptions = {},
  } = options;

  const unoPlugins = createUnoCssVitePlugins(unoCssOptions);
  const compilerOptions = withUnoCssViteCompiler(
    litsxOptions,
    integrationOptions,
  );

  return [litsx(compilerOptions), ...unoPlugins];
}

export default litsxUnoCss;
