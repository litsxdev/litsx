import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";
import {
  createLitsxCompilationSession,
  transformLitsxSync,
} from "../../packages/compiler/src/index.js";

function formatMs(value) {
  return `${value.toFixed(2)}ms`;
}

function measure(fn) {
  const start = performance.now();
  const result = fn();
  const durationMs = performance.now() - start;
  return { result, durationMs };
}

function measureRepeated(iterations, fn) {
  const start = performance.now();
  for (let index = 0; index < iterations; index += 1) {
    fn(index);
  }
  const totalMs = performance.now() - start;
  return {
    totalMs,
    avgMs: totalMs / iterations,
  };
}

function createTempWorkspace(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function cleanupTempWorkspace(directory) {
  fs.rmSync(directory, { recursive: true, force: true });
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function createSimpleScenario() {
  return {
    name: "simple-jsx",
    filename: "/virtual/Simple.litsx",
    source: [
      "export const Simple = ({ label = 'Save' }) => {",
      "  return <button class=\"cta\" @click={save}>{label}</button>;",
      "};",
    ].join("\n"),
    options: {
      filename: "/virtual/Simple.litsx",
      jsxTemplate: false,
    },
  };
}

function createTypedScenario() {
  return {
    name: "typed-props",
    filename: "/virtual/Typed.litsx",
    source: [
      "type ButtonProps = {",
      "  label: string;",
      "  disabled?: boolean;",
      "};",
      "",
      "export const TypedButton = (props: ButtonProps) => {",
      "  return <button ?disabled={props.disabled}>{props.label}</button>;",
      "};",
    ].join("\n"),
    options: {
      filename: "/virtual/Typed.litsx",
      jsxTemplate: false,
    },
  };
}

function createImportedRendererScenario() {
  const rootDir = createTempWorkspace("litsx-bench-compiler-");
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

  const buttonFile = path.join(componentsDir, "litsx-button.litsx");
  fs.writeFileSync(
    buttonFile,
    [
      "export const LitsxButton = ({ label = '' }) => {",
      "  return <button>{label}</button>;",
      "};",
    ].join("\n"),
    "utf8"
  );

  const deepFile = path.join(srcDir, "deep-renderers.js");
  fs.writeFileSync(
    deepFile,
    [
      "import { LitsxButton } from '@/components/litsx-button.litsx';",
      "export const wrapHeader = () => renderHeader();",
      "function renderHeader() {",
      "  return <LitsxButton label='Bench' />;",
      "}",
    ].join("\n"),
    "utf8"
  );

  const helperFile = path.join(srcDir, "renderers.js");
  fs.writeFileSync(
    helperFile,
    [
      "export { wrapHeader } from './deep-renderers.js';",
    ].join("\n"),
    "utf8"
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
    name: "imported-renderer-alias-chain",
    requiresProjectSession: true,
    filename: rootFile,
    source,
    options: {
      filename: rootFile,
      jsxTemplate: false,
    },
    cleanup() {
      cleanupTempWorkspace(rootDir);
    },
  };
}

function runStandaloneScenario(scenario, iterations) {
  if (scenario.requiresProjectSession) {
    return null;
  }

  const cold = measure(() => transformLitsxSync(scenario.source, scenario.options));
  const warm = measureRepeated(iterations, () => {
    transformLitsxSync(scenario.source, scenario.options);
  });

  return {
    coldMs: cold.durationMs,
    warmAvgMs: warm.avgMs,
    warmTotalMs: warm.totalMs,
  };
}

function runSessionScenario(scenario, iterations) {
  const projectPath = scenario.options.filename && fs.existsSync(scenario.options.filename)
    ? path.join(path.dirname(path.dirname(scenario.options.filename)), "tsconfig.json")
    : undefined;
  const created = measure(() => createLitsxCompilationSession({
    projectPath,
    transformOptions: {
      filename: scenario.options.filename,
      jsxTemplate: scenario.options.jsxTemplate,
    },
  }));
  const session = created.result;

  try {
    const cold = measure(() => session.transformSync(scenario.source, scenario.options));
    const warm = measureRepeated(iterations, () => {
      session.transformSync(scenario.source, scenario.options);
    });
    return {
      createSessionMs: created.durationMs,
      coldMs: cold.durationMs,
      totalFirstUseMs: created.durationMs + cold.durationMs,
      warmAvgMs: warm.avgMs,
      warmTotalMs: warm.totalMs,
    };
  } finally {
    session.dispose();
  }
}

function printScenarioResult(name, standalone, sharedSession) {
  console.log(name);
  if (standalone) {
    console.log(`  standalone cold      ${formatMs(standalone.coldMs)}`);
    console.log(`  standalone warm avg  ${formatMs(standalone.warmAvgMs)}`);
  } else {
    console.log("  standalone cold      n/a (requires project session)");
    console.log("  standalone warm avg  n/a (requires project session)");
  }
  console.log(`  session create       ${formatMs(sharedSession.createSessionMs)}`);
  console.log(`  session first use    ${formatMs(sharedSession.totalFirstUseMs)}`);
  console.log(`  session cold         ${formatMs(sharedSession.coldMs)}`);
  console.log(`  session warm avg     ${formatMs(sharedSession.warmAvgMs)}`);
  console.log("");
}

function main() {
  const iterations = Number.parseInt(process.argv[2] || "10", 10);
  const scenarios = [
    createSimpleScenario(),
    createTypedScenario(),
    createImportedRendererScenario(),
  ];

  console.log(`compiler benchmark (${iterations} warm iterations)`);
  console.log("");

  try {
    for (const scenario of scenarios) {
      const standalone = runStandaloneScenario(scenario, iterations);
      const sharedSession = runSessionScenario(scenario, iterations);
      printScenarioResult(scenario.name, standalone, sharedSession);
    }
  } finally {
    scenarios.forEach((scenario) => scenario.cleanup?.());
  }
}

main();
