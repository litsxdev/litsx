import { fileURLToPath } from "node:url";
import fs from "node:fs";
import path from "node:path";
import { createPackageRollupConfig } from "../../scripts/rollup/create-package-config.js";

const packageDir = fileURLToPath(new URL(".", import.meta.url));

function copyScaffoldAssets() {
  return {
    name: "copy-scaffold-assets",
    writeBundle() {
      const sourceDir = path.join(packageDir, "src", "assets");
      const targetDir = path.join(packageDir, "dist", "assets");

      if (!fs.existsSync(sourceDir)) {
        return;
      }

      fs.mkdirSync(targetDir, { recursive: true });
      fs.cpSync(sourceDir, targetDir, { recursive: true });
    },
  };
}

export default createPackageRollupConfig({
  packageDir,
  extraPlugins: [copyScaffoldAssets()],
});
