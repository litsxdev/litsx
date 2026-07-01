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

function normalizePathSlashes(value) {
  return value.replaceAll("\\", "/");
}

function stripLeadingDotSlash(value) {
  return value.startsWith("./") ? value.slice(2) : value;
}

function deriveEntryNameFromRequireTarget(requireTarget) {
  const normalized = stripLeadingDotSlash(normalizePathSlashes(requireTarget));
  if (!normalized.startsWith("dist/") || !normalized.endsWith(".cjs")) {
    return null;
  }

  return normalized.slice("dist/".length, -".cjs".length);
}

function isSourceModuleTarget(target) {
  if (typeof target !== "string") {
    return false;
  }

  const normalized = stripLeadingDotSlash(normalizePathSlashes(target));
  return normalized.startsWith("src/") && /\.(?:m?js)$/.test(normalized);
}

function isDistEsmTarget(target) {
  if (typeof target !== "string") {
    return false;
  }

  const normalized = stripLeadingDotSlash(normalizePathSlashes(target));
  return normalized.startsWith("dist/") && /\.(?:m?js)$/.test(normalized);
}

function deriveSourceTargetFromDistTarget(target, packageDir) {
  if (!isDistEsmTarget(target)) {
    return null;
  }

  const normalized = stripLeadingDotSlash(normalizePathSlashes(target));
  const candidate = normalized.replace(/^dist\//, "src/");
  const candidatePath = path.join(packageDir, candidate);
  return fs.existsSync(candidatePath) ? candidate : null;
}

function deriveSourceTargetFromExportTarget(exportTarget, manifest, packageDir) {
  if (typeof exportTarget === "string") {
    return (
      (isSourceModuleTarget(exportTarget) ? exportTarget : null) ||
      deriveSourceTargetFromDistTarget(exportTarget, packageDir)
    );
  }

  if (!exportTarget || typeof exportTarget !== "object") {
    return null;
  }

  if (isSourceModuleTarget(exportTarget.import)) {
    return exportTarget.import;
  }
  if (deriveSourceTargetFromDistTarget(exportTarget.import, packageDir)) {
    return deriveSourceTargetFromDistTarget(exportTarget.import, packageDir);
  }

  if (isSourceModuleTarget(exportTarget.default)) {
    return exportTarget.default;
  }
  if (deriveSourceTargetFromDistTarget(exportTarget.default, packageDir)) {
    return deriveSourceTargetFromDistTarget(exportTarget.default, packageDir);
  }

  if (isSourceModuleTarget(exportTarget.module)) {
    return exportTarget.module;
  }
  if (deriveSourceTargetFromDistTarget(exportTarget.module, packageDir)) {
    return deriveSourceTargetFromDistTarget(exportTarget.module, packageDir);
  }

  if (isSourceModuleTarget(manifest.module) && exportTarget.require === manifest.main) {
    return manifest.module;
  }
  if (
    exportTarget.require === manifest.main &&
    deriveSourceTargetFromDistTarget(manifest.module, packageDir)
  ) {
    return deriveSourceTargetFromDistTarget(manifest.module, packageDir);
  }

  return null;
}

function deriveManifestInputs(manifest, packageDir) {
  const inputs = {};
  const exportsField = manifest.exports;

  if (!exportsField || typeof exportsField !== "object" || Array.isArray(exportsField)) {
    if (typeof manifest.main === "string" && typeof manifest.module === "string") {
      const entryName = deriveEntryNameFromRequireTarget(manifest.main);
      const sourceTarget =
        (isSourceModuleTarget(manifest.module)
          ? stripLeadingDotSlash(normalizePathSlashes(manifest.module))
          : null) ||
        deriveSourceTargetFromDistTarget(manifest.module, packageDir);
      if (entryName && sourceTarget) {
        inputs[entryName] = sourceTarget;
      }
    }
    return inputs;
  }

  for (const exportTarget of Object.values(exportsField)) {
    if (!exportTarget || typeof exportTarget !== "object" || Array.isArray(exportTarget)) {
      continue;
    }

    if (typeof exportTarget.require !== "string") {
      continue;
    }

    const entryName = deriveEntryNameFromRequireTarget(exportTarget.require);
    const sourceTarget = deriveSourceTargetFromExportTarget(exportTarget, manifest, packageDir);
    if (!entryName || !sourceTarget) {
      continue;
    }

    inputs[entryName] = stripLeadingDotSlash(normalizePathSlashes(sourceTarget));
  }

  return inputs;
}

function toBinEntries(binField) {
  if (typeof binField === "string") {
    return [{ name: null, file: binField }];
  }

  if (!binField || typeof binField !== "object" || Array.isArray(binField)) {
    return [];
  }

  return Object.entries(binField)
    .filter(([, file]) => typeof file === "string")
    .map(([name, file]) => ({ name, file }));
}

function resolveCliInputCandidate(packageDir, entry) {
  const outputFile = stripLeadingDotSlash(normalizePathSlashes(entry.file));
  const outputBase = path.basename(outputFile);
  const sourceCandidates = [
    path.join(packageDir, "src", outputBase),
  ];

  if (entry.name) {
    sourceCandidates.push(path.join(packageDir, "src", `${entry.name}.js`));
  }

  sourceCandidates.push(path.join(packageDir, "src", "cli.js"));

  const matched = sourceCandidates.find((candidate) => fs.existsSync(candidate));
  if (!matched) {
    return null;
  }

  return stripLeadingDotSlash(
    normalizePathSlashes(path.relative(packageDir, matched))
  );
}

function deriveManifestCliEntries(manifest, packageDir) {
  return toBinEntries(manifest.bin)
    .map((entry) => {
      const input = resolveCliInputCandidate(packageDir, entry);
      if (!input) {
        return null;
      }

      return {
        input,
        file: stripLeadingDotSlash(normalizePathSlashes(entry.file)),
        format: "esm",
      };
    })
    .filter(Boolean);
}

function copyDeclarationFiles(sourceDir, targetDir) {
  if (!fs.existsSync(sourceDir)) {
    return;
  }

  for (const entry of fs.readdirSync(sourceDir, { withFileTypes: true })) {
    const sourcePath = path.join(sourceDir, entry.name);
    const targetPath = path.join(targetDir, entry.name);

    if (entry.isDirectory()) {
      copyDeclarationFiles(sourcePath, targetPath);
      continue;
    }

    if (!entry.isFile() || !entry.name.endsWith(".d.ts")) {
      continue;
    }

    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.copyFileSync(sourcePath, targetPath);
  }
}

function createCopyDeclarationsPlugin(packageDir) {
  return {
    name: "copy-declarations-to-dist",
    writeBundle() {
      copyDeclarationFiles(
        path.join(packageDir, "src"),
        path.join(packageDir, "dist")
      );
    },
  };
}

export function createPackageRollupConfig({
  packageDir,
  input,
  cliEntries = [],
  extraPlugins = [],
  esmOutputs = false,
  copyDeclarations = false,
}) {
  const packageJsonPath = path.join(packageDir, "package.json");
  const manifest = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
  const distDir = path.join(packageDir, "dist");

  if (fs.existsSync(distDir)) {
    fs.rmSync(distDir, { recursive: true, force: true });
  }

  const manifestInputs = deriveManifestInputs(manifest, packageDir);
  const resolvedInput =
    input && Object.keys(input).length > 0
      ? { ...manifestInputs, ...input }
      : manifestInputs;
  const manifestCliEntries = deriveManifestCliEntries(manifest, packageDir);
  const resolvedCliEntries = [...manifestCliEntries, ...cliEntries];

  const externalIds = collectPackageExternalIds(manifest);
  const external = (id) => isExternalId(id, externalIds);
  const plugins = [
    resolve({
      preferBuiltins: true,
      exportConditions: ["import", "default"],
    }),
    json(),
    commonjs(),
    ...extraPlugins,
    ...(copyDeclarations ? [createCopyDeclarationsPlugin(packageDir)] : []),
  ];

  return [
    {
      input: resolvedInput,
      external,
      plugins,
      output: [
        {
          dir: "dist",
          format: "cjs",
          exports: "named",
          entryFileNames: "[name].cjs",
          chunkFileNames: "shared/[name]-[hash].cjs",
          sourcemap: true,
        },
        ...(esmOutputs
          ? [{
              dir: "dist",
              format: "esm",
              entryFileNames: "[name].js",
              chunkFileNames: "shared/[name]-[hash].js",
              sourcemap: true,
            }]
          : []),
      ],
    },
    ...resolvedCliEntries.map((entry) => ({
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
