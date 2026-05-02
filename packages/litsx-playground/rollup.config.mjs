import { babel } from "@rollup/plugin-babel";
import commonjs from "@rollup/plugin-commonjs";
import { nodeResolve } from "@rollup/plugin-node-resolve";
import terser from "@rollup/plugin-terser";
import fs from "fs";
import MagicString from "magic-string";
import path from "path";
import { fileURLToPath } from "url";
import {
  applyVirtualAttributeReplacements,
  createVirtualLitsxJsxSource,
} from "../jsx-authoring/src/index.js";
import nativePreset from "../babel-preset-litsx/src/index.js";
import transformJsxHtmlTemplate from "../babel-plugin-transform-jsx-html-template/src/index.js";
import { PLAYGROUND_TYPE_FILES } from "./src/virtual-types.js";

const configDir = path.dirname(fileURLToPath(import.meta.url));
const srcDir = path.join(configDir, "src");
const distDir = path.join(configDir, "dist");
const browserExternalPrefix = "\0browser-external:";
const workspaceEntries = new Map([
  ["litsx", path.join(configDir, "../litsx/src/index.js")],
  ["litsx/runtime-infrastructure", path.join(configDir, "../litsx/src/runtime-infrastructure/index.js")],
  [
    "@litsx/babel-plugin-transform-jsx-html-template",
    path.join(configDir, "../babel-plugin-transform-jsx-html-template/src/index.js"),
  ],
]);

// We use Rollup here because the previous tsup/esbuild path emitted multiple `lit`
// import statements in the middle of the generated ESM file instead of hoisting
// them to the top-level, which is invalid module syntax.

fs.rmSync(distDir, { recursive: true, force: true });

function virtualizeLitsxJsxAttributes() {
  return {
    name: "virtualize-litsx-jsx-attributes",
    transform(code, id) {
      if (!id.startsWith(srcDir) || !id.endsWith(".tsx")) {
        return null;
      }

      const virtualSource = createVirtualLitsxJsxSource(code);
      if (virtualSource.code === code) {
        return null;
      }

      const editable = new MagicString(code);
      applyVirtualAttributeReplacements(editable, virtualSource.replacements);

      return {
        code: editable.toString(),
        map: editable.generateMap({
          hires: true,
          source: id,
          includeContent: true,
        }),
      };
    },
  };
}

function browserExternalBuiltins() {
  return {
    name: "browser-external-builtins",
    resolveId(source) {
      if (source === "module" || source === "node:module") {
        return `${browserExternalPrefix}module`;
      }

      return null;
    },
    load(id) {
      if (id !== `${browserExternalPrefix}module`) {
        return null;
      }

      return `
        export const findPnpApi = undefined;
        export function createRequire() {
          throw new Error("module.createRequire is not available in browser workers.");
        }
        export default {
          findPnpApi,
          createRequire,
        };
      `;
    },
  };
}

function inlinePlaygroundRuntimeSource() {
  return {
    name: "inline-playground-runtime-source",
    generateBundle(outputOptions, bundle) {
      const outputDir = outputOptions.dir ?? path.dirname(outputOptions.file);
      const runtimePath = path.join(outputDir, "playground-runtime.js");

      if (!fs.existsSync(runtimePath)) {
        this.error(`Missing "${runtimePath}" while inlining runtime source.`);
      }

      const runtimeSource = JSON.stringify(fs.readFileSync(runtimePath, "utf8"));

      for (const entry of Object.values(bundle)) {
        if (entry.type !== "chunk") continue;
        if (!entry.code.includes("__PLAYGROUND_RUNTIME_SOURCE__")) continue;
        entry.code = entry.code.replaceAll(
          '"__PLAYGROUND_RUNTIME_SOURCE__"',
          runtimeSource
        );
      }
    },
  };
}

function copyPreviewRuntimeModules() {
  return {
    name: "copy-preview-runtime-modules",
    generateBundle(outputOptions) {
      const outputDir = outputOptions.dir ?? path.dirname(outputOptions.file);
      const previewRuntimeDir = path.join(configDir, "src/preview-runtime");
      const targetDir = path.join(outputDir, "preview-runtime");

      fs.mkdirSync(targetDir, { recursive: true });

      for (const entry of fs.readdirSync(previewRuntimeDir)) {
        const sourcePath = path.join(previewRuntimeDir, entry);
        const targetPath = path.join(targetDir, entry);
        fs.copyFileSync(sourcePath, targetPath);
      }
    },
  };
}

function resolveWorkspaceEntries() {
  return {
    name: "resolve-litsx-workspace-entry",
    resolveId(source) {
      if (workspaceEntries.has(source)) {
        return workspaceEntries.get(source);
      }

      return null;
    },
  };
}

function createSharedPlugins() {
  return [
    browserExternalBuiltins(),
    // Keep `lit` external but force the local `litsx` workspace entry into the bundle.
    resolveWorkspaceEntries(),
    nodeResolve({
      browser: true,
      preferBuiltins: false,
      exportConditions: ["browser", "default", "import"],
      extensions: [".mjs", ".js", ".json", ".node", ".ts", ".tsx"],
    }),
    virtualizeLitsxJsxAttributes(),
    commonjs(),
  ];
}

function createMinifyPlugin(module = true) {
  return terser({
    module,
    compress: {
      passes: 2,
    },
    format: {
      comments: /@vite-ignore/,
    },
  });
}

const runtimeConfig = {
  input: {
    "playground-runtime": path.join(configDir, "src/playground-runtime.js"),
  },
  output: [
    {
      dir: distDir,
      format: "es",
      entryFileNames: "[name].js",
      inlineDynamicImports: true,
    },
    {
      dir: distDir,
      format: "cjs",
      entryFileNames: "[name].cjs",
      inlineDynamicImports: true,
    },
  ],
  external: ["lit"],
  plugins: [
    ...createSharedPlugins(),
    createMinifyPlugin(),
  ],
};

const packageConfig = {
  input: {
    index: path.join(configDir, "src/index.js"),
    "litsx-playground.worker": path.join(configDir, "src/litsx-playground.worker.js"),
  },
  output: [
    {
      dir: distDir,
      format: "es",
      entryFileNames: "[name].js",
      chunkFileNames: "chunks/[name]-[hash].js",
    },
    {
      dir: distDir,
      format: "cjs",
      entryFileNames: "[name].cjs",
      chunkFileNames: "chunks/[name]-[hash].cjs",
    },
  ],
  external: ["lit"],
  plugins: [
    ...createSharedPlugins(),
    babel({
      babelHelpers: "bundled",
      babelrc: false,
      configFile: false,
      extensions: [".js", ".ts", ".tsx"],
      include: [new RegExp(`${configDir.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/src/.*\\.tsx$`)],
      parserOpts: {
        sourceType: "module",
        plugins: ["typescript", "jsx"],
      },
      presets: [[nativePreset, {
        jsxTemplate: false,
        typeResolutionMode: "in-memory",
        inMemoryFiles: PLAYGROUND_TYPE_FILES,
      }]],
      plugins: [
        transformJsxHtmlTemplate,
        [
          "@babel/plugin-transform-typescript",
          {
            isTSX: true,
            allowDeclareFields: true,
          },
        ],
      ],
    }),
    inlinePlaygroundRuntimeSource(),
    copyPreviewRuntimeModules(),
    createMinifyPlugin(false),
  ],
};

export default [runtimeConfig, packageConfig];
