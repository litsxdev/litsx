import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createLitsxCompilationSession } from "../../packages/compiler/src/index.js";

const exampleDir = path.dirname(fileURLToPath(import.meta.url));
const componentsSourcePath = path.join(exampleDir, "src/components.litsx");
const serverOutputDir = path.join(exampleDir, ".ssr");
const serverComponentsPath = path.join(serverOutputDir, "components.server.mjs");

async function compileServerComponents() {
  const source = await fs.readFile(componentsSourcePath, "utf8");
  const session = createLitsxCompilationSession({
    transformOptions: {
      ssr: true,
      filename: componentsSourcePath,
    },
  });
  const result = session.transformSync(source, {
    filename: componentsSourcePath,
    sourceMaps: false,
  });

  await fs.mkdir(serverOutputDir, { recursive: true });
  await fs.writeFile(serverComponentsPath, result.code);
}

export async function renderDemoHtml() {
  await import("@lit-labs/ssr/lib/install-global-dom-shim.js");
  await compileServerComponents();

  const { html } = await import("lit");
  const { __litsxScopedTemplate } = await import("@litsx/core/elements");
  const { renderToString } = await import("@litsx/ssr");
  const { DemoApp } = await import(`./.ssr/components.server.mjs?t=${Date.now()}`);

  const result = await renderToString(
    __litsxScopedTemplate(
      html`<demo-app
        .title=${"LitSX SSR Hydration"}
        .initialCount=${4}
      ></demo-app>`,
      {
        "demo-app": DemoApp,
      },
    ),
    {
      assetResolver(moduleId) {
        return moduleId ? "/src/components.litsx" : null;
      },
    },
  );

  const documentHtml = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>LitSX SSR Hydration Demo</title>
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
    </style>
    ${result.renderModulePreloads()}
    ${result.renderHydrationData()}
  </head>
  <body>
    <main class="page">
      <div class="status">LitSX SSR status: </div>
      ${result.html}
    </main>
    <script type="module" src="/src/main.js"></script>
  </body>
</html>`;

  await fs.writeFile(path.join(exampleDir, "index.html"), documentHtml);
  return {
    html: documentHtml,
    result,
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { result } = await renderDemoHtml();
  console.log(`wrote ${path.join(exampleDir, "index.html")}`);
  console.log(`client imports: ${result.clientImports.join(", ")}`);
  console.log(`hydration roots: ${result.hydrationData?.roots.length ?? 0}`);
}
