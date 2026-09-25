import path from "node:path";
import { createTailwindBuildEngine } from "./build-engine.js";
import { withTailwindCompiler } from "./compiler.js";
import { createTailwindContext } from "./context.js";
import {
  TAILWIND_COMPONENT_MODULE_PREFIX,
  TAILWIND_INFRASTRUCTURE_MODULE_ID,
  TAILWIND_PREFLIGHT_MODULE_ID,
} from "./protocol.js";

const COMPONENT_IMPORT_PATTERN = new RegExp(
  `${TAILWIND_COMPONENT_MODULE_PREFIX.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^"'?]+)\\.css(?:\\?inline)?`,
  "g",
);

function moduleSource(css) {
  return `export default ${JSON.stringify(css)};\n`;
}

function componentKey(specifier) {
  if (!specifier.startsWith(TAILWIND_COMPONENT_MODULE_PREFIX)) return null;
  const pathname = specifier.split("?", 1)[0];
  const basename = pathname.slice(TAILWIND_COMPONENT_MODULE_PREFIX.length);
  return basename.endsWith(".css") ? basename.slice(0, -4) : null;
}

function normalizedDependencies(root, dependencies) {
  return [
    ...new Set(
      dependencies.map((dependency) =>
        path.isAbsolute(dependency)
          ? path.normalize(dependency)
          : path.resolve(root, dependency),
      ),
    ),
  ].sort();
}

/**
 * Create one build-tool-neutral LitSX integration descriptor.
 *
 * The host creates a fresh instance for every server, build, or standalone
 * runtime. The instance owns all candidate state and Tailwind compilation.
 */
export function litsxTailwind(options = {}) {
  const integrationOptions = options.integration ?? {};
  const preflightOutputId = options.preflightOutput ?? "preflight.js";
  const globalCssOutputId = options.globalCssOutput ?? "global.css";
  const preflightSpecifier = TAILWIND_PREFLIGHT_MODULE_ID;

  return Object.freeze({
    name: "tailwind",
    async create(hostContext) {
      let disposed = false;
      const context = createTailwindContext(integrationOptions);
      context.configure({ root: hostContext.projectRoot });
      const engine = createTailwindBuildEngine(context);

      function assertActive() {
        if (disposed) {
          throw new Error(
            "This @litsx/tailwind integration instance has been disposed.",
          );
        }
      }

      function declaredDependencies(payloads = []) {
        return normalizedDependencies(hostContext.projectRoot, [
          ...(path.isAbsolute(context.entry) ? [context.entry] : []),
          ...payloads.flatMap((payload) => payload?.dependencies ?? []),
        ]);
      }

      return {
        compiler: withTailwindCompiler(
          { reactCompat: false },
          context,
          { ...integrationOptions, inlineQuery: "" },
        ),
        async resolveModule({ specifier }) {
          assertActive();
          if (specifier === preflightSpecifier) {
            const result = await engine.generatePreflight();
            return {
              code: moduleSource(result.css),
              dependencies: result.dependencies,
            };
          }
          if (specifier === TAILWIND_INFRASTRUCTURE_MODULE_ID) {
            return {
              code: "export {};\n",
              dependencies: declaredDependencies(),
            };
          }
          const key = componentKey(specifier);
          if (!key) return null;
          const payload = context.get(key);
          if (!payload) {
            throw new Error(`Missing Tailwind component metadata for ${key}.`);
          }
          const result = await engine.generateComponent(payload);
          return {
            code: moduleSource(result.css),
            dependencies: result.dependencies,
          };
        },
        async processModule({ result, sourcePath }) {
          assertActive();
          const keys = [];
          for (const match of result.code.matchAll(COMPONENT_IMPORT_PATTERN)) {
            keys.push(match[1]);
          }
          context.retain(sourcePath, keys);
          const payloads = keys.map((key) => context.get(key)).filter(Boolean);
          return { dependencies: declaredDependencies(payloads) };
        },
        async finalize() {
          assertActive();
          const [preflight, global] = await Promise.all([
            engine.generatePreflight(),
            engine.generateGlobal(),
          ]);
          const dependencies = normalizedDependencies(hostContext.projectRoot, [
            ...preflight.dependencies,
            ...global.dependencies,
            ...declaredDependencies(
              context.entries().map(([, payload]) => payload),
            ),
          ]);
          return {
            dependencies,
            outputs: [
              {
                id: preflightOutputId,
                kind: "module",
                content: moduleSource(preflight.css),
                specifier: preflightSpecifier,
              },
              {
                id: globalCssOutputId,
                kind: "style",
                content: global.css,
                document: true,
              },
            ],
          };
        },
        async invalidate() {
          assertActive();
          engine.invalidate();
        },
        forget({ moduleId }) {
          assertActive();
          context.forget(moduleId);
        },
        dispose() {
          if (disposed) return;
          disposed = true;
          context.clear();
          engine.dispose();
        },
      };
    },
  });
}

export {
  createTailwindAuthoringPlugin,
  createTailwindOutputPlugin,
  withTailwindCompiler,
} from "./compiler.js";
export { createTailwindContext } from "./context.js";
export { createTailwindBuildEngine } from "./build-engine.js";
export {
  TAILWIND_COMPONENT_MODULE_PREFIX,
  TAILWIND_INFRASTRUCTURE_MODULE_ID,
  TAILWIND_PREFLIGHT_MODULE_ID,
} from "./protocol.js";

export default litsxTailwind;
