import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { createLitsxCompilationSession } from "../../packages/compiler/src/index.js";

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function createTempWorkspace(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function cleanupTempWorkspace(directory) {
  fs.rmSync(directory, { recursive: true, force: true });
}

function formatMs(value) {
  return `${value.toFixed(2)}ms`;
}

function summarizeProfile(events) {
  const totals = new Map();
  for (const event of events || []) {
    totals.set(event.name, (totals.get(event.name) || 0) + event.durationMs);
  }
  return [...totals.entries()].sort((a, b) => b[1] - a[1]);
}

function createScenario() {
  const rootDir = createTempWorkspace("litsx-bench-profile-");
  const srcDir = path.join(rootDir, "src");
  const componentsDir = path.join(srcDir, "components");
  fs.mkdirSync(componentsDir, { recursive: true });

  const tsconfigFile = path.join(rootDir, "tsconfig.json");
  writeJson(tsconfigFile, {
    compilerOptions: {
      target: "ESNext",
      module: "ESNext",
      moduleResolution: "Bundler",
      jsx: "preserve",
      allowJs: true,
      baseUrl: ".",
      paths: {
        "@/*": ["src/*"],
      },
    },
    include: ["src/**/*"],
  });

  fs.writeFileSync(
    path.join(componentsDir, "litsx-button.litsx"),
    [
      "export const LitsxButton = ({ label = '' }) => {",
      "  return <button>{label}</button>;",
      "};",
    ].join("\n"),
    "utf8",
  );

  fs.writeFileSync(
    path.join(srcDir, "deep-renderers.js"),
    [
      "import { LitsxButton } from '@/components/litsx-button.litsx';",
      "export const wrapHeader = () => renderHeader();",
      "function renderHeader() {",
      "  return <LitsxButton label='Bench' />;",
      "}",
    ].join("\n"),
    "utf8",
  );

  fs.writeFileSync(
    path.join(srcDir, "renderers.js"),
    ["export { wrapHeader } from './deep-renderers.js';"].join("\n"),
    "utf8",
  );

  const rootFile = path.join(srcDir, "demo.litsx");
  const source = [
    "import { wrapHeader } from './renderers.js';",
    "export const Demo = () => {",
    "  return <guide-card .header={wrapHeader} />;",
    "};",
  ].join("\n");
  fs.writeFileSync(rootFile, source, "utf8");

  return {
    rootDir,
    projectPath: tsconfigFile,
    filename: rootFile,
    source,
    cleanup() {
      cleanupTempWorkspace(rootDir);
    },
  };
}

function main() {
  const iterations = Number.parseInt(process.argv[2] || "10", 10);
  const scenario = createScenario();

  try {
    const session = createLitsxCompilationSession({
      projectPath: scenario.projectPath,
      transformOptions: {
        filename: scenario.filename,
        jsxTemplate: false,
      },
    });

    try {
      const coldStart = performance.now();
      const coldResult = session.transformSync(scenario.source, {
        filename: scenario.filename,
        jsxTemplate: false,
      });
      const coldMs = performance.now() - coldStart;

      let warmTotalMs = 0;
      const phaseTotals = new Map();
      for (let index = 0; index < iterations; index += 1) {
        const warmStart = performance.now();
        const result = session.transformSync(scenario.source, {
          filename: scenario.filename,
          jsxTemplate: false,
        });
        warmTotalMs += performance.now() - warmStart;
        for (const [name, durationMs] of summarizeProfile(result.metadata?.litsxProfile)) {
          phaseTotals.set(name, (phaseTotals.get(name) || 0) + durationMs);
        }
      }

      console.log("imported-renderer-alias-chain profile");
      console.log(`cold total: ${formatMs(coldMs)}`);
      console.log(`warm avg:   ${formatMs(warmTotalMs / iterations)}`);
      console.log("");
      console.log("cold phases:");
      for (const [name, durationMs] of summarizeProfile(coldResult.metadata?.litsxProfile)) {
        console.log(`  ${name.padEnd(18)} ${formatMs(durationMs)}`);
      }
      console.log("");
      console.log(`warm phase averages (${iterations} runs):`);
      for (const [name, totalMs] of [...phaseTotals.entries()].sort((a, b) => b[1] - a[1])) {
        console.log(`  ${name.padEnd(18)} ${formatMs(totalMs / iterations)}`);
      }
    } finally {
      session.dispose();
    }
  } finally {
    scenario.cleanup();
  }
}

main();
