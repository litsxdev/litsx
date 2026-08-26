import tailwindcss from "@tailwindcss/vite";
import { litsx } from "@litsx/vite-plugin";
import postcss from "postcss";
import { createTailwindContext } from "./context.js";
import { withTailwindCompiler } from "./compiler.js";
import {
  TAILWIND_COMPONENT_MODULE_PREFIX,
  TAILWIND_INFRASTRUCTURE_MODULE_ID,
  TAILWIND_PREFLIGHT_MODULE_ID,
} from "./protocol.js";

const RESOLVED_PREFIX = "\0@litsx/tailwind/";

function cssString(value) {
  return String(value).replaceAll("\\", "\\\\").replaceAll('"', '\\"');
}

function referenceDirective(entry) {
  return `@reference "${cssString(entry)}";`;
}

function importDirective(entry) {
  return entry === "tailwindcss"
    ? '@import "tailwindcss" source(none);'
    : `@import "${cssString(entry)}";`;
}

function inlineSources(candidates) {
  return candidates
    .map((candidate) => `@source inline("${cssString(candidate)}");`)
    .join("\n");
}

function componentCss(context, payload) {
  const utilities = "@tailwind utilities source(none);";
  return [
    referenceDirective(context.entry),
    utilities,
    inlineSources(payload.candidates),
  ].join("\n");
}

function infrastructureCss(context) {
  return [
    importDirective(context.entry),
    referenceDirective(context.entry),
    "#litsx-tailwind-infrastructure {",
    "  @tailwind utilities source(none);",
    "}",
    ...context.sources.map((source) => `@source "${cssString(source)}";`),
  ].join("\n");
}

function resolveVirtualId(id) {
  const queryIndex = id.indexOf("?");
  const pathname = queryIndex === -1 ? id : id.slice(0, queryIndex);
  const query = queryIndex === -1 ? "" : id.slice(queryIndex);
  if (
    pathname === TAILWIND_INFRASTRUCTURE_MODULE_ID ||
    pathname === TAILWIND_PREFLIGHT_MODULE_ID ||
    pathname.startsWith(TAILWIND_COMPONENT_MODULE_PREFIX)
  ) {
    return `${RESOLVED_PREFIX}${pathname.slice("virtual:@litsx/tailwind/".length)}${query}`;
  }
  return null;
}

function componentKey(id) {
  if (!id.startsWith(`${RESOLVED_PREFIX}component/`)) return null;
  const basename = id.slice(`${RESOLVED_PREFIX}component/`.length).split("?", 1)[0];
  return basename.endsWith(".css") ? basename.slice(0, -4) : null;
}

export function createTailwindVirtualPlugin(context) {
  let server;
  context.onChange((key) => {
    if (!server) return;
    const prefix = `${RESOLVED_PREFIX}component/${key}.css`;
    const modules = [...server.moduleGraph.idToModuleMap.values()].filter(
      (module) => module.id?.startsWith(prefix),
    );
    const timestamp = Date.now();
    for (const module of modules) server.moduleGraph.invalidateModule(module);
    if (modules.length > 0) {
      server.ws.send({
        type: "update",
        updates: modules.map((module) => ({
          acceptedPath: module.url,
          path: module.url,
          timestamp,
          type: module.id.includes("?inline") ? "js-update" : "css-update",
        })),
      });
    }
  });
  return {
    name: "litsx:tailwind-virtual-css",
    enforce: "pre",
    configResolved(config) {
      context.configure(config);
    },
    configureServer(viteServer) {
      server = viteServer;
    },
    resolveId(id) {
      return resolveVirtualId(id);
    },
    load(id) {
      if (id.startsWith(`${RESOLVED_PREFIX}preflight.css`)) {
        return importDirective(context.entry);
      }
      if (id.startsWith(`${RESOLVED_PREFIX}infrastructure.css`)) {
        return infrastructureCss(context);
      }
      const key = componentKey(id);
      if (!key) return null;
      const payload = context.get(key);
      if (!payload) this.error(`Missing Tailwind component metadata for ${key}.`);
      for (const dependency of payload.dependencies ?? []) this.addWatchFile(dependency);
      return componentCss(context, payload);
    },
  };
}

export function createTailwindPropertyCleanupPlugin() {
  return {
    name: "litsx:tailwind-component-property-cleanup",
    enforce: "pre",
    async transform(code, id) {
      const key = componentKey(id);
      if (!key) {
        return null;
      }
      if (!code.includes("@property")) return null;

      const root = postcss.parse(code, { from: id });
      root.walkAtRules((rule) => {
        if (rule.name === "property" || (rule.name === "layer" && rule.params.trim() === "properties")) {
          rule.remove();
        }
      });
      return { code: root.toString(), map: null };
    },
  };
}

export function withTailwindViteCompiler(options = {}, integration = {}, context) {
  const resolvedContext = context ?? createTailwindContext(integration);
  return withTailwindCompiler(options, resolvedContext, integration);
}

export function litsxTailwind(options = {}) {
  const litsxOptions = options.litsx ?? {};
  const tailwindOptions = options.tailwind ?? {};
  const integration = options.integration ?? {};
  const context = createTailwindContext(integration);
  const officialPlugins = tailwindcss(tailwindOptions);
  return [
    litsx(withTailwindCompiler(litsxOptions, context, integration)),
    createTailwindVirtualPlugin(context),
    ...(Array.isArray(officialPlugins) ? officialPlugins : [officialPlugins]),
    createTailwindPropertyCleanupPlugin(),
  ];
}

export default litsxTailwind;
