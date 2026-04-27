#!/usr/bin/env node

import {
  createNextStepCommands,
  createProject,
  inferPackageManager,
} from "../src/index.js";

const args = process.argv.slice(2);
const helpRequested = args.includes("--help") || args.includes("-h");
const targetDirArg = args.find((arg) => !arg.startsWith("--"));
const templateFlagIndex = args.findIndex((arg) => arg === "--template");
const template = templateFlagIndex >= 0 ? args[templateFlagIndex + 1] : undefined;
const visualTests = args.includes("--visual-tests");

if (helpRequested || !targetDirArg) {
  console.error("Usage: create-litsx-app <project-directory> [--template app|component|design-system] [--visual-tests]");
  process.exit(helpRequested ? 0 : 1);
}

try {
  const result = createProject(targetDirArg, { template, visualTests });
  const packageManager = inferPackageManager(process.env.npm_config_user_agent);
  console.log(`Created Litsx ${result.template} app in ${result.targetDir}${result.visualTests ? " with visual testing" : ""}`);
  console.log("");
  console.log("Next steps:");
  for (const command of createNextStepCommands(targetDirArg, packageManager)) {
    console.log(`  ${command}`);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
