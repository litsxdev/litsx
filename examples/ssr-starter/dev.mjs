import { createSsrDevServer } from "@litsx/ssr";

const server = await createSsrDevServer({
  root: new URL(".", import.meta.url).pathname,
  serverEntry: "./src/components.litsx",
  clientEntry: "./src/main.js",
  host: "127.0.0.1",
  port: 5176,
  logLevel: "info",
  title: "LitSX SSR Starter",
  head: `
    <style>
      body {
        margin: 0;
        min-height: 100vh;
        background: linear-gradient(180deg, #f6efe8, #fdfaf6);
        color: #1d231f;
        font-family: ui-sans-serif, system-ui, sans-serif;
      }

      .page {
        max-width: 720px;
        margin: 0 auto;
        padding: 64px 24px 96px;
      }

      .status {
        margin-bottom: 16px;
        color: #6d776f;
        font: 12px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace;
        letter-spacing: 0.08em;
        text-transform: uppercase;
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
          .title=${"SSR Starter"}
          .subtitle=${"A minimal document-first SSR example"}
          .initialCount=${2}
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
