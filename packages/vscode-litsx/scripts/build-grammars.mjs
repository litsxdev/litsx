import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

import {
  litsxJsxLanguage,
  litsxTsxLanguage,
} from "@litsx/shiki-languages";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const syntaxesDir = path.resolve(__dirname, "../syntaxes");

fs.mkdirSync(syntaxesDir, { recursive: true });
fs.writeFileSync(
  path.join(syntaxesDir, "litsx-jsx.tmLanguage.json"),
  `${JSON.stringify(litsxJsxLanguage, null, 2)}\n`,
);
fs.writeFileSync(
  path.join(syntaxesDir, "litsx.tmLanguage.json"),
  `${JSON.stringify(litsxTsxLanguage, null, 2)}\n`,
);
