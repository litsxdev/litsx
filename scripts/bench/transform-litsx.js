import fs from "node:fs";
import path from "node:path";
import { performance } from "node:perf_hooks";
import babelCore from "@babel/core";
import parser from "../../packages/babel-parser-litsx/src/index.js";
import nativePreset from "../../packages/babel-preset-litsx/src/index.js";

const { transformFromAstSync } = babelCore;

const fixtureDir = path.resolve("test/fixtures/transform-litsx-types");

const inlineCases = [
  {
    name: "inline-simple",
    source: `
      type ButtonProps = {
        label: string;
        count: number;
      };

      export function Button(props: ButtonProps) {
        return <button>{props.label} {props.count}</button>;
      }
    `,
  },
  {
    name: "inline-utility-types",
    source: `
      type BaseProps = {
        title: string;
        active: boolean;
        payload: Record<string, unknown>;
        onSelect: (id: string) => void;
      };

      type CardProps =
        Pick<BaseProps, "title" | "active"> &
        Partial<Pick<BaseProps, "payload">> &
        Required<Pick<BaseProps, "onSelect">>;

      export function Card(props: CardProps) {
        staticProps<CardProps>({
          active: { reflect: true },
          payload: { attribute: false },
          onSelect: { attribute: false },
        });

        return <article>{props.title}</article>;
      }
    `,
  },
];

const fixtureCases = [
  "shared-card.tsx",
  "resource-card.tsx",
  "project-grid.tsx",
  "fallback-panel.tsx",
].map((filename) => {
  const filePath = path.join(fixtureDir, filename);
  return {
    name: `fixture:${filename}`,
    filename: filePath,
    source: fs.readFileSync(filePath, "utf8"),
  };
});

const cases = [...inlineCases, ...fixtureCases];

function parseSource(source) {
  return parser.parse(source, {
    sourceType: "module",
    plugins: ["typescript"],
  });
}

function runTransform({ source, filename }) {
  const inputAst = parseSource(source);
  return transformFromAstSync(inputAst, source, {
    configFile: false,
    babelrc: false,
    filename,
    presets: [[nativePreset, { jsxTemplate: false }]],
  });
}

function formatMs(value) {
  return `${value.toFixed(2)}ms`;
}

function measureCase(testCase, iterations) {
  const coldStart = performance.now();
  runTransform(testCase);
  const coldMs = performance.now() - coldStart;

  const hotStart = performance.now();
  for (let index = 0; index < iterations; index += 1) {
    runTransform(testCase);
  }
  const hotMs = performance.now() - hotStart;

  return {
    name: testCase.name,
    coldMs,
    hotTotalMs: hotMs,
    hotAvgMs: hotMs / iterations,
  };
}

function printResults(results, iterations) {
  console.log(`transform-litsx benchmark (${iterations} hot iterations per case)`);
  console.log("");
  results.forEach((result) => {
    console.log(
      [
        result.name.padEnd(28),
        `cold ${formatMs(result.coldMs)}`.padEnd(18),
        `hot avg ${formatMs(result.hotAvgMs)}`.padEnd(22),
        `hot total ${formatMs(result.hotTotalMs)}`,
      ].join("  ")
    );
  });

  const aggregate = results.reduce(
    (acc, result) => {
      acc.coldMs += result.coldMs;
      acc.hotTotalMs += result.hotTotalMs;
      return acc;
    },
    { coldMs: 0, hotTotalMs: 0 }
  );

  console.log("");
  console.log(
    [
      "aggregate".padEnd(28),
      `cold ${formatMs(aggregate.coldMs)}`.padEnd(18),
      `hot avg ${formatMs(aggregate.hotTotalMs / (results.length * iterations))}`.padEnd(22),
      `hot total ${formatMs(aggregate.hotTotalMs)}`,
    ].join("  ")
  );
}

function measureBatch(testCases, iterations) {
  const coldStart = performance.now();
  for (const testCase of testCases) {
    runTransform(testCase);
  }
  const coldMs = performance.now() - coldStart;

  const hotStart = performance.now();
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    for (const testCase of testCases) {
      runTransform(testCase);
    }
  }
  const hotMs = performance.now() - hotStart;

  return {
    files: testCases.length,
    coldMs,
    hotTotalMs: hotMs,
    hotAvgPerFileMs: hotMs / (testCases.length * iterations),
    hotAvgPerBatchMs: hotMs / iterations,
  };
}

const iterations = Number.parseInt(process.argv[2] || "10", 10);
const mode = process.argv[3] || "all";

if (mode === "single" || mode === "all") {
  const results = cases.map((testCase) => measureCase(testCase, iterations));
  printResults(results, iterations);
}

if (mode === "batch" || mode === "all") {
  if (mode === "all") {
    console.log("");
  }
  const batch = measureBatch(cases, iterations);
  console.log(`batch benchmark (${batch.files} files per iteration)`);
  console.log(
    [
      "batch".padEnd(28),
      `cold ${formatMs(batch.coldMs)}`.padEnd(18),
      `hot/file ${formatMs(batch.hotAvgPerFileMs)}`.padEnd(22),
      `hot/batch ${formatMs(batch.hotAvgPerBatchMs)}`,
    ].join("  ")
  );
}
