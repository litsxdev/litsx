import { fileURLToPath } from "node:url";
import { transformAsync } from "@babel/core";
import { createPackageRollupConfig } from "../../scripts/rollup/create-package-config.js";
import annotateCompiledRuntimeMetadata from "./build/annotate-compiled-runtime-metadata.js";

const packageDir = fileURLToPath(new URL(".", import.meta.url));

function annotateRuntimeMetadata() {
  return {
    name: "litsx:annotate-compiled-runtime-metadata",
    async transform(code, id) {
      if (!id.startsWith(`${packageDir}src/`) || !id.endsWith(".js")) {
        return null;
      }

      const result = await transformAsync(code, {
        babelrc: false,
        configFile: false,
        filename: id,
        sourceMaps: true,
        sourceFileName: id,
        plugins: [annotateCompiledRuntimeMetadata],
      });

      if (!result?.code) {
        return null;
      }

      return {
        code: result.code,
        map: result.map ?? null,
      };
    },
  };
}

export default createPackageRollupConfig({
  packageDir,
  input: {
    index: "src/index.js",
    "jsx-runtime": "src/jsx-runtime.js",
    "jsx-dev-runtime": "src/jsx-dev-runtime.js",
    "elements/index": "src/elements/index.js",
    rendering: "src/rendering.js",
    context: "src/context.js",
    "react-compat": "src/react-compat.js",
    internal: "src/internal.js",
  },
  esmOutputs: true,
  copyDeclarations: true,
  extraPlugins: [annotateRuntimeMetadata()],
});
