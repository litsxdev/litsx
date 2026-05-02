import fs from "fs/promises";
import { createLitsxCompilationSession } from "@litsx/compiler";

function shouldTransform(id, include) {
  if (typeof include === "function") {
    return include(id);
  }

  if (include instanceof RegExp) {
    return include.test(id);
  }

  return /\.(jsx|tsx|litsx)$/.test(id) || id.endsWith(".litsx.jsx");
}

function formatWarningLocation(warning) {
  if (
    typeof warning?.line === "number" &&
    typeof warning?.column === "number"
  ) {
    return `${warning.line}:${warning.column}`;
  }

  if (typeof warning?.line === "number") {
    return `${warning.line}`;
  }

  return null;
}

function formatLitsxWarning(id, warning) {
  const parts = [];

  if (warning?.code) {
    parts.push(`[${warning.code}]`);
  } else {
    parts.push("[LITSX_WARNING]");
  }

  const location = formatWarningLocation(warning);
  if (location) {
    parts.push(`${id}:${location}`);
  } else {
    parts.push(id);
  }

  parts.push(warning?.message || "LitSX emitted a warning during compilation.");

  return parts.join(" ");
}

function createCodeFrame(source, line, column) {
  if (typeof source !== "string" || typeof line !== "number" || typeof column !== "number") {
    return null;
  }

  const lines = source.split("\n");
  const lineIndex = line - 1;
  const content = lines[lineIndex];

  if (typeof content !== "string") {
    return null;
  }

  const lineNumber = String(line);
  const gutter = `${lineNumber} | `;
  const pointer = `${" ".repeat(gutter.length + Math.max(column, 0))}^`;

  return `${gutter}${content}\n${pointer}`;
}

function createLitsxPluginError(error, id, source) {
  const line = typeof error?.loc?.line === "number" ? error.loc.line : undefined;
  const column = typeof error?.loc?.column === "number" ? error.loc.column : undefined;
  const frame = createCodeFrame(source, line, column);
  const message = `LitSX compilation failed in ${id}: ${error?.message || "Unknown compiler error."}`;

  return {
    message,
    id,
    plugin: "litsx",
    ...(line != null && column != null ? { loc: { file: id, line, column } } : {}),
    ...(frame ? { frame } : {}),
    ...(error?.stack ? { stack: error.stack } : {}),
    ...(error?.code ? { code: error.code } : {}),
    cause: error,
  };
}

export function litsx(options = {}) {
  const {
    include,
    ...compilerOptions
  } = options;
  let session = null;
  const warnedEntries = new Set();

  function getSession() {
    if (!session) {
      session = createLitsxCompilationSession({
        projectPath: compilerOptions.projectPath,
        transformOptions: compilerOptions,
      });
    }
    return session;
  }

  function createOptimizeDepsEsbuildPlugin() {
    return {
      name: "litsx-optimize-deps",
      setup(build) {
        build.onLoad({ filter: /\.(?:[jt]sx|litsx(?:\.jsx)?)$/ }, async ({ path: filePath }) => {
          if (!shouldTransform(filePath, include)) {
            return null;
          }

          const source = await fs.readFile(filePath, "utf8");
          const result = getSession().transformSync(source, {
            ...compilerOptions,
            filename: filePath,
            sourceMaps: false,
          });

          return {
            contents: result.code,
            loader: "js",
          };
        });
      },
    };
  }

  return {
    name: "litsx",
    enforce: "pre",
    config(userConfig) {
      const esbuildOptions = userConfig.optimizeDeps?.esbuildOptions ?? {};
      const existingPlugins = esbuildOptions.plugins ?? [];

      return {
        optimizeDeps: {
          ...userConfig.optimizeDeps,
          esbuildOptions: {
            ...esbuildOptions,
            plugins: [...existingPlugins, createOptimizeDepsEsbuildPlugin()],
          },
        },
      };
    },
    async transform(code, id) {
      if (!shouldTransform(id, include)) {
        return null;
      }

      let result;

      try {
        result = await getSession().transform(code, {
          ...compilerOptions,
          filename: id,
        });
      } catch (error) {
        const pluginError = createLitsxPluginError(error, id, code);

        if (typeof this.error === "function") {
          return this.error(pluginError);
        }

        throw Object.assign(new Error(pluginError.message), pluginError);
      }

      const warnings = result.metadata?.litsxWarnings;
      if (Array.isArray(warnings) && warnings.length > 0) {
        for (const warning of warnings) {
          const warningKey = [
            id,
            warning?.code ?? "",
            warning?.message ?? "",
            warning?.line ?? "",
            warning?.column ?? "",
          ].join(":");

          if (warnedEntries.has(warningKey)) {
            continue;
          }

          warnedEntries.add(warningKey);
          this.warn(formatLitsxWarning(id, warning));
        }
      }

      return {
        code: result.code,
        map: result.map,
      };
    },
    handleHotUpdate(ctx) {
      session?.invalidate?.([ctx.file]);
    },
    buildEnd() {
      session?.dispose?.();
      session = null;
      warnedEntries.clear();
    },
  };
}

export default litsx;
