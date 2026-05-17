import { createServer } from "vite";
import { litsx } from "../../packages/vite-plugin/src/index.js";
import { renderDemoHtml } from "./render.mjs";

await renderDemoHtml();

const server = await createServer({
  root: new URL(".", import.meta.url).pathname,
  logLevel: "info",
  server: {
    host: "127.0.0.1",
    port: 5177,
    strictPort: false,
  },
  plugins: [
    litsx({
      ssr: true,
      sourceMaps: true,
    }),
  ],
});

await server.listen();
server.printUrls();
