import fs from "fs";
import path from "path";

const LOCAL_WORKSPACE_PACKAGE_NAMES = [
  "litsx",
  "@litsx/eslint-plugin",
  "prettier-plugin-litsx",
  "@litsx/typescript-plugin",
  "@litsx/vite-plugin",
];

const PUBLISHED_PACKAGE_VERSIONS = {
  "litsx": "^0.1.0",
  "@litsx/eslint-plugin": "^0.1.0",
  "@litsx/typescript-plugin": "^0.1.0",
  "@litsx/vite-plugin": "^0.1.0",
  "prettier-plugin-litsx": "^0.1.0"
};
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
      "@open-wc/scoped-elements": "^3.0.0",
      "lit": "^3.2.1",
      "litsx": PUBLISHED_PACKAGE_VERSIONS.litsx,
    },
    devDependencies: {
      "@litsx/eslint-plugin": PUBLISHED_PACKAGE_VERSIONS["@litsx/eslint-plugin"],
      "@litsx/typescript-plugin": PUBLISHED_PACKAGE_VERSIONS["@litsx/typescript-plugin"],
      "@litsx/vite-plugin": PUBLISHED_PACKAGE_VERSIONS["@litsx/vite-plugin"],
      "eslint": "^9.0.0",
      "prettier": "^3.8.3",
      "prettier-plugin-litsx": PUBLISHED_PACKAGE_VERSIONS["prettier-plugin-litsx"],
      "typescript": "^5.9.3",
      "vite": "^7.3.2"
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
    "jsxImportSource": "litsx",
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
  files.set("src/main.js", `import { ${className} } from "./${packageName}.litsx";
import "./styles/tokens.css";

customElements.define("app-root", ${className});

document.querySelector("#app").innerHTML = "<app-root></app-root>";
`);

  return files;
}

function createAppProfileFiles(packageName, className) {
  const files = createBaseFiles(packageName, className, false);

  files.set(`src/${packageName}.litsx`, `import { useState } from "litsx";

export const ${className} = ({ title = "Hello LitSX" }) => {
  ^styles(\`
    :host {
      display: block;
    }

    .shell {
      max-width: 840px;
      margin: 0 auto;
      padding: 48px 24px 96px;
    }

    .title {
      margin: 0;
      font-size: clamp(2.25rem, 4vw, 3.25rem);
      line-height: 1;
      letter-spacing: -0.04em;
    }

    .lede {
      margin: 16px 0 0;
      max-width: 34rem;
      color: #4b5563;
      font-size: 1.05rem;
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
  --color-bg: #f5efe4;
  --color-text: #1f2937;
  --color-panel: #fffaf2;
  --color-accent: #8c3d1f;
  --radius-panel: 24px;
}

body {
  margin: 0;
  font-family: "Inter", "Segoe UI", sans-serif;
  background: linear-gradient(180deg, #fcf8f2 0%, #f1e7d8 100%);
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

export const ${className} = ({ title = "Litsx Components" }) => {
  return (
    <main class="shell">
      <header>
        <h1>{title}</h1>
        <StatusPill .label={"preview"} ?active={true} tone={"positive"} />
      </header>

      <ButtonCard
        .title={"Component Library"}
        .description={"A starter surface for reusable Litsx web components."}
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
  description = "A reusable Litsx primitive.",
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
  --color-bg: #f7f0e4;
  --color-surface: #fffaf2;
  --color-text: #1b263b;
  --color-border: #d9c7a7;
  --color-positive: #1f7a4d;
  --color-warning: #a35a1a;
  --color-neutral: #6b7280;
  --radius-pill: 999px;
  --radius-panel: 20px;
  --shadow-panel: 0 16px 40px rgba(27, 38, 59, 0.08);
}

body {
  margin: 0;
  font-family: "Inter", "Segoe UI", sans-serif;
  background: linear-gradient(180deg, #fcf8f2 0%, #f1e7d8 100%);
  color: var(--color-text);
}

.shell {
  max-width: 920px;
  margin: 0 auto;
  padding: 48px 24px 96px;
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
  background: rgba(255, 250, 242, 0.92);
  color: var(--color-neutral);
  font-size: 0.875rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.status-pill[data-tone="positive"] {
  color: var(--color-positive);
}

.status-pill[data-tone="warning"] {
  color: var(--color-warning);
}

.button-card {
  padding: 28px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-panel);
  background: var(--color-surface);
  box-shadow: var(--shadow-panel);
}

.button-card__cta {
  border: 0;
  border-radius: 999px;
  background: var(--color-text);
  color: white;
  padding: 12px 18px;
  font: inherit;
  cursor: pointer;
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

- Litsx + Lit runtime
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
  files.set(`src/${packageName}.litsx`, `import { SuspenseBoundary } from "litsx";
import { StatusPill } from "./components/status-pill.litsx";
import { ButtonCard } from "./components/button-card.litsx";

export const ${className} = ({ title = "Litsx" }) => {
  return (
    <main class="shell">
      <header>
        <h1>{title}</h1>
        <StatusPill .label={"ready"} ?active={true} />
      </header>

      <ButtonCard
        .title={"Design System"}
        .description={"Reusable web components with Litsx-authored JSX."}
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
  description = "A documented Litsx building block.",
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

The \`StatusPill\` component is a compact semantic label for system state. It is authored in Litsx JSX, rendered as a web component, and documented with Storybook MDX.

<Canvas of={StatusPillStories.Default} />

## Design Notes

- Uses authored Litsx bindings such as \`?active\`
- Fits design-system surfaces like dashboards, forms and navigation rails
- Works well as a lightweight token-driven primitive

<Controls of={StatusPillStories.Default} />
`);
  files.set("src/styles/tokens.css", `:root {
  --color-bg: #f6f2e8;
  --color-surface: #fffaf0;
  --color-text: #14213d;
  --color-border: #d7c5a4;
  --color-positive: #1f7a4d;
  --color-warning: #a35a1a;
  --color-neutral: #6b7280;
  --radius-pill: 999px;
  --radius-panel: 20px;
  --shadow-panel: 0 18px 50px rgba(20, 33, 61, 0.08);
  --font-display: "Iowan Old Style", "Palatino Linotype", serif;
  --font-body: "Inter", "Segoe UI", sans-serif;
}

body {
  margin: 0;
  font-family: var(--font-body);
  background:
    radial-gradient(circle at top, rgba(214, 181, 120, 0.25), transparent 32%),
    linear-gradient(180deg, #fbf7ef 0%, #f3ede2 100%);
  color: var(--color-text);
}

.shell {
  max-width: 960px;
  margin: 0 auto;
  padding: 48px 24px 96px;
}

.shell > header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 32px;
}

.shell h1,
.button-card h2 {
  font-family: var(--font-display);
  letter-spacing: -0.03em;
}

.status-pill {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 14px;
  border-radius: var(--radius-pill);
  border: 1px solid var(--color-border);
  background: rgba(255, 250, 240, 0.92);
  color: var(--color-neutral);
  font-size: 0.875rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
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
  padding: 28px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-panel);
  background: var(--color-surface);
  box-shadow: var(--shadow-panel);
  margin-bottom: 28px;
}

.button-card__cta {
  border: 0;
  border-radius: 999px;
  background: var(--color-text);
  color: white;
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

- Litsx + Lit runtime
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
