#!/usr/bin/env node
import { runLitsxTypecheck } from "../src/typecheck.js";

const exitCode = await runLitsxTypecheck(process.argv.slice(2));
process.exit(exitCode);
