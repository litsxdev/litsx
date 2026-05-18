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
  const { renderDocument } = await import("@litsx/ssr");
  const { DemoApp } = await import(`./.ssr/components.server.mjs?t=${Date.now()}`);

  const result = await renderDocument(
    __litsxScopedTemplate(
      html`<demo-app
        .title=${"SSR Starter"}
        .subtitle=${"A minimal document-first SSR example"}
        .initialCount=${2}
      ></demo-app>`,
      {
        "demo-app": DemoApp,
      },
    ),
    {
      assetResolver(moduleId) {
        return moduleId ? "/src/components.litsx" : null;
      },
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
      bootstrap: "/src/main.js",
    },
  );

  const documentHtml = result.document.replace(
    result.html,
    `<main class="page">
      <div class="status">LitSX SSR status: </div>
      ${result.html}
    </main>`,
  );

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
