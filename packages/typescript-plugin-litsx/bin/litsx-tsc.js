#!/usr/bin/env node

let runLitsxTypecheck;

try {
  ({ runLitsxTypecheck } = await import("../dist/typecheck.js"));
} catch {
  ({ runLitsxTypecheck } = await import("../src/typecheck.js"));
}

const exitCode = await runLitsxTypecheck(process.argv.slice(2));
process.exit(exitCode);
