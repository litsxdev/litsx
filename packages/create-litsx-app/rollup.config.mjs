import { fileURLToPath } from "node:url";
import { createPackageRollupConfig } from "../../scripts/rollup/create-package-config.mjs";

const packageDir = fileURLToPath(new URL(".", import.meta.url));

export default createPackageRollupConfig({
  packageDir,
  input: {
    index: "src/index.js",
  },
  cliEntries: [
    {
      input: "src/cli.js",
      file: "dist/create-litsx-app.js",
    },
  ],
});
