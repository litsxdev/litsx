#!/usr/bin/env node

import fs from 'fs';
import parser from "../src/index.mjs";

const filename = process.argv[2];
if (!filename) {
  console.error("no filename specified");
} else {
  const file = fs.readFileSync(filename, "utf8");
  const ast = parser.parse(file);

  console.log(JSON.stringify(ast, null, "  "));
}
