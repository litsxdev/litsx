#!/usr/bin/env node

import { createProject } from "../src/index.js";

const args = process.argv.slice(2);
const targetDirArg = args.find((arg) => !arg.startsWith("--"));
const templateFlagIndex = args.findIndex((arg) => arg === "--template");
const template = templateFlagIndex >= 0 ? args[templateFlagIndex + 1] : undefined;
const visualTests = args.includes("--visual-tests");

if (!targetDirArg) {
  console.error("Usage: create-litsx-app <project-directory> [--template app|component|design-system] [--visual-tests]");
  process.exit(1);
}

try {
  const result = createProject(targetDirArg, { template, visualTests });
  console.log(`Created Litsx ${result.template} app in ${result.targetDir}${result.visualTests ? " with visual testing" : ""}`);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
