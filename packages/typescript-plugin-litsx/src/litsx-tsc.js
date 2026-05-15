import { warnDeprecatedTypescriptPlugin } from "./deprecation.js";
import { runLitsxTypecheck } from "@litsx/typescript/typecheck";

warnDeprecatedTypescriptPlugin();
const exitCode = await runLitsxTypecheck(process.argv.slice(2));
process.exit(exitCode);
