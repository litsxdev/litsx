import commonjs from "@rollup/plugin-commonjs";
import resolve from "@rollup/plugin-node-resolve";
import fs from "fs";
import path from "path";

const packageDir = new URL(".", import.meta.url).pathname;
const distDir = path.join(packageDir, "dist");

function cleanDist() {
  if (fs.existsSync(distDir)) {
    fs.rmSync(distDir, { recursive: true, force: true });
  }
}

const input = {
  index: "src/index.js",
  "virtual-source": "src/virtual-source.js",
  typecheck: "src/typecheck.js",
  "authored-semantics": "src/authored-semantics.js",
};

const external = [
  "fs",
  "module",
  "path",
  "typescript",
  "url",
];

const plugins = [
  resolve({
    preferBuiltins: true,
  }),
  commonjs(),
];

cleanDist();

export default [
  {
    input,
    external,
    plugins,
    output: {
      dir: "dist",
      format: "esm",
      entryFileNames: "[name].js",
      chunkFileNames: "shared/[name]-[hash].js",
      sourcemap: true,
    },
  },
  {
    input,
    external,
    plugins,
    output: {
      dir: "dist",
      format: "cjs",
      exports: "named",
      entryFileNames: "[name].cjs",
      chunkFileNames: "shared/[name]-[hash].cjs",
      sourcemap: true,
    },
  },
  {
    input: "src/litsx-tsc.js",
    external,
    plugins,
    output: {
      file: "dist/litsx-tsc.js",
      format: "esm",
      banner: "#!/usr/bin/env node",
    },
  },
];
