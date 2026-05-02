import commonjs from "@rollup/plugin-commonjs";
import json from "@rollup/plugin-json";
import resolve from "@rollup/plugin-node-resolve";
import fs from "node:fs";
import { builtinModules } from "node:module";
import path from "node:path";

function collectPackageExternalIds(manifest) {
  return new Set([
    ...builtinModules,
    ...builtinModules.map((moduleName) => `node:${moduleName}`),
    ...Object.keys(manifest.dependencies || {}),
    ...Object.keys(manifest.peerDependencies || {}),
    ...Object.keys(manifest.optionalDependencies || {}),
  ]);
}

function isExternalId(id, externalIds) {
  if (id.startsWith(".") || path.isAbsolute(id)) {
    return false;
  }

  for (const externalId of externalIds) {
    if (id === externalId || id.startsWith(`${externalId}/`)) {
      return true;
    }
  }

  return false;
}

export function createPackageRollupConfig({
  packageDir,
  input,
  cliEntries = [],
}) {
  const packageJsonPath = path.join(packageDir, "package.json");
  const manifest = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
  const distDir = path.join(packageDir, "dist");

  if (fs.existsSync(distDir)) {
    fs.rmSync(distDir, { recursive: true, force: true });
  }

  const externalIds = collectPackageExternalIds(manifest);
  const external = (id) => isExternalId(id, externalIds);
  const plugins = [
    resolve({
      preferBuiltins: true,
      exportConditions: ["import", "default"],
    }),
    json(),
    commonjs(),
  ];

  return [
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
    ...cliEntries.map((entry) => ({
      input: entry.input,
      external,
      plugins,
      output: {
        file: entry.file,
        format: entry.format || "esm",
        banner: "#!/usr/bin/env node",
        sourcemap: true,
      },
    })),
  ];
}
