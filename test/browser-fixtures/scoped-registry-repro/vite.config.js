import { defineConfig } from "vite";
import path from "path";

const rootDir = path.resolve(__dirname, "../../..");

export default defineConfig({
  root: __dirname,
  resolve: {
    alias: {
      "@litsx/scoped-registry-shim": path.resolve(rootDir, "packages/scoped-registry-shim/src/index.js"),
      "@litsx/core": path.resolve(rootDir, "packages/core/src/index.js"),
      "@litsx/core/elements": path.resolve(rootDir, "packages/core/src/elements/index.js"),
      "@litsx/core/rendering": path.resolve(rootDir, "packages/core/src/rendering.js"),
      "@litsx/core/context": path.resolve(rootDir, "packages/core/src/context.js"),
    },
  },
  server: {
    host: "127.0.0.1",
    port: 4175,
    strictPort: true,
  },
});
