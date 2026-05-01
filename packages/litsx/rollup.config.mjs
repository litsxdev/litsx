import { fileURLToPath } from "node:url";
import { createPackageRollupConfig } from "../../scripts/rollup/create-package-config.mjs";

const packageDir = fileURLToPath(new URL(".", import.meta.url));

export default createPackageRollupConfig({
  packageDir,
  input: {
    index: "src/index.js",
    "jsx-runtime": "src/jsx-runtime.js",
    "jsx-dev-runtime": "src/jsx-dev-runtime.js",
    context: "src/context.js",
    "runtime-infrastructure/index": "src/runtime-infrastructure/index.js",
  },
});
