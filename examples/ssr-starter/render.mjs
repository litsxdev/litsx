import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { renderDocument } from "@litsx/ssr";

const exampleDir = path.dirname(fileURLToPath(import.meta.url));
const outputDir = path.join(exampleDir, "dist");
const outputPath = path.join(outputDir, "index.html");

export async function renderDemoHtml() {
  const result = await renderDocument({
    root: exampleDir,
    template: "./index.html",
    clientEntry: "./src/main.js",
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

  await fs.mkdir(outputDir, { recursive: true });
  await fs.writeFile(outputPath, result.document);
  return result;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const result = await renderDemoHtml();
  console.log(`wrote ${outputPath}`);
  console.log(`client imports: ${result.clientImports.join(", ")}`);
  console.log(`hydration roots: ${result.hydrationData?.roots.length ?? 0}`);
}
