import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";
import ts from "typescript";
import createPlugin from "../../packages/typescript-plugin-litsx/src/index.js";

function formatMs(value) {
  return `${value.toFixed(2)}ms`;
}

function createTempWorkspace(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function cleanupTempWorkspace(directory) {
  fs.rmSync(directory, { recursive: true, force: true });
}

function summarizeProfile(events, namespace) {
  const totals = new Map();
  for (const event of events || []) {
    if (namespace && event.namespace !== namespace) {
      continue;
    }
    totals.set(event.name, (totals.get(event.name) || 0) + event.durationMs);
  }
  return [...totals.entries()].sort((a, b) => b[1] - a[1]);
}

function createScenario() {
  const rootDir = createTempWorkspace("litsx-bench-ls-");
  const demoFile = path.join(rootDir, "demo.tsx");
  const globalsFile = path.join(rootDir, "jsx-globals.d.ts");

  fs.writeFileSync(
    globalsFile,
    [
      "declare namespace JSX {",
      "  interface IntrinsicElements {",
      "    [elemName: string]: any;",
      "  }",
      "}",
    ].join("\n"),
    "utf8",
  );

  const source = [
    "const value = 'ready';",
    "function handleClick() {}",
    "function Demo() {",
    "  ^styles(`:host { display: block; }`);",
    "  return <button @click={handleClick} .value={value} ?disabled={false}>{value}</button>;",
    "}",
  ].join("\n");
  fs.writeFileSync(demoFile, source, "utf8");

  return {
    rootDir,
    demoFile,
    globalsFile,
    source,
    completionPos: source.indexOf(".value") + 2,
    cleanup() {
      cleanupTempWorkspace(rootDir);
    },
  };
}

function main() {
  const iterations = Number.parseInt(process.argv[2] || "10", 10);
  const scenario = createScenario();
  const fileVersions = new Map([
    [scenario.demoFile, "1"],
    [scenario.globalsFile, "1"],
  ]);

  try {
    const compilerOptions = {
      target: ts.ScriptTarget.ESNext,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      jsx: ts.JsxEmit.Preserve,
      noEmit: true,
      allowJs: true,
      types: [],
    };

    const host = {
      getCompilationSettings: () => compilerOptions,
      getScriptFileNames: () => [scenario.demoFile, scenario.globalsFile],
      getScriptVersion: (fileName) => fileVersions.get(fileName) || "1",
      getScriptSnapshot(fileName) {
        if (!fs.existsSync(fileName)) {
          return undefined;
        }
        return ts.ScriptSnapshot.fromString(fs.readFileSync(fileName, "utf8"));
      },
      getCurrentDirectory: () => scenario.rootDir,
      getDefaultLibFileName: (options) => ts.getDefaultLibFilePath(options),
      fileExists: fs.existsSync,
      readFile: (fileName) => fs.readFileSync(fileName, "utf8"),
      readDirectory: ts.sys.readDirectory,
      getDirectories: ts.sys.getDirectories,
      directoryExists: ts.sys.directoryExists,
      useCaseSensitiveFileNames: () => true,
      getNewLine: () => "\n",
      getScriptKind(fileName) {
        if (fileName.endsWith(".tsx")) {
          return ts.ScriptKind.TSX;
        }
        if (fileName.endsWith(".d.ts")) {
          return ts.ScriptKind.TS;
        }
        return undefined;
      },
    };

    const languageService = ts.createLanguageService(host);
    const pluginModule = createPlugin({ typescript: ts });
    const wrapped = pluginModule.create({
      languageService,
      languageServiceHost: host,
    });

    globalThis.__litsxProfileEvents = [];
    const coldDiagnosticsStart = performance.now();
    wrapped.getSemanticDiagnostics(scenario.demoFile);
    const coldDiagnosticsMs = performance.now() - coldDiagnosticsStart;
    const coldDiagnosticsProfile = [...(globalThis.__litsxProfileEvents || [])];

    let warmDiagnosticsTotalMs = 0;
    const warmDiagnosticsTotals = new Map();
    for (let index = 0; index < iterations; index += 1) {
      globalThis.__litsxProfileEvents = [];
      const start = performance.now();
      wrapped.getSemanticDiagnostics(scenario.demoFile);
      warmDiagnosticsTotalMs += performance.now() - start;
      for (const [name, durationMs] of summarizeProfile(globalThis.__litsxProfileEvents, "typescript-plugin")) {
        warmDiagnosticsTotals.set(name, (warmDiagnosticsTotals.get(name) || 0) + durationMs);
      }
    }

    globalThis.__litsxProfileEvents = [];
    const coldCompletionStart = performance.now();
    wrapped.getCompletionsAtPosition(scenario.demoFile, scenario.completionPos);
    const coldCompletionMs = performance.now() - coldCompletionStart;
    const coldCompletionProfile = [...(globalThis.__litsxProfileEvents || [])];

    let warmCompletionTotalMs = 0;
    const warmCompletionTotals = new Map();
    for (let index = 0; index < iterations; index += 1) {
      globalThis.__litsxProfileEvents = [];
      const start = performance.now();
      wrapped.getCompletionsAtPosition(scenario.demoFile, scenario.completionPos);
      warmCompletionTotalMs += performance.now() - start;
      for (const [name, durationMs] of summarizeProfile(globalThis.__litsxProfileEvents, "typescript-plugin")) {
        warmCompletionTotals.set(name, (warmCompletionTotals.get(name) || 0) + durationMs);
      }
    }

    console.log("typescript language service profile");
    console.log(`semantic cold: ${formatMs(coldDiagnosticsMs)}`);
    console.log(`semantic warm avg: ${formatMs(warmDiagnosticsTotalMs / iterations)}`);
    console.log(`completion cold: ${formatMs(coldCompletionMs)}`);
    console.log(`completion warm avg: ${formatMs(warmCompletionTotalMs / iterations)}`);
    console.log("");
    console.log("semantic cold plugin phases:");
    for (const [name, durationMs] of summarizeProfile(coldDiagnosticsProfile, "typescript-plugin")) {
      console.log(`  ${name.padEnd(22)} ${formatMs(durationMs)}`);
    }
    console.log("");
    console.log(`semantic warm plugin phase averages (${iterations} runs):`);
    for (const [name, totalMs] of [...warmDiagnosticsTotals.entries()].sort((a, b) => b[1] - a[1])) {
      console.log(`  ${name.padEnd(22)} ${formatMs(totalMs / iterations)}`);
    }
    console.log("");
    console.log("completion cold plugin phases:");
    for (const [name, durationMs] of summarizeProfile(coldCompletionProfile, "typescript-plugin")) {
      console.log(`  ${name.padEnd(22)} ${formatMs(durationMs)}`);
    }
    console.log("");
    console.log(`completion warm plugin phase averages (${iterations} runs):`);
    for (const [name, totalMs] of [...warmCompletionTotals.entries()].sort((a, b) => b[1] - a[1])) {
      console.log(`  ${name.padEnd(22)} ${formatMs(totalMs / iterations)}`);
    }
  } finally {
    scenario.cleanup();
  }
}

main();
