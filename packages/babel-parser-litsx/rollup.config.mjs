import { fileURLToPath } from "node:url";
import { createPackageRollupConfig } from "../../scripts/rollup/create-package-config.mjs";

const packageDir = fileURLToPath(new URL(".", import.meta.url));

export default createPackageRollupConfig({
  packageDir,
  input: {
    index: "src/index.mjs",
  },
  cliEntries: [
    {
      input: "src/cli.mjs",
      file: "dist/babel-parser.mjs",
    },
  ],
});
