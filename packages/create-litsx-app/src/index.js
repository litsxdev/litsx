import fs from "fs";
import path from "path";
import { publishedPackageVersions } from "./published-package-versions.js";

const LOCAL_WORKSPACE_PACKAGE_NAMES = [
  "@litsx/litsx",
  "@litsx/eslint-plugin",
  "prettier-plugin-litsx",
  "@litsx/typescript-plugin",
  "@litsx/vite-plugin",
];
export function inferPackageManager(userAgent = "") {
  if (typeof userAgent !== "string" || userAgent.length === 0) {
    return "npm";
  }

  if (userAgent.startsWith("pnpm/")) {
    return "pnpm";
  }

  if (userAgent.startsWith("yarn/")) {
    return "yarn";
  }

  return "npm";
}

export function createNextStepCommands(targetDir, packageManager = "npm") {
  const installCommand = packageManager === "yarn"
    ? "yarn"
    : `${packageManager} install`;

  const runCommand = packageManager === "yarn"
    ? "yarn"
    : `${packageManager} run`;

  return [
    `cd ${targetDir}`,
    installCommand,
    `${runCommand} dev`,
    `${runCommand} lint`,
    `${runCommand} typecheck`,
  ];
}

export function applyLocalWorkspaceOverrides(packageJson) {
  for (const dependencyField of ["dependencies", "devDependencies"]) {
    const dependencies = packageJson[dependencyField];
    if (!dependencies) continue;

    for (const packageName of LOCAL_WORKSPACE_PACKAGE_NAMES) {
      if (packageName in dependencies) {
        dependencies[packageName] = "workspace:^";
      }
    }
  }

  return packageJson;
}

function toPackageName(input) {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "litsx-app";
}

function toClassName(input) {
  return input
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map((segment) => segment[0].toUpperCase() + segment.slice(1))
    .join("") || "AppRoot";
}

function createBasePackageJson(packageName) {
  return {
    name: packageName,
    private: true,
    version: "0.0.0",
    type: "module",
    scripts: {
      dev: "vite",
      build: "vite build",
      lint: "eslint .",
      format: "prettier --write .",
      typecheck: "litsx-tsc -p jsconfig.json --noEmit",
      preview: "vite preview",
    },
    dependencies: {
      "@webcomponents/scoped-custom-element-registry": "^0.0.10",
      "lit": "^3.2.1",
      "@litsx/litsx": publishedPackageVersions["@litsx/litsx"],
    },
    devDependencies: {
      "@litsx/eslint-plugin": publishedPackageVersions["@litsx/eslint-plugin"],
      "@litsx/typescript-plugin": publishedPackageVersions["@litsx/typescript-plugin"],
      "@litsx/vite-plugin": publishedPackageVersions["@litsx/vite-plugin"],
      "eslint": "^9.0.0",
      "prettier": "^3.8.3",
      "prettier-plugin-litsx": publishedPackageVersions["prettier-plugin-litsx"],
      "typescript": "^6.0.0",
      "vite": "^8.0.3"
    }
  };
}

function addVisualTestingPackageBits(packageJson) {
  packageJson.scripts["test:visual"] = "playwright test";
  packageJson.scripts["test:visual:update"] = "playwright test --update-snapshots";
  packageJson.scripts["storybook:static"] = "storybook build";
  packageJson.devDependencies["@playwright/test"] = "^1.54.1";
}

function addVisualTestingFiles(files) {
  files.set("playwright.config.js", `import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/visual",
  fullyParallel: false,
  retries: process.env.CI ? 2 : 0,
  reporter: [["html", { open: "never" }]],
  use: {
    baseURL: "http://127.0.0.1:6006",
    trace: "on-first-retry",
    locale: "en-US",
    timezoneId: "UTC",
    colorScheme: "light",
    reducedMotion: "reduce",
    viewport: { width: 1440, height: 960 },
  },
  webServer: {
    command: "npm run storybook",
    url: "http://127.0.0.1:6006",
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
`);
  files.set("tests/visual/storybook.spec.js", `import { expect, test } from "@playwright/test";

test.describe("storybook visual smoke", () => {
  test("status pill story stays stable", async ({ page }) => {
    await page.goto("/?path=/story/components-statuspill--default");
    await page.waitForLoadState("networkidle");
    await expect(page.locator("#storybook-root")).toHaveScreenshot("status-pill-default.png");
  });
});
`);
  files.set("Dockerfile.visual", `FROM mcr.microsoft.com/playwright:v1.54.1-jammy

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install

COPY . .

ENV CI=1
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
ENV TZ=UTC

CMD ["npm", "run", "test:visual"]
`);
  files.set(".dockerignore", `node_modules
dist
storybook-static
playwright-report
test-results
`);
}

function createBaseFiles(packageName, className, includeStorybook) {
  const files = new Map();

  files.set("package.json", "");
  files.set("jsconfig.json", `{
  "compilerOptions": {
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "allowJs": true,
    "allowArbitraryExtensions": true,
    "checkJs": true,
    "jsx": "react-jsx",
    "jsxImportSource": "@litsx/litsx",
    "plugins": [
      {
        "name": "@litsx/typescript-plugin"
      }
    ]
  },
  "include": ${JSON.stringify(includeStorybook ? ["src", ".storybook"] : ["src"], null, 2)}
}
`);
  files.set("index.html", `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${packageName}</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.js"></script>
  </body>
</html>
`);
  files.set("vite.config.js", `import { litsx } from "@litsx/vite-plugin";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [litsx()],
});
`);
  files.set("eslint.config.js", `import litsx from "@litsx/eslint-plugin";

export default [
  litsx.configs["recommended-flat"],
];
`);
  files.set("prettier.config.js", `export default {
  plugins: ["prettier-plugin-litsx"],
  overrides: [
    {
      files: "*.litsx",
      options: {
        parser: "litsx",
      },
    },
    {
      files: "*.litsx.jsx",
      options: {
        parser: "litsx-jsx",
      },
    },
  ],
};
`);
  files.set(".vscode/settings.json", `{
  "js/ts.tsdk.path": "node_modules/typescript/lib",
  "typescript.tsserver.useSeparateSyntaxServer": false
}
`);
  files.set("src/main.js", `import "@webcomponents/scoped-custom-element-registry";
import { ${className} } from "./${packageName}.litsx";
import "./styles/tokens.css";

customElements.define("app-root", ${className});

document.querySelector("#app").innerHTML = "<app-root></app-root>";
`);

  return files;
}

function createAppProfileFiles(packageName, className) {
  const files = createBaseFiles(packageName, className, false);

  files.set(`src/${packageName}.litsx`, `import { useState } from "@litsx/litsx";

export const ${className} = ({ title = "Hello LitSX" }) => {
  ^styles(\`
    :host {
      display: block;
    }

    .shell {
      max-width: 840px;
      margin: 0 auto;
      padding: 56px 24px 104px;
      position: relative;
    }

    .shell::before {
      content: "";
      position: absolute;
      inset: 24px 0 auto;
      height: 1px;
      background: linear-gradient(90deg, transparent, var(--color-line), transparent);
    }

    .title {
      margin: 0;
      font-size: clamp(2.25rem, 4vw, 3.25rem);
      line-height: 0.94;
      letter-spacing: -0.06em;
      text-transform: uppercase;
      font-family: var(--font-display);
    }

    .lede {
      margin: 16px 0 0;
      max-width: 34rem;
      color: rgba(27, 34, 48, 0.76);
      font-size: 1.08rem;
      line-height: 1.6;
    }

    .cta {
      margin-top: 28px;
      border: 1px solid transparent;
      border-radius: 999px;
      padding: 12px 18px;
      background: linear-gradient(135deg, var(--color-text), #2f3c54);
      color: white;
      font: inherit;
      cursor: pointer;
      box-shadow: 0 18px 36px rgba(27, 34, 48, 0.18);
      transition: transform 160ms ease, box-shadow 160ms ease;
    }

    .cta:hover {
      transform: translateY(-1px);
      box-shadow: 0 22px 42px rgba(27, 34, 48, 0.22);
    }
  \`);

  const [count, setCount] = useState(0);

  return (
    <main class="shell">
      <h1 class="title">{title}</h1>
      <p class="lede">
        Edit <code>src/${packageName}.litsx</code> and click the button to confirm
        authored LitSX is running.
      </p>
      <button class="cta" @click={() => setCount((value) => value + 1)}>
        Count: {count}
      </button>
    </main>
  );
};
`);
  files.set("src/styles/tokens.css", `:root {
  --color-bg: #f3ede3;
  --color-bg-deep: #e4d7c3;
  --color-text: #1b2230;
  --color-panel: rgba(255, 249, 240, 0.88);
  --color-line: rgba(27, 34, 48, 0.12);
  --color-accent: #9e4b1f;
  --color-accent-soft: rgba(158, 75, 31, 0.14);
  --radius-panel: 28px;
  --shadow-panel: 0 28px 80px rgba(27, 34, 48, 0.12);
  --font-display: "Avenir Next Condensed", "Franklin Gothic Medium", "Arial Narrow", sans-serif;
  --font-body: "Inter", "Segoe UI", sans-serif;
}

body {
  margin: 0;
  font-family: var(--font-body);
  background:
    radial-gradient(circle at top left, rgba(255, 255, 255, 0.7), transparent 26%),
    radial-gradient(circle at top right, rgba(158, 75, 31, 0.18), transparent 22%),
    linear-gradient(180deg, var(--color-bg) 0%, var(--color-bg-deep) 100%);
  color: var(--color-text);
}
`);
  files.set("README.md", `# ${packageName}

Generated with \`create-litsx-app --template app\`.

## First Run

1. \`npm install\`
2. \`npm run dev\`
3. Open the local Vite URL and edit \`src/${packageName}.litsx\`

## Scripts

- \`npm run dev\`
- \`npm run build\`
- \`npm run lint\`
- \`npm run format\`
- \`npm run typecheck\`
- \`npm run preview\`

## What This Template Shows

- authored LitSX JSX
- \`@click\` event binding
- local state with \`useState(...)\`
- component-owned styling with \`^styles(...)\`
`);

  return files;
}

function createComponentProfileFiles(packageName, className) {
  const files = createBaseFiles(packageName, className, false);

  files.set(`src/${packageName}.litsx`, `import { StatusPill } from "./components/status-pill.litsx";
import { ButtonCard } from "./components/button-card.litsx";

export const ${className} = ({ title = "LitSX Components" }) => {
  return (
    <main class="shell">
      <header>
        <h1>{title}</h1>
        <StatusPill .label={"preview"} ?active={true} tone={"positive"} />
      </header>

      <ButtonCard
        .title={"Component Library"}
        .description={"A starter surface for reusable LitSX web components."}
      />
    </main>
  );
};
`);
  files.set("src/components/status-pill.litsx", `export const StatusPill = ({ label = "idle", active = false, tone = "neutral" }) => {
  return (
    <span class="status-pill" ?data-active={active} data-tone={tone}>
      {label}
    </span>
  );
};
`);
  files.set("src/components/button-card.litsx", `export const ButtonCard = ({
  title = "Component",
  description = "A reusable LitSX primitive.",
}) => {
  return (
    <article class="button-card">
      <h2>{title}</h2>
      <p>{description}</p>
      <button class="button-card__cta" @click={() => console.log(title)}>
        Inspect component
      </button>
    </article>
  );
};
`);
  files.set("src/styles/tokens.css", `:root {
  --color-bg: #efe5d4;
  --color-surface: rgba(255, 249, 239, 0.9);
  --color-surface-strong: #fffdf9;
  --color-text: #182033;
  --color-border: rgba(24, 32, 51, 0.12);
  --color-positive: #1d7b54;
  --color-warning: #b16124;
  --color-neutral: #6a7282;
  --color-accent: #c5531b;
  --radius-pill: 999px;
  --radius-panel: 24px;
  --shadow-panel: 0 24px 60px rgba(24, 32, 51, 0.12);
  --font-display: "Avenir Next Condensed", "Franklin Gothic Medium", "Arial Narrow", sans-serif;
  --font-body: "Inter", "Segoe UI", sans-serif;
}

body {
  margin: 0;
  font-family: var(--font-body);
  background:
    radial-gradient(circle at top left, rgba(255, 255, 255, 0.72), transparent 24%),
    radial-gradient(circle at top right, rgba(197, 83, 27, 0.18), transparent 18%),
    linear-gradient(180deg, #f6f0e6 0%, var(--color-bg) 100%);
  color: var(--color-text);
}

.shell {
  max-width: 960px;
  margin: 0 auto;
  padding: 56px 24px 104px;
}

.shell h1,
.button-card h2 {
  font-family: var(--font-display);
  letter-spacing: -0.05em;
  text-transform: uppercase;
}

.shell > header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 32px;
}

.status-pill {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 14px;
  border-radius: var(--radius-pill);
  border: 1px solid var(--color-border);
  background: rgba(255, 253, 249, 0.88);
  color: var(--color-neutral);
  font-size: 0.875rem;
  text-transform: uppercase;
  letter-spacing: 0.12em;
}

.status-pill[data-tone="positive"] {
  color: var(--color-positive);
}

.status-pill[data-tone="warning"] {
  color: var(--color-warning);
}

.button-card {
  padding: 30px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-panel);
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.72), transparent 120px),
    var(--color-surface);
  box-shadow: var(--shadow-panel);
  position: relative;
  overflow: hidden;
}

.button-card::after {
  content: "";
  position: absolute;
  inset: 0 auto auto 0;
  width: 84px;
  height: 4px;
  background: linear-gradient(90deg, var(--color-accent), transparent);
}

.button-card h2 {
  margin: 0 0 10px;
}

.button-card p {
  margin: 0 0 18px;
  max-width: 38ch;
  color: rgba(24, 32, 51, 0.72);
  line-height: 1.6;
}

.button-card__cta {
  border: 1px solid rgba(24, 32, 51, 0.08);
  border-radius: 999px;
  background: linear-gradient(135deg, var(--color-text), #303b55);
  color: white;
  padding: 12px 18px;
  font: inherit;
  cursor: pointer;
  box-shadow: 0 14px 28px rgba(24, 32, 51, 0.16);
}
`);
  files.set("README.md", `# ${packageName}

Generated with \`create-litsx-app --template component\`.

## Scripts

- \`npm run dev\`
- \`npm run build\`
- \`npm run lint\`
- \`npm run format\`
- \`npm run preview\`

## Included

- LitSX + Lit runtime
- Official \`@litsx/vite-plugin\` integration for authored LitSX source
- Official \`@litsx/eslint-plugin\` linting preset
- A starter component-library structure under \`src/components\`
- Shared tokens CSS for design-system work without Storybook overhead
`);

  return files;
}

function createDesignSystemProfileFiles(packageName, className) {
  const files = createBaseFiles(packageName, className, true);

  files.set(".storybook/main.js", `import { litsx } from "@litsx/vite-plugin";

export default {
  framework: "@storybook/web-components-vite",
  stories: ["../src/**/*.stories.@(js|jsx|litsx|mdx)", "../src/**/*.docs.mdx"],
  addons: [
    "@storybook/addon-essentials",
    "@storybook/addon-docs",
    "@storybook/addon-a11y"
  ],
  async viteFinal(config) {
    return {
      ...config,
      plugins: [...(config.plugins ?? []), litsx()],
    };
  },
};
`);
  files.set(".storybook/preview.js", `import "../src/styles/tokens.css";

export const parameters = {
  controls: {
    expanded: true,
  },
  layout: "centered",
  docs: {
    toc: true,
  },
};
`);
  files.set(`src/${packageName}.litsx`, `import { SuspenseBoundary } from "@litsx/litsx";
import { StatusPill } from "./components/status-pill.litsx";
import { ButtonCard } from "./components/button-card.litsx";

export const ${className} = ({ title = "LitSX" }) => {
  return (
    <main class="shell">
      <header>
        <h1>{title}</h1>
        <StatusPill .label={"ready"} ?active={true} />
      </header>

      <ButtonCard
        .title={"Design System"}
        .description={"Reusable web components with LitSX-authored JSX."}
      />

      <SuspenseBoundary
        fallback={<p>Loading boundary…</p>}
        contentRenderer={() => <p>Boundary ready.</p>}
      />

      <button @click={() => console.log("hello from litsx")}>
        Click me
      </button>
    </main>
  );
};
`);
  files.set("src/components/status-pill.litsx", `export const StatusPill = ({ label = "idle", active = false, tone = "neutral" }) => {
  return (
    <span class="status-pill" ?data-active={active} data-tone={tone}>
      {label}
    </span>
  );
};
`);
  files.set("src/components/button-card.litsx", `export const ButtonCard = ({
  title = "Component",
  description = "A documented LitSX building block.",
}) => {
  return (
    <article class="button-card">
      <h2>{title}</h2>
      <p>{description}</p>
      <button class="button-card__cta" @click={() => console.log(title)}>
        Inspect component
      </button>
    </article>
  );
};
`);
  files.set("src/stories/status-pill.stories.litsx", `import { StatusPill } from "../components/status-pill.litsx";

const meta = {
  title: "Components/StatusPill",
  render: (args) => (
    <StatusPill
      label={args.label}
      active={args.active}
      tone={args.tone}
    />
  ),
  args: {
    label: "Ready",
    active: true,
    tone: "positive",
  },
  argTypes: {
    tone: {
      control: "select",
      options: ["neutral", "positive", "warning"],
    },
  },
};

export default meta;

export const Default = {};

export const Warning = {
  args: {
    label: "Degraded",
    tone: "warning",
  },
};
`);
  files.set("src/stories/status-pill.docs.mdx", `import { Meta, Canvas, Controls } from "@storybook/blocks";
import * as StatusPillStories from "./status-pill.stories.litsx";

<Meta of={StatusPillStories} />

# Status Pill

The \`StatusPill\` component is a compact semantic label for system state. It is authored in LitSX JSX, rendered as a web component, and documented with Storybook MDX.

<Canvas of={StatusPillStories.Default} />

## Design Notes

- Uses authored LitSX bindings such as \`?active\`
- Fits design-system surfaces like dashboards, forms and navigation rails
- Works well as a lightweight token-driven primitive

<Controls of={StatusPillStories.Default} />
`);
  files.set("src/styles/tokens.css", `:root {
  --color-bg: #efe3cf;
  --color-surface: rgba(255, 251, 245, 0.92);
  --color-surface-strong: #fffdf8;
  --color-text: #152033;
  --color-border: rgba(21, 32, 51, 0.14);
  --color-positive: #1f7a4d;
  --color-warning: #b66324;
  --color-neutral: #6b7280;
  --color-accent: #cb5821;
  --color-accent-soft: rgba(203, 88, 33, 0.14);
  --radius-pill: 999px;
  --radius-panel: 24px;
  --shadow-panel: 0 26px 70px rgba(20, 33, 61, 0.12);
  --font-display: "Avenir Next Condensed", "Franklin Gothic Medium", "Arial Narrow", sans-serif;
  --font-body: "Inter", "Segoe UI", sans-serif;
}

body {
  margin: 0;
  font-family: var(--font-body);
  background:
    radial-gradient(circle at top left, rgba(255, 255, 255, 0.74), transparent 24%),
    radial-gradient(circle at top right, rgba(203, 88, 33, 0.2), transparent 20%),
    linear-gradient(180deg, #f7f0e6 0%, var(--color-bg) 100%);
  color: var(--color-text);
}

.shell {
  max-width: 960px;
  margin: 0 auto;
  padding: 56px 24px 104px;
  position: relative;
}

.shell::before {
  content: "";
  position: absolute;
  inset: 20px 24px auto;
  height: 1px;
  background: linear-gradient(90deg, transparent, var(--color-border), transparent);
}

.shell > header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 36px;
  flex-wrap: wrap;
}

.shell h1,
.button-card h2 {
  font-family: var(--font-display);
  letter-spacing: -0.06em;
  text-transform: uppercase;
}

.shell h1 {
  margin: 0;
  font-size: clamp(2.8rem, 6vw, 4.8rem);
  line-height: 0.92;
}

.status-pill {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 14px;
  border-radius: var(--radius-pill);
  border: 1px solid var(--color-border);
  background: rgba(255, 253, 248, 0.92);
  color: var(--color-neutral);
  font-size: 0.875rem;
  text-transform: uppercase;
  letter-spacing: 0.12em;
}

.status-pill[data-tone="positive"] {
  color: var(--color-positive);
}

.status-pill[data-tone="warning"] {
  color: var(--color-warning);
}

.status-pill[data-active] {
  box-shadow: 0 0 0 4px rgba(31, 122, 77, 0.08);
}

.button-card {
  padding: 32px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-panel);
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.72), transparent 120px),
    var(--color-surface);
  box-shadow: var(--shadow-panel);
  margin-bottom: 28px;
  position: relative;
  overflow: hidden;
}

.button-card::after {
  content: "";
  position: absolute;
  inset: 0 auto auto 0;
  width: 120px;
  height: 4px;
  background: linear-gradient(90deg, var(--color-accent), transparent);
}

.button-card h2 {
  margin: 0 0 10px;
}

.button-card p {
  margin: 0 0 18px;
  max-width: 40ch;
  color: rgba(21, 32, 51, 0.74);
  line-height: 1.6;
}

.button-card__cta {
  border: 1px solid rgba(21, 32, 51, 0.08);
  border-radius: 999px;
  background: linear-gradient(135deg, var(--color-text), #32405d);
  color: white;
  padding: 12px 18px;
  font: inherit;
  cursor: pointer;
  box-shadow: 0 14px 28px rgba(20, 33, 61, 0.18);
}

.shell > button {
  border: 1px solid rgba(21, 32, 51, 0.08);
  border-radius: 999px;
  background: var(--color-surface-strong);
  color: var(--color-text);
  padding: 12px 18px;
  font: inherit;
  cursor: pointer;
}
`);
  files.set("README.md", `# ${packageName}

Generated with \`create-litsx-app --template design-system\`.

## Scripts

- \`npm run dev\`
- \`npm run build\`
- \`npm run lint\`
- \`npm run format\`
- \`npm run preview\`
- \`npm run storybook\`
- \`npm run build-storybook\`

## Included

- LitSX + Lit runtime
- Official \`@litsx/vite-plugin\` integration for authored LitSX source
- Official \`@litsx/eslint-plugin\` linting preset
- Storybook for web components with MDX docs
- A starter design-system component and story
`);

  return files;
}

function createPackageJson(packageName, template, options = {}) {
  const packageJson = createBasePackageJson(packageName);

  if (template === "design-system") {
    packageJson.scripts.storybook = "storybook dev -p 6006";
    packageJson.scripts["build-storybook"] = "storybook build";
    Object.assign(packageJson.devDependencies, {
      "@storybook/addon-a11y": "^8.6.14",
      "@storybook/addon-docs": "^8.6.14",
      "@storybook/addon-essentials": "^8.6.14",
      "@storybook/web-components-vite": "^8.6.14",
      "storybook": "^8.6.14",
    });
  }

  if (options.visualTests) {
    addVisualTestingPackageBits(packageJson);
  }

  return packageJson;
}

export function renderProjectFiles(targetDir, options = {}) {
  const template = options.template ?? "design-system";
  const visualTests = Boolean(options.visualTests);

  if (!["app", "component", "design-system"].includes(template)) {
    throw new Error(`Unknown template "${template}". Expected "app", "component" or "design-system".`);
  }

  const packageName = toPackageName(path.basename(targetDir));
  const className = toClassName(packageName);
  const packageJson = createPackageJson(packageName, template, { visualTests });
  if (options.localWorkspacePackages) {
    applyLocalWorkspaceOverrides(packageJson);
  }
  const files = template === "app"
    ? createAppProfileFiles(packageName, className)
    : template === "component"
      ? createComponentProfileFiles(packageName, className)
      : createDesignSystemProfileFiles(packageName, className);

  if (visualTests) {
    addVisualTestingFiles(files);
  }

  files.set("package.json", `${JSON.stringify(packageJson, null, 2)}\n`);

  return {
    packageName,
    className,
    template,
    visualTests,
    files,
  };
}

export function createProject(targetDir, options = {}) {
  const absoluteTargetDir = path.resolve(targetDir);

  if (fs.existsSync(absoluteTargetDir)) {
    const entries = fs.readdirSync(absoluteTargetDir);
    if (entries.length > 0) {
      throw new Error(`Target directory is not empty: ${absoluteTargetDir}`);
    }
  } else {
    fs.mkdirSync(absoluteTargetDir, { recursive: true });
  }

  const { files, packageName, className, template, visualTests } = renderProjectFiles(absoluteTargetDir, options);

  for (const [relativePath, contents] of files) {
    const destination = path.join(absoluteTargetDir, relativePath);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.writeFileSync(destination, contents, "utf8");
  }

  return {
    targetDir: absoluteTargetDir,
    packageName,
    className,
    template,
    visualTests,
  };
}
