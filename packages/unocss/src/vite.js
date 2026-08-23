import UnoCSS, {
  GlobalModeBuildPlugin,
  GlobalModeDevPlugin,
} from "unocss/vite";
import { litsx } from "@litsx/vite-plugin";
import {
  createUnoCssBuildEngine,
  UNO_CSS_PREFLIGHT_MODULE_ID,
  withUnoCssCompiler,
} from "./index.js";
import {
  UNO_CSS_COMPONENT_MODULE_MARKER,
  UNO_CSS_GLOBAL_BUILD_PLACEHOLDER,
  UNO_CSS_PREFLIGHT_BUILD_PLACEHOLDER,
} from "./protocol.js";

const RESOLVED_PREFLIGHT_MODULE_ID = `\0${UNO_CSS_PREFLIGHT_MODULE_ID}`;
const GLOBAL_CSS_MODULE_ID = "virtual:uno.css";
const RESOLVED_GLOBAL_CSS_MODULE_ID = "/__litsx_unocss_global.css";
const GLOBAL_CSS_BUILD_SENTINEL = `:root{--${UNO_CSS_GLOBAL_BUILD_PLACEHOLDER}:0}`;
const isCompiledComponentModule = (code) =>
  code.includes(UNO_CSS_COMPONENT_MODULE_MARKER);

function createUnoCssTokenCollector(engine) {
  return {
    name: "litsx:unocss-token-collector",
    enforce: "pre",
    async transform(code, id) {
      // Component modules are collected precisely by their per-component
      // markup/style guard markers in the following materializer. Scanning the
      // whole compiled module here would leak unrelated strings and sibling
      // component utilities into the global token set.
      if (isCompiledComponentModule(code)) return null;
      await engine.collect(code, id);
      return null;
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

function createUnoCssGlobalVitePlugin(context, engine) {
  let command = "serve";
  let server;

  function invalidateGlobalModule() {
    const module = server?.moduleGraph.getModuleById(
      RESOLVED_GLOBAL_CSS_MODULE_ID,
    );
    if (!module || !server) return;
    server.moduleGraph.invalidateModule(module);
    const timestamp = Date.now();
    server.ws.send({
      type: "update",
      updates: [
        {
          acceptedPath: module.url,
          path: module.url,
          timestamp,
          type: "js-update",
        },
      ],
    });
  }

  context.onInvalidate(invalidateGlobalModule);

  return {
    name: "litsx:unocss-global",
    enforce: "pre",
    configResolved(config) {
      command = config.command;
    },
    configureServer(viteServer) {
      server = viteServer;
    },
    resolveId(id) {
      return id === GLOBAL_CSS_MODULE_ID ? RESOLVED_GLOBAL_CSS_MODULE_ID : null;
    },
    async load(id) {
      if (id !== RESOLVED_GLOBAL_CSS_MODULE_ID) return null;
      return {
        code:
          command === "build"
            ? GLOBAL_CSS_BUILD_SENTINEL
            : await engine.generateGlobalCss(),
        map: null,
        moduleSideEffects: true,
      };
    },
    generateBundle: {
      order: "post",
      async handler(_options, bundle) {
        const css = await engine.generateGlobalCss();
        for (const output of Object.values(bundle)) {
          if (
            output.type !== "asset" ||
            typeof output.source !== "string" ||
            !output.source.includes(UNO_CSS_GLOBAL_BUILD_PLACEHOLDER)
          ) {
            continue;
          }
          output.source = output.source.replaceAll(
            GLOBAL_CSS_BUILD_SENTINEL,
            css,
          );
        }
      },
    },
  };
}

export function createUnoCssVitePlugins(options = {}, integrationOptions = {}) {
  let engine;
  const userConfigResolved = options.configResolved;
  const unoPlugins = UnoCSS({
    ...options,
    configResolved(config) {
      userConfigResolved?.(config);
      engine.captureResolvedConfig(config, { detachPreflights: false });
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
    preflightLayers: integrationOptions.preflightLayers,
  });
  const contextPlugins = normalizedPlugins.filter(
    (plugin) => plugin.name !== "unocss:shadow-dom",
  );
  const globalGenerator = new Proxy(
    {},
    {
      get(_target, property) {
        const target = context.uno;
        if (property === "generate") {
          return async (...args) =>
            engine.routeGeneratedResult(
              await target.generate(...args),
              "global",
            );
        }
        const value = Reflect.get(target, property, target);
        return typeof value === "function" ? value.bind(target) : value;
      },
    },
  );
  const globalContext = Object.create(context);
  Object.defineProperty(globalContext, "uno", { value: globalGenerator });
  const globalPlugins = [
    ...GlobalModeBuildPlugin(globalContext),
    ...GlobalModeDevPlugin(globalContext),
  ].map((plugin) => {
    if (
      !["unocss:global:build:scan", "unocss:global"].includes(plugin.name) ||
      typeof plugin.transform !== "function"
    ) {
      return plugin;
    }
    const transform = plugin.transform;
    return {
      ...plugin,
      transform(code, id) {
        if (isCompiledComponentModule(code)) return null;
        return transform.call(this, code, id);
      },
    };
  });

  return [
    createUnoCssTokenCollector(engine),
    createUnoCssGuardMaterializer(engine),
    createUnoCssPreflightVitePlugin(context, engine),
    createUnoCssGlobalVitePlugin(context, engine),
    ...contextPlugins,
    ...globalPlugins,
  ];
}

export function withUnoCssViteCompiler(options = {}, integrationOptions = {}) {
  return withUnoCssCompiler(options, {
    ...integrationOptions,
    globalCssModule: integrationOptions.globalCssModule ?? GLOBAL_CSS_MODULE_ID,
    preflightModule:
      integrationOptions.preflightModule ?? UNO_CSS_PREFLIGHT_MODULE_ID,
  });
}

/**
 * Compose LitSX and the UnoCSS Vite context in the required extraction order.
 *
 * LitSX first emits component-owned markup/style markers. The neutral engine
 * then materializes each marker through the resolved UnoCSS context.
 */
export function litsxUnoCss(options = {}) {
  const {
    litsx: litsxOptions = {},
    unocss: unoCssOptions = {},
    integration: integrationOptions = {},
  } = options;

  const unoPlugins = createUnoCssVitePlugins(unoCssOptions, integrationOptions);
  const compilerOptions = withUnoCssViteCompiler(
    litsxOptions,
    integrationOptions,
  );

  return [litsx(compilerOptions), ...unoPlugins];
}

export default litsxUnoCss;
