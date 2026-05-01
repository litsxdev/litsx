import fs from "node:fs";
import parser from "./index.mjs";

const filename = process.argv[2];

if (!filename) {
  console.error("no filename specified");
  process.exit(1);
}

const file = fs.readFileSync(filename, "utf8");
const ast = parser.parse(file);

console.log(JSON.stringify(ast, null, "  "));
