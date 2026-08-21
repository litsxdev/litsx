import { createSsrDevServer } from "@litsx/ssr";

const server = await createSsrDevServer({
  root: new URL(".", import.meta.url).pathname,
  template: "./index.html",
  clientEntry: "./src/main.js",
  host: "127.0.0.1",
  port: 5176,
  logLevel: "info",
  elements(loader) {
    return {
      "demo-app": async () =>
        (await loader("./src/components.litsx")).DemoApp,
    };
  },
  render({ html }) {
    return html`<demo-app
      .title=${"SSR Starter"}
      .subtitle=${"A minimal document-first SSR example"}
      .initialCount=${2}
    ></demo-app>`;
  },
});

await server.listen();
server.printUrls();
