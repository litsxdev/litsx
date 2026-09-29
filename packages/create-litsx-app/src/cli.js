import {
  createNextStepCommands,
  createProject,
  inferPackageManager,
  parseCliArgs,
} from "./index.js";

const args = process.argv.slice(2);
let parsed;

try {
  parsed = parseCliArgs(args);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

const {
  help: helpRequested,
  styling,
  targetDir: targetDirArg,
  template,
  visualTests,
} = parsed;

if (helpRequested || !targetDirArg) {
  console.error(
    "Usage: create-litsx-app <project-directory> [--template app|component|design-system|ssr] [--styles css|tailwind|unocss] [--visual-tests]",
  );
  process.exit(helpRequested ? 0 : 1);
}

try {
  const result = createProject(targetDirArg, {
    styling,
    template,
    visualTests,
  });
  const packageManager = inferPackageManager(process.env.npm_config_user_agent);
  console.log(
    `Created LitSX ${result.template} app with ${result.styling} styling in ${result.targetDir}${result.visualTests ? " with visual testing" : ""}`,
  );
  console.log("");
  console.log("Next steps:");
  for (const command of createNextStepCommands(targetDirArg, packageManager)) {
    console.log(`  ${command}`);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
