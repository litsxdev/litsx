import { createSsrDevServer } from "@litsx/ssr";

const server = await createSsrDevServer({
  root: new URL(".", import.meta.url).pathname,
  serverEntry: "./src/components.litsx",
  clientEntry: "./src/main.js",
  host: "127.0.0.1",
  port: 5177,
  logLevel: "info",
  title: "LitSX SSR Hydration Demo",
  head: `
    <style>
      body {
        margin: 0;
        min-height: 100vh;
        background: linear-gradient(135deg, #f8efe4, #d8edf0 55%, #f7d9c4);
        color: #17201b;
        font-family: ui-serif, Georgia, serif;
      }

      .page {
        max-width: 920px;
        margin: 0 auto;
        padding: 48px 24px;
      }

      .status {
        margin-bottom: 18px;
        border: 1px solid rgba(23, 32, 27, 0.18);
        border-radius: 999px;
        background: rgba(255, 255, 255, 0.62);
        padding: 8px 14px;
        font: 13px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace;
      }

      body[data-hydrated="true"] .status::after {
        content: "hydrated";
        color: #146b43;
      }

      body:not([data-hydrated="true"]) .status::after {
        content: "server rendered";
        color: #8a4c00;
      }
    </style>`,
  render({ module, html, scopedTemplate }) {
    const { DemoApp } = module;

    return html`<main class="page">
      <div class="status">LitSX SSR status: </div>
      ${scopedTemplate(
        html`<demo-app
          .title=${"LitSX SSR Hydration"}
          .initialCount=${4}
        ></demo-app>`,
        {
          "demo-app": DemoApp,
        },
      )}
    </main>`;
  },
});

await server.listen();
server.printUrls();
