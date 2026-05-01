import commonjs from "@rollup/plugin-commonjs";
import nodeResolve from "@rollup/plugin-node-resolve";

const EXTERNAL_IDS = new Set([
  "fs",
  "module",
  "path",
  "url",
  "vscode",
  "typescript",
]);

function isExternal(id) {
  return id.startsWith("node:") || EXTERNAL_IDS.has(id);
}

export default {
  input: {
    extension: "src/extension.js",
    "editor-support": "src/editor-support.js",
    detect: "src/detect.js",
  },
  external: isExternal,
  output: {
    dir: "dist",
    format: "cjs",
    exports: "named",
    entryFileNames: "[name].cjs",
    chunkFileNames: "chunks/[name]-[hash].cjs",
  },
  plugins: [
    nodeResolve({
      preferBuiltins: true,
    }),
    commonjs(),
  ],
};
