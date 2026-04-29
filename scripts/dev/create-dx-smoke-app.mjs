import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

import { createProject } from "../../packages/create-litsx-app/src/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "../..");
const targetDir = path.join(rootDir, "packages", "dx-smoke-app");
const packageName = "dx-smoke-app";
const className = "DxSmokeApp";

function createTsxSmokeSource() {
  return `import { useState } from "litsx";

export const ${className} = ({ title = "Hello LitSX" }: { title?: string }) => {
  ^styles(\`
    :host {
      display: block;
    }

    .shell {
      max-width: 840px;
      margin: 0 auto;
      padding: 48px 24px 96px;
    }

    .cta {
      margin-top: 24px;
      border: 0;
      border-radius: 999px;
      padding: 12px 18px;
      background: #1f2937;
      color: white;
      font: inherit;
      cursor: pointer;
    }
  \`);

  const [count, setCount] = useState(0);

  return (
    <main class="shell">
      <h1>{title}</h1>
      <button class="cta" @click={() => setCount((value) => value + 1)}>
        Count: {count}
      </button>
      <input .valuee={count} />
      <button @clcik={() => setCount((value) => value + 1)} />
      <button ?disbled={count > 3} />
    </main>
  );
};
`;
}

function createJsxSmokeSource() {
  return `import { useState } from "litsx";

export const ${className}Jsx = ({ title = "Hello LitSX" }) => {
  ^styles(\`
    :host {
      display: block;
    }

    .shell {
      max-width: 840px;
      margin: 0 auto;
      padding: 48px 24px 96px;
    }

    .cta {
      margin-top: 24px;
      border: 0;
      border-radius: 999px;
      padding: 12px 18px;
      background: #1f2937;
      color: white;
      font: inherit;
      cursor: pointer;
    }
  \`);

  const [count, setCount] = useState(0);

  return (
    <main class="shell">
      <h1>{title}</h1>
      <button class="cta" @click={() => setCount((value) => value + 1)}>
        Count: {count}
      </button>
      <input .valuee={count} />
      <button @clcik={() => setCount((value) => value + 1)} />
      <button ?disbled={count > 3} />
    </main>
  );
};
`;
}

if (fs.existsSync(targetDir)) {
  const entries = fs.readdirSync(targetDir);
  if (entries.length > 0) {
    console.error(`Smoke app already exists at ${targetDir}`);
    process.exit(1);
  }
}

const result = createProject(targetDir, {
  template: "app",
  localWorkspacePackages: true,
});

const srcDir = path.join(targetDir, "src");
const litsxPath = path.join(srcDir, `${packageName}.litsx`);
const litsxJsxPath = path.join(srcDir, `${packageName}.litsx.jsx`);
const tsxPath = path.join(srcDir, `${packageName}.tsx`);
const jsxPath = path.join(srcDir, `${packageName}-jsx.jsx`);
const legacyJsxPath = path.join(srcDir, `${packageName}.jsx`);
const mainPath = path.join(srcDir, "main.js");

if (fs.existsSync(legacyJsxPath)) {
  fs.renameSync(legacyJsxPath, jsxPath);
}

fs.writeFileSync(litsxPath, createTsxSmokeSource());
fs.writeFileSync(litsxJsxPath, createJsxSmokeSource());
fs.writeFileSync(tsxPath, createTsxSmokeSource());
fs.writeFileSync(jsxPath, createJsxSmokeSource());
fs.writeFileSync(mainPath, `import { ${className} } from "./${packageName}.litsx";
import "./styles/tokens.css";

customElements.define("app-root", /** @type {any} */ (${className}));

document.querySelector("#app").innerHTML = "<app-root></app-root>";
`);

console.log(`Created workspace smoke app at ${result.targetDir}`);
console.log("");
console.log("Try:");
console.log("  yarn workspace dx-smoke-app dev");
console.log("  yarn workspace dx-smoke-app lint");
console.log("  yarn workspace dx-smoke-app typecheck");
console.log("  open src/*.litsx and src/*.litsx.jsx in VS Code for authored grammar inspection");
