import { fileURLToPath } from "node:url";
import { createPackageRollupConfig } from "../../scripts/rollup/create-package-config.js";

const packageDir = fileURLToPath(new URL(".", import.meta.url));

export default createPackageRollupConfig({
  packageDir,
  input: { index: "src/index.js", client: "src/client.js" },
  esmOutputs: true,
  copyDeclarations: true,
});
