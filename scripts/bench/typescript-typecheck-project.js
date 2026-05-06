import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";
import {
  createLitsxTypecheckSession,
  runLitsxTypecheck,
} from "../../packages/typescript-plugin-litsx/src/typecheck.js";

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function formatMs(value) {
  return `${value.toFixed(2)}ms`;
}

function createTempWorkspace(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function cleanupTempWorkspace(directory) {
  fs.rmSync(directory, { recursive: true, force: true });
}

function summarizeProfile(events) {
  const totals = new Map();
  for (const event of events || []) {
    totals.set(event.name, (totals.get(event.name) || 0) + event.durationMs);
  }
  return [...totals.entries()].sort((a, b) => b[1] - a[1]);
}

function createScenario() {
  const rootDir = createTempWorkspace("litsx-bench-typecheck-");
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
      noEmit: true,
      baseUrl: ".",
      paths: {
        "@/*": ["src/*"],
      },
      types: [],
      ignoreDeprecations: "6.0",
    },
    include: ["src/**/*"],
  });

  fs.writeFileSync(
    path.join(srcDir, "jsx-globals.d.ts"),
    [
      "declare namespace JSX {",
      "  interface IntrinsicElements {",
      "    [elemName: string]: any;",
      "  }",
      "}",
    ].join("\n"),
    "utf8",
  );

  fs.writeFileSync(
    path.join(componentsDir, "litsx-button.tsx"),
    [
      "export const LitsxButton = ({ label = '' }: { label?: string }) => {",
      "  return <button>{label}</button>;",
      "};",
    ].join("\n"),
    "utf8",
  );

  fs.writeFileSync(
    path.join(srcDir, "deep-renderers.js"),
    [
      "import { LitsxButton } from '@/components/litsx-button';",
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

  fs.writeFileSync(
    path.join(srcDir, "guide-card.tsx"),
    [
      "export const GuideCard = ({ header }: { header: () => any }) => {",
      "  return <section>{header()}</section>;",
      "};",
    ].join("\n"),
    "utf8",
  );

  fs.writeFileSync(
    path.join(srcDir, "demo.tsx"),
    [
      "import { GuideCard } from './guide-card';",
      "import { wrapHeader } from './renderers.js';",
      "export const Demo = () => {",
      "  return <GuideCard header={wrapHeader} />;",
      "};",
    ].join("\n"),
    "utf8",
  );

  return {
    rootDir,
    projectPath: tsconfigFile,
    cleanup() {
      cleanupTempWorkspace(rootDir);
    },
  };
}

function main() {
  const iterations = Number.parseInt(process.argv[2] || "5", 10);
  const scenario = createScenario();
  const rawArgs = ["--project", scenario.projectPath];
  globalThis.__litsxProfileEvents = [];

  try {
    const createStart = performance.now();
    const session = createLitsxTypecheckSession(rawArgs);
    const createMs = performance.now() - createStart;

    try {
      globalThis.__litsxProfileEvents = [];
      const coldStart = performance.now();
      const coldExitCode = runLitsxTypecheck(session);
      const coldMs = performance.now() - coldStart;
      const coldProfile = [...(globalThis.__litsxProfileEvents || [])];

      if (coldExitCode !== 0) {
        throw new Error(`Expected successful typecheck, got exit code ${coldExitCode}`);
      }

      let warmTotalMs = 0;
      const phaseTotals = new Map();
      for (let index = 0; index < iterations; index += 1) {
        globalThis.__litsxProfileEvents = [];
        const warmStart = performance.now();
        const exitCode = runLitsxTypecheck(session);
        warmTotalMs += performance.now() - warmStart;
        if (exitCode !== 0) {
          throw new Error(`Expected successful warm typecheck, got exit code ${exitCode}`);
        }
        for (const [name, durationMs] of summarizeProfile(globalThis.__litsxProfileEvents)) {
          phaseTotals.set(name, (phaseTotals.get(name) || 0) + durationMs);
        }
      }

      console.log("typescript project typecheck profile");
      console.log(`session create: ${formatMs(createMs)}`);
      console.log(`cold total:     ${formatMs(coldMs)}`);
      console.log(`warm avg:       ${formatMs(warmTotalMs / iterations)}`);
      console.log("");
      console.log("cold phases:");
      for (const [name, durationMs] of summarizeProfile(coldProfile)) {
        console.log(`  ${name.padEnd(22)} ${formatMs(durationMs)}`);
      }
      console.log("");
      console.log(`warm phase averages (${iterations} runs):`);
      for (const [name, totalMs] of [...phaseTotals.entries()].sort((a, b) => b[1] - a[1])) {
        console.log(`  ${name.padEnd(22)} ${formatMs(totalMs / iterations)}`);
      }
    } finally {
      session.projectSession?.dispose?.();
    }
  } finally {
    scenario.cleanup();
  }
}

main();
