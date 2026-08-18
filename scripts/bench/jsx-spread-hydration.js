import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { createServer } from "vite";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const fixtureDir = path.join(rootDir, "test/browser-fixtures/jsx-spread-hydration-bench");
const iterations = Number.parseInt(process.argv[2] || "15", 10);
const cases = [
  [100, 5],
  [1000, 5],
  [1000, 20],
  [1000, 20, 5],
  [5000, 5],
  [1000, 5, 1, "mixed"],
  [1000, 5, 5, "mixed"],
];

const server = await createServer({
  configFile: path.join(fixtureDir, "vite.config.js"),
  root: fixtureDir,
  logLevel: "error",
});
let browser;

try {
  await server.listen();
  const address = server.httpServer.address();
  const url = `http://127.0.0.1:${address.port}/`;
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto(url, { waitUntil: "networkidle" });
  await page.waitForFunction(() => window.__jsxSpreadHydrationBenchmarkReady === true);
  const results = await page.evaluate(
    ({ cases, iterations }) => window.runJsxSpreadHydrationBenchmark({ cases, iterations }),
    { cases, iterations }
  );

  console.log(`JSX spread hydration benchmark (${iterations} measured iterations)`);
  console.log("Chromium, median and p95; DOM writes include Lit's marker cleanup.");
  console.log("");
  for (const result of results) {
    const suffix = result.mode === "mixed" ? " mixed" : "";
    const label = `${result.elements} × ${result.props} props × ${result.sources} src${suffix}`;
    console.log(
      `${label.padEnd(28)} normal ${result.baseline.medianMs.toFixed(2)}ms ` +
      `(p95 ${result.baseline.p95Ms.toFixed(2)})  spread ${result.spread.medianMs.toFixed(2)}ms ` +
      `(p95 ${result.spread.p95Ms.toFixed(2)})  ratio ${result.medianRatio.toFixed(2)}x`
    );
    console.log(
      `${"".padEnd(28)} writes normal ${result.baseline.writes.toFixed(0)}, ` +
      `spread ${result.spread.writes.toFixed(0)}`
    );
  }
} finally {
  await browser?.close();
  await server.close();
}
