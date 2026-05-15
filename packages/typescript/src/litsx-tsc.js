import { runLitsxTypecheck } from "./typecheck.js";

const exitCode = await runLitsxTypecheck(process.argv.slice(2));
process.exit(exitCode);
