import { fileURLToPath } from "node:url";
import { createPackageRollupConfig } from "../../scripts/rollup/create-package-config.js";

const packageDir = fileURLToPath(new URL(".", import.meta.url));

export default createPackageRollupConfig({
  packageDir,
});
