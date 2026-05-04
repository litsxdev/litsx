import { fileURLToPath } from "node:url";
import { createPackageRollupConfig } from "../../scripts/rollup/create-package-config.mjs";

const packageDir = fileURLToPath(new URL(".", import.meta.url));

export default createPackageRollupConfig({
  packageDir,
  input: {
    index: "src/index.js",
    pipeline: "src/pipeline.js",
    "internal/transform-litsx-components": "src/internal/transform-litsx-components.js",
    "internal/transform-litsx-renderer-props": "src/internal/transform-litsx-renderer-props.js",
    "internal/transform-litsx-dom-refs": "src/internal/transform-litsx-dom-refs.js",
    "internal/transform-litsx-hooks": "src/internal/transform-litsx-hooks.js",
    "internal/transform-litsx-properties": "src/internal/transform-litsx-properties.js",
  },
});
