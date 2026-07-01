import { fileURLToPath } from "node:url";
import babel from "@rollup/plugin-babel";
import { createPackageRollupConfig } from "../../scripts/rollup/create-package-config.js";
import annotateCompiledRuntimeMetadata from "./build/annotate-compiled-runtime-metadata.js";

const packageDir = fileURLToPath(new URL(".", import.meta.url));

export default createPackageRollupConfig({
  packageDir,
  input: {
    index: "src/index.js",
    "jsx-runtime": "src/jsx-runtime.js",
    "jsx-dev-runtime": "src/jsx-dev-runtime.js",
    "elements/index": "src/elements/index.js",
    rendering: "src/rendering.js",
    context: "src/context.js",
  },
  esmOutputs: true,
  copyDeclarations: true,
  extraPlugins: [
    babel({
      babelHelpers: "bundled",
      extensions: [".js"],
      include: ["src/**/*.js"],
      plugins: [annotateCompiledRuntimeMetadata],
    }),
  ],
});
