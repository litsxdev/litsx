import fs from "node:fs";
import path from "node:path";

function rewriteSrcTarget(target) {
  if (typeof target !== "string") {
    return target;
  }

  return target.replace(/^\.\/src\/(.*)$/, "./dist/$1");
}

function createFileExistsForPackageRoot(packageRoot) {
  if (!packageRoot) {
    return () => false;
  }

  return (relativePath) => typeof relativePath === "string" && fs.existsSync(path.join(packageRoot, relativePath));
}

function rewriteManifestValue(value) {
  if (typeof value === "string") {
    return rewriteSrcTarget(value);
  }

  if (Array.isArray(value)) {
    return value.map(rewriteManifestValue);
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, entryValue]) => [key, rewriteManifestValue(entryValue)])
  );
}

function normalizeConditionalExportTarget(exportTarget, fileExists) {
  if (!exportTarget || typeof exportTarget !== "object" || Array.isArray(exportTarget)) {
    return exportTarget;
  }

  const normalizedTarget = rewriteManifestValue(exportTarget);

  if (
    typeof normalizedTarget.import === "string" &&
    !fileExists(normalizedTarget.import) &&
    typeof normalizedTarget.require === "string" &&
    fileExists(normalizedTarget.require)
  ) {
    normalizedTarget.import = normalizedTarget.require;
  }

  if (
    typeof normalizedTarget.default === "string" &&
    !fileExists(normalizedTarget.default)
  ) {
    if (typeof normalizedTarget.import === "string" && fileExists(normalizedTarget.import)) {
      normalizedTarget.default = normalizedTarget.import;
    } else if (typeof normalizedTarget.require === "string" && fileExists(normalizedTarget.require)) {
      normalizedTarget.default = normalizedTarget.require;
    }
  }

  return normalizedTarget;
}

export function createReleaseManifest(manifest, options = {}) {
  const fileExists = createFileExistsForPackageRoot(options.packageRoot);
  const rewrittenExports = manifest.exports && typeof manifest.exports === "object"
    ? Object.fromEntries(
        Object.entries(manifest.exports).map(([key, value]) => [
          key,
          normalizeConditionalExportTarget(value, fileExists),
        ])
      )
    : rewriteManifestValue(manifest.exports);

  const releaseManifest = {
    ...manifest,
    module: rewriteSrcTarget(manifest.module),
    types: rewriteSrcTarget(manifest.types),
    exports: rewrittenExports,
    files: Array.isArray(manifest.files)
      ? manifest.files.filter((entry) => entry !== "src")
      : manifest.files,
  };

  if (
    typeof releaseManifest.module === "string" &&
    !fileExists(releaseManifest.module)
  ) {
    const rootExport = releaseManifest.exports?.["."];
    if (typeof rootExport?.import === "string" && fileExists(rootExport.import)) {
      releaseManifest.module = rootExport.import;
    } else if (typeof rootExport?.require === "string" && fileExists(rootExport.require)) {
      releaseManifest.module = rootExport.require;
    } else if (typeof releaseManifest.main === "string" && fileExists(releaseManifest.main)) {
      releaseManifest.module = releaseManifest.main;
    }
  }

  if (
    typeof releaseManifest.types === "string" &&
    !fileExists(releaseManifest.types)
  ) {
    delete releaseManifest.types;
    const rootExport = releaseManifest.exports?.["."];
    if (rootExport && typeof rootExport === "object" && "types" in rootExport) {
      delete rootExport.types;
    }
  }

  if (releaseManifest.scripts?.prepack) {
    releaseManifest.scripts = { ...releaseManifest.scripts };
    delete releaseManifest.scripts.prepack;
    if (Object.keys(releaseManifest.scripts).length === 0) {
      delete releaseManifest.scripts;
    }
  }

  return releaseManifest;
}

function copyEntry(sourcePath, targetPath) {
  const stat = fs.statSync(sourcePath);
  if (stat.isDirectory()) {
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.cpSync(sourcePath, targetPath, { recursive: true });
    return;
  }

  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.copyFileSync(sourcePath, targetPath);
}

export function stageReleasePackage({
  packageDir,
  packageRoot,
  stagingRoot,
}) {
  const manifestPath = path.join(packageRoot, "package.json");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const releaseManifest = createReleaseManifest(manifest, { packageRoot });
  const stagingDir = path.join(stagingRoot, packageDir.replaceAll("/", "__"));

  fs.rmSync(stagingDir, { recursive: true, force: true });
  fs.mkdirSync(stagingDir, { recursive: true });

  const fileEntries = Array.isArray(releaseManifest.files) ? releaseManifest.files : [];
  for (const relativePath of fileEntries) {
    const sourcePath = path.join(packageRoot, relativePath);
    if (!fs.existsSync(sourcePath)) {
      continue;
    }
    copyEntry(sourcePath, path.join(stagingDir, relativePath));
  }

  if (typeof releaseManifest.bin === "string") {
    const binPath = path.join(packageRoot, releaseManifest.bin);
    if (fs.existsSync(binPath)) {
      copyEntry(binPath, path.join(stagingDir, releaseManifest.bin));
    }
  } else if (releaseManifest.bin && typeof releaseManifest.bin === "object") {
    for (const relativePath of Object.values(releaseManifest.bin)) {
      const binPath = path.join(packageRoot, relativePath);
      if (fs.existsSync(binPath)) {
        copyEntry(binPath, path.join(stagingDir, relativePath));
      }
    }
  }

  if (typeof releaseManifest.main === "string") {
    const mainPath = path.join(packageRoot, releaseManifest.main);
    if (fs.existsSync(mainPath)) {
      copyEntry(mainPath, path.join(stagingDir, releaseManifest.main));
    }
  }

  fs.writeFileSync(
    path.join(stagingDir, "package.json"),
    `${JSON.stringify(releaseManifest, null, 2)}\n`,
  );

  return {
    manifest,
    releaseManifest,
    stagingDir,
  };
}
