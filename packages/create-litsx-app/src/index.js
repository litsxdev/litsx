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
  plugins: [litsx({ sourceMaps: true })],
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
  files.set("public/title.svg", `<svg class="litsx-logo" width="144" height="40" viewBox="0 0 144 40" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="LitSX">
  <defs>
    <linearGradient id="sxGradient" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="40%" stop-color="#6a5cff"/>
      <stop offset="60%" stop-color="#ff3d77"/>
      <stop offset="75%" stop-color="#ff8a00"/>
    </linearGradient>
  </defs>
  <style>
    .litsx-wordmark {
      fill: #1a1a1a;
    }

    @media (prefers-color-scheme: dark) {
      .litsx-wordmark {
        fill: #f3f4f6;
      }
    }
  </style>

  <text
    class="litsx-wordmark"
    x="0"
    y="31"
    font-family="Montserrat, Inter, ui-sans-serif, system-ui, sans-serif"
    font-weight="800"
    font-size="34"
    letter-spacing="-0.045em">
    Lit
    <tspan
      dx="-4"
      dy="-13"
      font-size="18"
      letter-spacing="-0.02em"
      fill="url(#sxGradient)">
      sx
    </tspan>
  </text>
</svg>
`);
  files.set("public/litsx-wordmark.svg", `<svg width="210" height="64" viewBox="0 0 210 64" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="LitSX">
  <defs>
    <linearGradient id="flameGradient" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#ff8a00"/>
      <stop offset="50%" stop-color="#ff3d77"/>
      <stop offset="100%" stop-color="#6a5cff"/>
    </linearGradient>
    <linearGradient id="middleFlameGradient" x1="15%" y1="5%" x2="90%" y2="100%">
      <stop offset="0%" stop-color="#ffd166"/>
      <stop offset="55%" stop-color="#ff6b6b"/>
      <stop offset="100%" stop-color="#9b5cff"/>
    </linearGradient>
    <style>
      .litsx-wordmark-text {
        fill: #1a1a1a;
      }

      @media (prefers-color-scheme: dark) {
        .litsx-wordmark-text {
          fill: #f3f4f6;
        }
      }
    </style>
  </defs>
  <g transform="translate(2,8) scale(0.7)">
    <path
      d="M32 4 C38 14, 46 20, 46 34 C46 48, 38 58, 28 58 C18 58, 12 50, 12 40 C12 28, 20 20, 28 14 C30 10, 31 7, 32 4Z"
      fill="url(#flameGradient)"
    />
    <path
      d="M33 12 C37 19, 42 25, 42 35 C42 46, 35 54, 28 54 C21 54, 16 47, 16 39 C16 30, 23 24, 28 19 C31 16, 32 14, 33 12Z"
      fill="url(#middleFlameGradient)"
      opacity="0.72"
    />
    <path
      d="M32 20 C35 25, 38 30, 38 36 C38 44, 33 50, 28 50 C24 50, 21 46, 21 40 C21 33, 25 28, 29 24 C31 22, 31.5 21, 32 20Z"
      fill="white"
      fill-opacity="0.22"
    />
  </g>
  <text
    class="litsx-wordmark-text"
    x="44"
    y="42"
    font-family="Montserrat, sans-serif"
    font-weight="700"
    font-size="32"
    letter-spacing="-0.5"
  >
    Lit
    <tspan dx="-4" dy="-12" font-size="18">sx</tspan>
  </text>
</svg>
`);
  files.set("public/flame_512.png", fs.readFileSync(new URL("./assets/flame_512.png", import.meta.url)));
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
import { LitsxHero } from "./components/litsx-hero.litsx";

export const ${className} = () => {
  static styles = \`
    :host { display: block; }
    .shell {
      max-width: 960px;
      margin: 0 auto;
      padding: 28px 24px 104px;
      position: relative;
    }
    .counter {
      margin: 8px auto 0;
      max-width: 960px;
      padding: 0 30px;
    }
    .cta {
      border: 1px solid transparent;
      border-radius: 999px;
      padding: 12px 18px;
      background: linear-gradient(135deg, var(--color-text), #32405d);
      color: white;
      font: inherit;
      cursor: pointer;
      box-shadow: 0 18px 36px rgba(21, 32, 51, 0.18);
      transition: transform 160ms ease, box-shadow 160ms ease;
    }
    .cta:hover {
      transform: translateY(-1px);
      box-shadow: 0 22px 42px rgba(21, 32, 51, 0.22);
    }
  \`;

  const [count, setCount] = useState(0);

  return (
    <main class="shell">
      <LitsxHero
        eyebrow={"Authored web components"}
        tagline={"Web components with a sharper authoring experience. Less ceremony. More signal."}
        primaryLabel={"Getting Started"}
        secondaryLabel={"View on GitHub"}
      />
      <div class="counter">
        <button class="cta" @click={() => setCount((value) => value + 1)}>
          Count: {count}
        </button>
      </div>
    </main>
  );
};
`);
  files.set("src/components/litsx-button.litsx", `export const LitsxButton = ({
  type = "secondary",
  label = "",
}) => {
  static styles = \`
    :host { display: block; flex-shrink: 0; padding: 6px; }
    button {
      display: inline-block;
      border: 1px solid transparent;
      border-radius: 12px;
      min-width: 168px;
      min-height: 52px;
      padding: 0 20px;
      line-height: 52px;
      font-size: 14px;
      text-align: center;
      font-weight: 600;
      white-space: nowrap;
      color: #111827;
      background:
        linear-gradient(180deg, rgba(239, 242, 247, 0.98), rgba(222, 228, 236, 0.98));
      background-origin: border-box;
      box-shadow:
        inset 0 0 0 1px rgba(21, 32, 51, 0.16),
        inset 0 1px 0 rgba(255, 255, 255, 0.76),
        0 12px 28px rgba(21, 32, 51, 0.12);
      overflow: hidden;
      transition: transform 0.2s ease, box-shadow 0.2s ease, color 0.25s, border-color 0.25s, background-color 0.25s;
      font-family: var(--litsx-font-family-base);
      cursor: pointer;
    }
    button.primary {
      color: var(--litsx-button-brand-text);
      border-color: transparent;
      background-image: linear-gradient(135deg, var(--litsx-flame-a), var(--litsx-flame-b), var(--litsx-flame-c));
      background-origin: border-box;
      box-shadow: 0 14px 32px color-mix(in srgb, var(--litsx-c-brand-1) 28%, transparent);
    }
  \`;
  return <button class={type === "primary" ? "primary" : ""}>{label}</button>;
};
`);
  files.set("src/components/litsx-hero.litsx", `import { useEmit } from "@litsx/litsx";
import { LitsxButton } from "./litsx-button.litsx";

export const LitsxHero = ({
  eyebrow = "Authored web components",
  tagline = "Web components with a sharper authoring experience. Less ceremony. More signal.",
  primaryLabel = "Getting Started",
  secondaryLabel = "View on GitHub",
}) => {
  const emit = useEmit();
  static styles = \`
    :host {
      display: block;
    }

    .LitsxHero {
      padding: 48px 24px 48px;
    }

    .container {
      display: flex;
      flex-direction: column;
      margin: 0 auto;
      max-width: 1152px;
      text-align: center;
    }

    .main {
      position: relative;
      z-index: 10;
      order: 2;
      flex-grow: 1;
      flex-shrink: 0;
    }

    .eyebrow {
      margin: 0 0 18px;
      color: var(--litsx-c-text-2);
      font-family: var(--litsx-font-family-base);
      font-size: 14px;
      font-weight: 600;
      letter-spacing: 0.14em;
      text-transform: uppercase;
    }

    .heading {
      margin: 0;
      width: fit-content;
      margin: 0 auto;
    }

    .heading-mark {
      display: block;
      width: min(100%, 280px);
      height: auto;
    }

    .tagline {
      margin: 0 auto;
      padding-top: 8px;
      max-width: 392px;
      line-height: 28px;
      font-size: 18px;
      font-weight: 500;
      white-space: pre-wrap;
      color: var(--litsx-c-text-2);
      font-family: var(--litsx-font-family-base);
    }

    .actions {
      display: flex;
      flex-wrap: wrap;
      justify-content: center;
      margin: -6px;
      padding-top: 24px;
    }

    .image {
      order: 1;
      margin: -76px -24px -48px;
    }

    .image-container {
      position: relative;
      margin: 0 auto;
      width: 320px;
      height: 320px;
    }

    .image-bg {
      position: absolute;
      top: 50%;
      left: 50%;
      border-radius: 50%;
      width: 192px;
      height: 192px;
      background-image: var(--litsx-home-hero-image-background-image);
      filter: var(--litsx-home-hero-image-filter);
      transform: translate(-50%, -50%);
    }

    .image-src {
      position: absolute;
      top: 50%;
      left: 50%;
      max-width: 192px;
      max-height: 192px;
      transform: translate(-50%, -50%);
    }

    @media (min-width: 640px) {
      .LitsxHero {
        padding: 80px 48px 64px;
      }

      .heading-mark {
        width: min(100%, 360px);
      }

      .tagline {
        padding-top: 12px;
        max-width: 576px;
        line-height: 32px;
        font-size: 20px;
      }

      .actions {
        padding-top: 32px;
      }

      .image {
        margin: -108px -24px -48px;
      }

      .image-container {
        width: 392px;
        height: 392px;
      }

      .image-bg {
        width: 256px;
        height: 256px;
      }

      .image-src {
        max-width: 256px;
        max-height: 256px;
      }
    }

    @media (min-width: 960px) {
      .LitsxHero {
        padding: 80px 64px 64px;
      }

      .container {
        flex-direction: row;
      }

      .main {
        order: 1;
        width: calc((100% / 3) * 2);
        max-width: 592px;
      }

      .container,
      .tagline,
      .heading {
        text-align: left;
      }

      .heading {
        margin: 0;
      }

      .heading-mark {
        width: max(100%, 392px);
      }

      .tagline {
        margin: 0;
        line-height: 36px;
        font-size: 24px;
      }

      .actions {
        justify-content: flex-start;
      }

      .image {
        flex-grow: 1;
        order: 2;
        margin: 0;
        min-height: 100%;
      }

      .image-container {
        display: flex;
        justify-content: center;
        align-items: center;
        width: 100%;
        height: 100%;
        transform: translate(-32px, -32px);
      }

      .image-bg {
        width: 320px;
        height: 320px;
      }

      .image-src {
        max-width: 320px;
        max-height: 320px;
      }
    }
  \`);
  return (
    <section class="LitsxHero">
      <div class="container">
        <div class="main">
          <p class="eyebrow">{eyebrow}</p>
          <h1 class="heading">
            <img class="heading-mark" src="/title.svg" alt="LitSX" />
          </h1>
          <p class="tagline">{tagline}</p>
          <div class="actions">
            <LitsxButton
              type="primary"
              label={primaryLabel}
              @click={() => emit("primary-action")}
            />
            <LitsxButton
              type="secondary"
              label={secondaryLabel}
              @click={() => emit("secondary-action")}
            />
          </div>
        </div>
        <div class="image">
          <div class="image-container">
            <div class="image-bg"></div>
            <img class="image-src" src="/flame_512.png" alt="" />
          </div>
        </div>
      </div>
    </section>
  );
};
`);
  files.set("src/styles/tokens.css", `:root {
  --litsx-c-brand-1: #f05a28;
  --litsx-c-brand-2: #ff7446;
  --litsx-flame-a: #ff8a00;
  --litsx-flame-b: #ff3d77;
  --litsx-flame-c: #6a5cff;
  --litsx-button-brand-text: #fff7f2;
  --litsx-c-text-1: #152033;
  --litsx-c-text-2: rgba(21, 32, 51, 0.76);
  --litsx-font-family-base: "Inter", "Segoe UI", sans-serif;
  --litsx-home-hero-image-background-image:
    linear-gradient(135deg, rgba(255, 138, 0, 0.28), rgba(255, 61, 119, 0.22), rgba(106, 92, 255, 0.24));
  --litsx-home-hero-image-filter: blur(56px);
  --color-bg: #ffffff;
  --color-text: #152033;
  --font-body: "Inter", "Segoe UI", sans-serif;
}

body {
  margin: 0;
  min-height: 100vh;
  font-family: var(--font-body);
  background:
    radial-gradient(circle at top left, rgba(255, 255, 255, 0.74), transparent 24%),
    radial-gradient(circle at top right, rgba(203, 88, 33, 0.1), transparent 20%),
    linear-gradient(180deg, #ffffff 0%, var(--color-bg) 100%);
  background-repeat: no-repeat;
  background-size: cover;
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
- component-owned styling with \`static styles = ...\`
`);

  return files;
}

function createComponentProfileFiles(packageName, className) {
  const files = createBaseFiles(packageName, className, false);

  files.set(`src/${packageName}.litsx`, `import { LitsxHero } from "./components/litsx-hero.litsx";
import { StarterGuide } from "./components/starter-guide.litsx";

export const ${className} = () => {
  static styles = \`
    :host { display: block; }
    .shell {
      max-width: 960px;
      margin: 0 auto;
      padding-top: 28px;
      padding-bottom: 28px;
      position: relative;
    }
  \`;

  return (
    <main class="shell">
      <LitsxHero
        eyebrow={"Design system starter"}
        tagline={"Web components with a sharper authoring experience. Less ceremony. More signal."}
        primaryLabel={"Getting Started"}
        secondaryLabel={"View on GitHub"}
        @primary-action={() => {
          window.open("https://litsx.dev/getting-started", "_blank", "noopener,noreferrer");
        }}
        @secondary-action={() => {
          window.open("https://github.com/litsxdev/litsx", "_blank", "noopener,noreferrer");
        }}
      />
      <StarterGuide />
    </main>
  );
};
`);
  files.set("src/components/guide-card.litsx", `export const GuideCard = ({
  eyebrow = "",
  titleRenderer = null,
  contentRenderer = null,
}) => {
  static styles = \`
    :host { display: block; }
    .guide-card {
      padding: 24px;
      border: 1px solid rgba(21, 32, 51, 0.08);
      border-radius: 24px;
      background:
        linear-gradient(180deg, rgba(255, 255, 255, 0.78), transparent 140px),
        rgba(255, 250, 245, 0.96);
      box-shadow: 0 18px 48px rgba(21, 32, 51, 0.08);
      animation: guide-card-enter 280ms ease both;
    }
    .guide-card__eyebrow {
      margin: 0 0 10px;
      color: var(--litsx-c-text-2);
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.14em;
      text-transform: uppercase;
    }
    .guide-card h2 {
      margin: 0 0 12px;
      color: var(--litsx-c-text-1);
      font-family: var(--litsx-font-family-base);
      font-size: 1.25rem;
      font-weight: 700;
      letter-spacing: -0.02em;
      line-height: 1.2;
    }
    .guide-card p { margin: 0; color: var(--litsx-c-text-2); line-height: 1.65; }
    .guide-card a { color: var(--litsx-c-brand-1); text-decoration: none; font-weight: 600; }
    .guide-card a:hover { color: var(--litsx-c-brand-2); text-decoration: underline; }
    .guide-card ul { margin: 16px 0 0; padding-left: 18px; color: var(--litsx-c-text-2); line-height: 1.65; }
    .guide-card li + li { margin-top: 8px; }
    .guide-card code {
      border-radius: 8px;
      padding: 2px 8px;
      background: rgba(21, 32, 51, 0.06);
      color: var(--litsx-c-text-1);
      font-family: "SFMono-Regular", "SFMono-Regular", ui-monospace, monospace;
      font-size: 0.92em;
    }
    @keyframes guide-card-enter {
      from { opacity: 0; transform: translateY(14px); }
      to { opacity: 1; transform: translateY(0); }
    }
  \`;

  return (
    <article class="guide-card">
      <p class="guide-card__eyebrow">{eyebrow}</p>
      <h2>{titleRenderer()}</h2>
      {contentRenderer()}
    </article>
  );
};
`);
  files.set("src/components/litsx-button.litsx", `export const LitsxButton = ({
  type = "secondary",
  label = "",
}) => {
  static styles = \`
    :host { display: block; flex-shrink: 0; padding: 6px; }
    button {
      display: inline-block;
      border: 1px solid transparent;
      border-radius: 12px;
      min-width: 168px;
      min-height: 52px;
      padding: 0 20px;
      line-height: 52px;
      font-size: 14px;
      text-align: center;
      font-weight: 600;
      white-space: nowrap;
      color: #111827;
      background:
        linear-gradient(180deg, rgba(239, 242, 247, 0.98), rgba(222, 228, 236, 0.98));
      background-origin: border-box;
      box-shadow:
        inset 0 0 0 1px rgba(21, 32, 51, 0.16),
        inset 0 1px 0 rgba(255, 255, 255, 0.76),
        0 12px 28px rgba(21, 32, 51, 0.12);
      overflow: hidden;
      transition: transform 0.2s ease, box-shadow 0.2s ease, color 0.25s, border-color 0.25s, background-color 0.25s;
      font-family: var(--litsx-font-family-base);
      cursor: pointer;
    }
    button:hover {
      transform: scale(1.03);
      box-shadow:
        inset 0 0 0 1px rgba(21, 32, 51, 0.22),
        inset 0 1px 0 rgba(255, 255, 255, 0.95),
        0 16px 30px rgba(21, 32, 51, 0.12);
    }
    button:active {
      transform: scale(0.99);
      box-shadow:
        inset 0 0 0 1px rgba(21, 32, 51, 0.18),
        inset 0 2px 10px rgba(21, 32, 51, 0.12),
        0 8px 18px rgba(21, 32, 51, 0.06);
    }
    button.primary {
      color: var(--litsx-button-brand-text);
      border-color: transparent;
      background-image: linear-gradient(135deg, var(--litsx-flame-a), var(--litsx-flame-b), var(--litsx-flame-c));
      background-origin: border-box;
      box-shadow: 0 14px 32px color-mix(in srgb, var(--litsx-c-brand-1) 28%, transparent);
    }
    button.primary:hover {
      box-shadow: 0 18px 38px color-mix(in srgb, var(--litsx-c-brand-1) 32%, transparent);
    }
    button.primary:active {
      box-shadow:
        inset 0 2px 10px rgba(0, 0, 0, 0.18),
        0 10px 22px color-mix(in srgb, var(--litsx-c-brand-1) 18%, transparent);
    }
  \`;

  return <button class={type === "primary" ? "primary" : ""}>{label}</button>;
};
`);
  files.set("src/components/litsx-hero.litsx", `import { useEmit } from "@litsx/litsx";
import { LitsxButton } from "./litsx-button.litsx";

export const LitsxHero = ({
  eyebrow = "Authored web components",
  tagline = "Web components with a sharper authoring experience. Less ceremony. More signal.",
  primaryLabel = "Getting Started",
  secondaryLabel = "View on GitHub",
}) => {
  const emit = useEmit();

  static styles = \`
    :host {
      display: block;
    }

    .LitsxHero {
      padding: 48px 24px 48px;
    }

    .container {
      display: flex;
      flex-direction: column;
      margin: 0 auto;
      max-width: 1152px;
      text-align: center;
    }

    .main {
      position: relative;
      z-index: 10;
      order: 2;
      flex-grow: 1;
      flex-shrink: 0;
    }

    .eyebrow {
      margin: 0 0 18px;
      color: var(--litsx-c-text-2);
      font-family: var(--litsx-font-family-base);
      font-size: 14px;
      font-weight: 600;
      letter-spacing: 0.14em;
      text-transform: uppercase;
    }

    .heading {
      margin: 0;
      width: fit-content;
      margin: 0 auto;
    }

    .heading-mark {
      display: block;
      width: min(100%, 280px);
      height: auto;
    }

    .tagline {
      margin: 0 auto;
      padding-top: 8px;
      max-width: 392px;
      line-height: 28px;
      font-size: 18px;
      font-weight: 500;
      white-space: pre-wrap;
      color: var(--litsx-c-text-2);
      font-family: var(--litsx-font-family-base);
    }

    .actions {
      display: flex;
      flex-wrap: wrap;
      justify-content: center;
      margin: -6px;
      padding-top: 24px;
    }

    .image {
      order: 1;
      margin: -76px -24px -48px;
    }

    .image-container {
      position: relative;
      margin: 0 auto;
      width: 320px;
      height: 320px;
    }

    .image-bg {
      position: absolute;
      top: 50%;
      left: 50%;
      border-radius: 50%;
      width: 192px;
      height: 192px;
      background-image: var(--litsx-home-hero-image-background-image);
      filter: var(--litsx-home-hero-image-filter);
      transform: translate(-50%, -50%);
    }

    .image-src {
      position: absolute;
      top: 50%;
      left: 50%;
      max-width: 192px;
      max-height: 192px;
      transform: translate(-50%, -50%);
    }

    @media (min-width: 640px) {
      .LitsxHero {
        padding: 80px 48px 64px;
      }

      .heading-mark {
        width: min(100%, 360px);
      }

      .tagline {
        padding-top: 12px;
        max-width: 576px;
        line-height: 32px;
        font-size: 20px;
      }

      .actions {
        padding-top: 32px;
      }

      .image {
        margin: -108px -24px -48px;
      }

      .image-container {
        width: 392px;
        height: 392px;
      }

      .image-bg {
        width: 256px;
        height: 256px;
      }

      .image-src {
        max-width: 256px;
        max-height: 256px;
      }
    }

    @media (min-width: 960px) {
      .LitsxHero {
        padding: 80px 64px 64px;
      }

      .container {
        flex-direction: row;
      }

      .main {
        order: 1;
        width: calc((100% / 3) * 2);
        max-width: 592px;
      }

      .container,
      .tagline,
      .heading {
        text-align: left;
      }

      .heading {
        margin: 0;
      }

      .heading-mark {
        width: max(100%, 392px);
      }

      .tagline {
        margin: 0;
        line-height: 36px;
        font-size: 24px;
      }

      .actions {
        justify-content: flex-start;
      }

      .image {
        flex-grow: 1;
        order: 2;
        margin: 0;
        min-height: 100%;
      }

      .image-container {
        display: flex;
        justify-content: center;
        align-items: center;
        width: 100%;
        height: 100%;
        transform: translate(-32px, -32px);
      }

      .image-bg {
        width: 320px;
        height: 320px;
      }

      .image-src {
        max-width: 320px;
        max-height: 320px;
      }
    }
  \`);

  return (
    <section class="LitsxHero">
      <div class="container">
        <div class="main">
          <p class="eyebrow">{eyebrow}</p>
          <h1 class="heading"><img class="heading-mark" src="/title.svg" alt="LitSX" /></h1>
          <p class="tagline">{tagline}</p>
          <div class="actions">
            <LitsxButton type="primary" label={primaryLabel} @click={() => emit("primary-action")} />
            <LitsxButton type="secondary" label={secondaryLabel} @click={() => emit("secondary-action")} />
          </div>
        </div>
        <div class="image">
          <div class="image-container">
            <div class="image-bg"></div>
            <img class="image-src" src="/flame_512.png" alt="" />
          </div>
        </div>
      </div>
    </section>
  );
};
`);
  files.set("src/components/starter-guide.litsx", `import { SuspenseBoundary, SuspenseList, useOnConnect, useState } from "@litsx/litsx";
import { GuideCard } from "./guide-card.litsx";

const pendingSteps = new Map();

function createDeferred() {
  let resolve = null;
  const promise = new Promise((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}

function suspendUntil(stepIndex, revealedCount) {
  if (revealedCount > stepIndex) {
    return;
  }

  let pending = pendingSteps.get(stepIndex);
  if (!pending) {
    pending = createDeferred();
    pendingSteps.set(stepIndex, pending);
  }

  throw pending.promise;
}

export const StarterGuide = () => {
  const delays = [180, 220, 240];
  const [revealedCount, setRevealedCount] = useState(0);

  if (revealedCount > 0) {
    for (const [stepIndex, deferred] of pendingSteps) {
      if (stepIndex < revealedCount) {
        pendingSteps.delete(stepIndex);
        deferred.resolve?.();
      }
    }
  }

  useOnConnect(() => {
    const [firstDelay = 0, ...remainingDelays] = delays;
    let intervalId = null;

    const firstTimeoutId = setTimeout(() => {
      setRevealedCount((count) => count + 1);

      if (remainingDelays.length === 0) {
        return;
      }

      let intervalIndex = 0;
      intervalId = setInterval(() => {
        setRevealedCount((count) => count + 1);
        intervalIndex += 1;
        if (intervalIndex >= remainingDelays.length) {
          clearInterval(intervalId);
          intervalId = null;
        }
      }, remainingDelays[0]);
    }, firstDelay);

    return () => {
      clearTimeout(firstTimeoutId);
      if (intervalId != null) {
        clearInterval(intervalId);
      }
    };
  }, []);

  static styles = \`
    :host {
      display: block;
    }

    .guide {
      margin-top: 32px;
    }

    .guide-list {
      display: grid;
      gap: 18px;
    }

    @media (min-width: 860px) {
      .guide-list {
        grid-template-columns: repeat(3, minmax(0, 1fr));
      }
    }
  \`);

  return (
    <section class="guide" aria-label="Getting started with LitSX">
      <SuspenseList class="guide-list" reveal-order="forwards" tail="hidden">
        <SuspenseBoundary
          .fallbackRenderer={() => null}
          .contentRenderer={() => {
            suspendUntil(0, revealedCount);
            return (
              <GuideCard
                .eyebrow={"Getting started"}
                .titleRenderer={() => <><code>src/${packageName}.litsx</code>, then open <code>Getting Started</code></>}
                .contentRenderer={() => (
                  <p>
                    That host is the authored entry surface for the scaffold. Keep layout and flow there,
                    and move reusable UI into focused components under <code>src/components</code>. The
                    docs path to pair with that first edit is <a href="https://litsx.dev/" target="_blank" rel="noreferrer">the docs home</a>,
                    so the local files and the framework mental model line up immediately.
                  </p>
                )}
              />
            );
          }}
        />

        <SuspenseBoundary
          .fallbackRenderer={() => null}
          .contentRenderer={() => {
            suspendUntil(1, revealedCount);
            return (
              <GuideCard
                .eyebrow={"Authored model"}
                .titleRenderer={() => <>Read <code>Authored Model</code> while you learn LitSX bindings</>}
                .contentRenderer={() => (
                  <p>
                    Reach for <code>@click</code>, <code>.value</code>, <code>?disabled</code> and
                    <code> static styles = ...</code> directly in authored JSX so component intent stays close
                    to markup. The <a href="https://github.com/litsxdev/litsx" target="_blank" rel="noreferrer">repository overview</a> explains
                    why LitSX source is not just generic TSX with helper imports.
                  </p>
                )}
              />
            );
          }}
        />

        <SuspenseBoundary
          .fallbackRenderer={() => null}
          .contentRenderer={() => {
            suspendUntil(2, revealedCount);
            return (
              <GuideCard
                .eyebrow={"Tooling flow"}
                .titleRenderer={() => "Pair the tooling docs with your daily loop"}
                .contentRenderer={() => (
                  <ul>
                    <li><code>npm run dev</code> while reading the <a href="https://github.com/litsxdev/litsx/tree/main/packages/vite-plugin" target="_blank" rel="noreferrer">Vite plugin</a> package docs</li>
                    <li><code>npm run lint</code> next to the <a href="https://github.com/litsxdev/litsx/tree/main/packages/eslint-plugin-litsx" target="_blank" rel="noreferrer">ESLint plugin</a> package docs</li>
                    <li><code>npm run storybook</code> once the public surface is ready to document</li>
                    <li>Keep MDX docs close to stories under <code>src/stories</code></li>
                  </ul>
                )}
              />
            );
          }}
        />
      </SuspenseList>
    </section>
  );
};
`);
  files.set("src/styles/tokens.css", `:root {
  --litsx-c-brand-1: #f05a28;
  --litsx-c-brand-2: #ff7446;
  --litsx-flame-a: #ff8a00;
  --litsx-flame-b: #ff3d77;
  --litsx-flame-c: #6a5cff;
  --litsx-button-brand-text: #fff7f2;
  --litsx-c-text-1: #152033;
  --litsx-c-text-2: rgba(21, 32, 51, 0.76);
  --litsx-home-hero-image-background-image:
    linear-gradient(135deg, rgba(255, 138, 0, 0.28), rgba(255, 61, 119, 0.22), rgba(106, 92, 255, 0.24));
  --litsx-home-hero-image-filter: blur(56px);
  --color-bg: #ffffff;
  --color-text: #152033;
  --font-body: "Inter", "Segoe UI", sans-serif;
}

body {
  margin: 0;
  min-height: 100vh;
  font-family: var(--font-body);
  background:
    radial-gradient(circle at top left, rgba(255, 255, 255, 0.74), transparent 24%),
    radial-gradient(circle at top right, rgba(203, 88, 33, 0.1), transparent 20%),
    linear-gradient(180deg, #ffffff 0%, var(--color-bg) 100%);
  background-repeat: no-repeat;
  background-size: cover;
  color: var(--color-text);
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
- Shared hero, guide and button primitives without Storybook overhead
`);

  return files;
}

function createDesignSystemProfileFiles(packageName, className) {
  const files = createComponentProfileFiles(packageName, className);

  files.set(".storybook/main.js", `import { litsx } from "@litsx/vite-plugin";

export default {
  framework: "@storybook/web-components-vite",
  stories: ["../src/**/*.stories.@(js|jsx|litsx|mdx)", "../src/**/*.docs.mdx"],
  addons: ["@storybook/addon-docs", "@storybook/addon-a11y"],
  async viteFinal(config) {
    return {
      ...config,
      plugins: [...(config.plugins ?? []), litsx({ sourceMaps: true })],
    };
  },
};
`);
  files.set(".storybook/preview.js", `import "../src/styles/tokens.css";

export const parameters = {
  controls: { expanded: true },
  layout: "centered",
  docs: { toc: true },
};
`);
  files.set("src/stories/litsx-button.stories.litsx", `import { LitsxButton } from "../components/litsx-button.litsx";

const meta = {
  title: "Components/LitsxButton",
  render: ({ label = "View on GitHub", type = "secondary" } = {}) => (
    <LitsxButton .label={label} .type={type} />
  ),
};

export default meta;

export const Secondary = {
  args: { label: "View on GitHub", type: "secondary" },
};

export const Primary = {
  args: { label: "Getting Started", type: "primary" },
};
`);
  files.set("src/stories/litsx-hero.stories.litsx", `import { LitsxHero } from "../components/litsx-hero.litsx";

const meta = {
  title: "Marketing/LitsxHero",
  render: ({
    eyebrow = "Design system starter",
    tagline = "Web components with a sharper authoring experience. Less ceremony. More signal.",
    primaryLabel = "Getting Started",
    secondaryLabel = "View on GitHub",
  } = {}) => (
    <div style="max-width: 960px; margin: 0 auto;">
      <LitsxHero
        .eyebrow={eyebrow}
        .tagline={tagline}
        .primaryLabel={primaryLabel}
        .secondaryLabel={secondaryLabel}
      />
    </div>
  ),
};

export default meta;
export const Default = {};
`);
  files.set("src/stories/starter-guide.stories.litsx", `import { StarterGuide } from "../components/starter-guide.litsx";

const meta = {
  title: "Getting Started/StarterGuide",
  render: () => <StarterGuide />,
};

export default meta;
export const Default = {};
`);
  files.set("src/stories/starter-guide.docs.mdx", `import { Meta, Canvas } from "@storybook/blocks";
import * as StarterGuideStories from "./starter-guide.stories.litsx";

<Meta of={StarterGuideStories} />

# Starter Guide

The \`StarterGuide\` component demonstrates LitSX suspense primitives in a way that is useful to a new project owner: it reveals the first files, bindings and commands worth learning in a fresh scaffold.

<Canvas of={StarterGuideStories.Default} />

## What it shows

- ordered reveal with \`SuspenseList\`
- focused loading states with \`SuspenseBoundary\`
- component-owned styling with \`static styles = ...\`
- onboarding copy that points directly at the generated project structure
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
- Starter hero, guide and button primitives with matching stories
`);

  return files;
}

function createPackageJson(packageName, template, options = {}) {
  const packageJson = createBasePackageJson(packageName);

  if (template === "design-system") {
    packageJson.scripts.storybook = "storybook dev -p 6006";
    packageJson.scripts["build-storybook"] = "storybook build";
    Object.assign(packageJson.devDependencies, {
      "@storybook/addon-a11y": "^9.1.5",
      "@storybook/addon-docs": "^9.1.5",
      "@storybook/web-components-vite": "^9.1.5",
      "storybook": "^9.1.5",
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
    if (Buffer.isBuffer(contents)) {
      fs.writeFileSync(destination, contents);
    } else {
      fs.writeFileSync(destination, contents, "utf8");
    }
  }

  return {
    targetDir: absoluteTargetDir,
    packageName,
    className,
    template,
    visualTests,
  };
}
