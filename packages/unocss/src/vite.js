import UnoCSS from "unocss/vite";
import { litsx } from "@litsx/vite-plugin";
import {
  createUnoCssBuildEngine,
  UNO_CSS_PREFLIGHT_MODULE_ID,
  withUnoCssCompiler,
} from "./index.js";
import { UNO_CSS_PREFLIGHT_BUILD_PLACEHOLDER } from "./protocol.js";

const RESOLVED_PREFLIGHT_MODULE_ID = `\0${UNO_CSS_PREFLIGHT_MODULE_ID}`;
function createUnoCssTokenCollector(engine) {
  return {
    name: "litsx:unocss-token-collector",
    enforce: "pre",
    async transform(code, id) {
      await engine.collect(code, id);
      return null;
    },
    async handleHotUpdate(hotContext) {
      // Collect new tokens directly from the changed authored module. Relying
      // only on the following transform pass leaves the existing preflight
      // snapshots stale until Vite happens to evaluate that module again,
      // which is observable in SSR middleware and other lazy module graphs.
      await engine.collect(await hotContext.read(), hotContext.file);
    },
  };
}

function createUnoCssGuardMaterializer(engine) {
  let server;

  return {
    name: "litsx:unocss-guard-materializer",
    enforce: "pre",
    configureServer(viteServer) {
      server = viteServer;
    },
    async transform(code, id) {
      let result;
      try {
        result = await engine.materializeModule(code, id);
      } catch (error) {
        this.error(error.message);
      }
      if (!result) return null;
      for (const dependency of result.dependencies) {
        this.addWatchFile(dependency);
      }
      return { code: result.code, map: result.map };
    },
    async handleHotUpdate(context) {
      const importers = engine.invalidate(context.file);
      if (importers.length === 0 || !server) return;
      const modules = new Set();
      for (const importer of importers) {
        const importerFile = importer.split("?", 1)[0];
        server.moduleGraph.onFileChange?.(importerFile);
        const byId = server.moduleGraph.getModuleById(importer);
        if (byId) modules.add(byId);
        for (const module of server.moduleGraph.getModulesByFile?.(
          importerFile,
        ) || []) {
          modules.add(module);
        }
      }
      for (const module of modules) {
        server.moduleGraph.invalidateModule(module);
      }
      return [...new Set([...context.modules, ...modules])];
    },
  };
}

function createUnoCssPreflightVitePlugin(context, engine) {
  let command = "serve";
  let server;
  let nextServeModuleId = 0;
  const serveModuleIds = new Map();
  const serveResolvedIds = new Set();

  function resolveServePreflightId(importer) {
    if (!importer) {
      return RESOLVED_PREFLIGHT_MODULE_ID;
    }
    let resolvedId = serveModuleIds.get(importer);
    if (!resolvedId) {
      nextServeModuleId += 1;
      resolvedId = `${RESOLVED_PREFLIGHT_MODULE_ID}?module=${nextServeModuleId}`;
      serveModuleIds.set(importer, resolvedId);
      serveResolvedIds.add(resolvedId);
    }
    return resolvedId;
  }

  function isResolvedPreflightId(id) {
    return id === RESOLVED_PREFLIGHT_MODULE_ID || serveResolvedIds.has(id);
  }

  function invalidatePreflightModule() {
    if (!server) {
      return;
    }
    const modules = [RESOLVED_PREFLIGHT_MODULE_ID, ...serveModuleIds.values()]
      .map((id) => server.moduleGraph.getModuleById(id))
      .filter(Boolean);
    if (modules.length === 0) {
      return;
    }
    const timestamp = Date.now();
    for (const module of modules) {
      server.moduleGraph.invalidateModule(module);
    }
    server.ws.send({
      type: "update",
      updates: modules.map((module) => ({
        acceptedPath: module.url,
        path: module.url,
        timestamp,
        type: "js-update",
      })),
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
    resolveId(id, importer) {
      if (id !== UNO_CSS_PREFLIGHT_MODULE_ID) {
        return null;
      }
      // A build is finalized only after every module has contributed tokens,
      // so one shared virtual module is both correct and compact. During
      // serve, an ESM module that was evaluated early cannot observe a later
      // replacement CSSResult. Resolve one preflight instance per importing
      // component module so its load happens after that module's extraction.
      return command === "build"
        ? RESOLVED_PREFLIGHT_MODULE_ID
        : resolveServePreflightId(importer);
    },
    async load(id) {
      if (!isResolvedPreflightId(id)) {
        return null;
      }
      if (command === "build") {
        return engine.createPreflightModuleSource(
          UNO_CSS_PREFLIGHT_BUILD_PLACEHOLDER,
        );
      }
      return engine.createPreflightModuleSource(
        await engine.generatePreflight(),
      );
    },
    async renderChunk(code) {
      if (!code.includes(UNO_CSS_PREFLIGHT_BUILD_PLACEHOLDER)) {
        return null;
      }
      return {
        code: await engine.finalizePreflight(code),
        map: null,
      };
    },
  };
}

export function createUnoCssVitePlugins(options = {}) {
  let engine;
  const userConfigResolved = options.configResolved;
  const unoPlugins = UnoCSS({
    ...options,
    configResolved(config) {
      userConfigResolved?.(config);
      engine.captureResolvedConfig(config);
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

  engine = createUnoCssBuildEngine({
    generator: () => context.uno,
    tokens: () => context.tokens,
    ready: () => context.ready,
    flushTasks: () => context.flushTasks(),
    filter: (code, id) => context.filter(code, id),
    extract: (code, id) => context.extract(code, id),
  });
  const contextPlugins = normalizedPlugins.filter(
    (plugin) => plugin.name !== "unocss:shadow-dom",
  );

  return [
    createUnoCssTokenCollector(engine),
    createUnoCssGuardMaterializer(engine),
    createUnoCssPreflightVitePlugin(context, engine),
    ...contextPlugins,
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
 * Compose LitSX and the UnoCSS Vite context in the required extraction order.
 *
 * LitSX first emits the shared component stylesheet placeholder. The neutral
 * engine then extracts utilities through UnoCSS and replaces that placeholder.
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
