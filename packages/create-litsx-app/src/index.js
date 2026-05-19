import fs from "fs";
import path from "path";
import { publishedPackageVersions } from "./published-package-versions.js";

const LOCAL_WORKSPACE_PACKAGE_NAMES = [
  "@litsx/compiler",
  "@litsx/core",
  "@litsx/eslint-plugin",
  "@litsx/ssr",
  "@litsx/ssr-client",
  "prettier-plugin-litsx",
  "@litsx/typescript",
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
      test: "vitest run",
      "test:watch": "vitest",
      lint: "eslint .",
      format: "prettier --write .",
      typecheck: "litsx-tsc -p jsconfig.json --noEmit",
      preview: "vite preview",
    },
    dependencies: {
      "@webcomponents/scoped-custom-element-registry": "^0.0.10",
      "lit": "^3.2.1",
      "@litsx/core": publishedPackageVersions["@litsx/core"],
    },
    devDependencies: {
      "@litsx/eslint-plugin": publishedPackageVersions["@litsx/eslint-plugin"],
      "@litsx/typescript": publishedPackageVersions["@litsx/typescript"],
      "@litsx/vite-plugin": publishedPackageVersions["@litsx/vite-plugin"],
      "@vitest/browser": "^4.1.5",
      "@vitest/browser-playwright": "^4.1.5",
      "eslint": "^9.0.0",
      "playwright": "^1.54.1",
      "prettier": "^3.8.3",
      "prettier-plugin-litsx": publishedPackageVersions["prettier-plugin-litsx"],
      "typescript": "^6.0.0",
      "vite": "^8.0.3",
      "vitest": "^4.1.5"
    }
  };
}

function createSsrPackageJson(packageName) {
  const packageJson = createBasePackageJson(packageName);

  packageJson.scripts.dev = "node dev.mjs";
  packageJson.scripts.build = "node render.mjs";
  packageJson.scripts.render = "node render.mjs";
  delete packageJson.scripts.preview;

  Object.assign(packageJson.dependencies, {
    "@litsx/ssr": publishedPackageVersions["@litsx/ssr"],
    "@litsx/ssr-client": publishedPackageVersions["@litsx/ssr-client"],
  });

  Object.assign(packageJson.devDependencies, {
    "@lit-labs/ssr": "^4.0.0",
    "@litsx/compiler": publishedPackageVersions["@litsx/compiler"],
  });

  return packageJson;
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
    "jsxImportSource": "@litsx/core",
    "plugins": [
      {
        "name": "@litsx/typescript"
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
  resolve: {
    dedupe: ["lit", "lit-html", "lit-element", "@lit/reactive-element"],
  },
});
`);
  files.set("vitest.config.js", `import { defineConfig } from "vitest/config";
import { litsx } from "@litsx/vite-plugin";

export default defineConfig({
  plugins: [litsx({ sourceMaps: true })],
  test: {
    include: ["src/**/*.test.js"],
    browser: {
      enabled: true,
      provider: "playwright",
      headless: true,
      instances: [
        {
          browser: "chromium",
        },
      ],
    },
  },
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
  "typescript.tsserver.useSyntaxServer": "never"
}
`);
  files.set(".vscode/extensions.json", `{
  "recommendations": [
    "litsx.vscode-litsx"
  ]
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
  files.set(`src/${packageName}.test.js`, `import { afterEach, describe, expect, it } from "vitest";
import { ${className} } from "./${packageName}.litsx";

const tagName = "test-${packageName}";

if (!customElements.get(tagName)) {
  customElements.define(tagName, ${className});
}

describe("${className}", () => {
  let host = null;

  afterEach(() => {
    host?.remove();
    host = null;
  });

  it("renders the starter shell in a real browser DOM", async () => {
    host = document.createElement(tagName);
    document.body.append(host);

    await host.updateComplete;

    const root = host.shadowRoot;

    expect(root?.querySelector("main.shell")).toBeTruthy();
    expect(root?.textContent ?? "").toContain("Getting Started");
  });
});
`);

  return files;
}

function createAppProfileFiles(packageName, className) {
  const files = createComponentProfileFiles(packageName, className);

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
        eyebrow={"Application starter"}
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
  files.set("README.md", `# ${packageName}

Generated with \`create-litsx-app --template app\`.

## First Run

1. \`npm install\`
2. \`npm run dev\`
3. Open the local Vite URL and edit \`src/${packageName}.litsx\`

## Scripts

- \`npm run dev\`
- \`npm run build\`
- \`npm run test\`
- \`npm run lint\`
- \`npm run format\`
- \`npm run typecheck\`
- \`npm run preview\`

## What This Template Shows

- authored LitSX JSX
- routed onboarding actions with \`@primary-action\` and \`@secondary-action\`
- a home-style starter layout with \`LitsxHero\` and \`StarterGuide\`
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
  files.set("src/components/guide-card.litsx", `import type { LitsxRenderable } from "@litsx/core";

type GuideCardProps = {
  eyebrow?: string;
  titleRenderer?: () => LitsxRenderable;
  contentRenderer?: () => LitsxRenderable;
};

export const GuideCard = ({
  eyebrow = "",
  titleRenderer = () => null,
  contentRenderer = () => null,
}: GuideCardProps) => {
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
      font-family: "SFMono-Regular", ui-monospace, monospace;
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
  files.set("src/components/litsx-button.litsx", `type LitsxButtonProps = {
  type?: "primary" | "secondary";
  label?: string;
};

export const LitsxButton = ({
  type = "secondary",
  label = "",
}: LitsxButtonProps) => {
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
  files.set("src/components/litsx-hero.litsx", `import { useEmit } from "@litsx/core";
import { LitsxButton } from "./litsx-button.litsx";

type LitsxHeroProps = {
  eyebrow?: string;
  tagline?: string;
  primaryLabel?: string;
  secondaryLabel?: string;
};

export const LitsxHero = ({
  eyebrow = "Authored web components",
  tagline = "Web components with a sharper authoring experience. Less ceremony. More signal.",
  primaryLabel = "Getting Started",
  secondaryLabel = "View on GitHub",
}: LitsxHeroProps) => {
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
  \`;

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
  files.set("src/components/starter-guide.litsx", `import { SuspenseBoundary, SuspenseList, useOnConnect, useRef, useState } from "@litsx/core";
import { GuideCard } from "./guide-card.litsx";

type DeferredStep = {
  promise: Promise<void>;
  resolve: (() => void) | null;
};

function createDeferred() {
  let resolve: (() => void) | null = null;
  const promise = new Promise<void>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve } satisfies DeferredStep;
}

function resolvePendingSteps(pendingStepsRef: { current: Map<number, DeferredStep> | null }) {
  pendingStepsRef.current ??= new Map<number, DeferredStep>();
  return pendingStepsRef.current;
}

function suspendUntil(
  pendingStepsRef: { current: Map<number, DeferredStep> | null },
  stepIndex: number,
  revealedCount: number,
) {
  if (revealedCount > stepIndex) {
    return;
  }

  const pendingSteps = resolvePendingSteps(pendingStepsRef);
  let pending = pendingSteps.get(stepIndex) as DeferredStep | undefined;
  if (!pending) {
    pending = createDeferred();
    pendingSteps.set(stepIndex, pending);
  }

  throw pending.promise;
}

export const StarterGuide = () => {
  const delays: number[] = [180, 220, 240];
  const pendingStepsRef = useRef<Map<number, DeferredStep> | null>(null);
  const [revealedCount, setRevealedCount] = useState(0);
  const pendingSteps = resolvePendingSteps(pendingStepsRef);

  if (revealedCount > 0) {
    for (const [stepIndex, deferred] of pendingSteps) {
      if (stepIndex < revealedCount) {
        pendingSteps.delete(stepIndex);
        deferred.resolve?.();
      }
    }
  }

  useOnConnect(() => {
    for (const deferred of resolvePendingSteps(pendingStepsRef).values()) {
      deferred.resolve?.();
    }
    pendingStepsRef.current = new Map<number, DeferredStep>();
    setRevealedCount(0);

    const [firstDelay = 0, ...remainingDelays] = delays;
    let intervalId: ReturnType<typeof setInterval> | null = null;

    const firstTimeoutId = setTimeout(() => {
      setRevealedCount((count) => count + 1);

      if (remainingDelays.length === 0) {
        return;
      }

      const [intervalDelay = 0] = remainingDelays;
      let intervalIndex = 0;
      intervalId = setInterval(() => {
        setRevealedCount((count) => count + 1);
        intervalIndex += 1;
        if (intervalIndex >= remainingDelays.length) {
          clearInterval(intervalId);
          intervalId = null;
        }
      }, intervalDelay);
    }, firstDelay);

    return () => {
      clearTimeout(firstTimeoutId);
      if (intervalId != null) {
        clearInterval(intervalId);
      }
      for (const deferred of resolvePendingSteps(pendingStepsRef).values()) {
        deferred.resolve?.();
      }
      pendingStepsRef.current = new Map<number, DeferredStep>();
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
  \`;

  return (
    <section class="guide" aria-label="Getting started with LitSX">
      <SuspenseList class="guide-list" reveal-order="forwards" tail="hidden">
        <SuspenseBoundary
          .fallbackRenderer={() => null}
          .contentRenderer={() => {
            suspendUntil(pendingStepsRef, 0, revealedCount);
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
            suspendUntil(pendingStepsRef, 1, revealedCount);
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
            suspendUntil(pendingStepsRef, 2, revealedCount);
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
- \`npm run test\`
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

  files.set(".storybook/litsx-story-indexer.js", `import fs from "fs/promises";
import { transformLitsxSync } from "@litsx/compiler";
import { loadCsf } from "storybook/internal/csf-tools";

export const litsxStoriesIndexer = {
  test: /\\.stories\\.litsx$/,
  async createIndex(fileName, { makeTitle }) {
    const source = await fs.readFile(fileName, "utf8");
    const transformed = transformLitsxSync(source, {
      filename: fileName,
      sourceMaps: false,
    });

    return loadCsf(transformed.code, { fileName, makeTitle }).parse().indexInputs;
  },
};
`);
  files.set(".storybook/litsx-story-registration-plugin.js", `const STORY_FILE_PATTERN = /\\.stories\\.litsx(?:\\?.*)?$/;

function toKebabCase(name) {
  return name
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1-$2")
    .toLowerCase();
}

function splitNamedImports(specifiers) {
  const names = [];

  for (const specifier of specifiers.split(",")) {
    const trimmed = specifier.trim();
    if (!trimmed || trimmed.startsWith("type ")) continue;

    const [importedName, localName = importedName] = trimmed
      .replace(/^type\\s+/, "")
      .split(/\\s+as\\s+/);
    if (/^[A-Z][A-Za-z0-9_$]*$/.test(importedName) && /^[A-Z][A-Za-z0-9_$]*$/.test(localName)) {
      names.push({ tagName: toKebabCase(importedName), constructorName: localName });
    }
  }

  return names;
}

function collectImportedStoryElements(source) {
  const elements = [];
  const importPattern = /import\\s+(?:type\\s+)?\\{([\\s\\S]*?)\\}\\s+from\\s+["']([^"']+\\.litsx)["'];?/g;

  for (const match of source.matchAll(importPattern)) {
    if (/^import\\s+type\\b/.test(match[0])) continue;
    elements.push(...splitNamedImports(match[1]));
  }

  return elements;
}

function collectLocalStoryHosts(source) {
  const elements = [];
  const declarationPattern = /(?:^|\\n)\\s*(?:export\\s+)?(?:const|let|var|function)\\s+([A-Z][A-Za-z0-9_$]*Story)\\b/g;

  for (const match of source.matchAll(declarationPattern)) {
    elements.push({ tagName: toKebabCase(match[1]), constructorName: match[1] });
  }

  return elements;
}

function createRegistrationSource(elements) {
  const seen = new Set();
  const registrations = [];

  for (const { tagName, constructorName } of elements) {
    if (!tagName.includes("-") || seen.has(tagName)) continue;
    seen.add(tagName);
    registrations.push(
      \`if (!customElements.get("\${tagName}")) customElements.define("\${tagName}", \${constructorName});\`,
    );
  }

  return registrations.length > 0
    ? \`\\n\\n\${registrations.join("\\n")}\\n\`
    : "";
}

export function litsxStoryRegistrationPlugin() {
  return {
    name: "litsx-story-registration",
    enforce: "pre",
    transform(source, id) {
      if (!STORY_FILE_PATTERN.test(id)) {
        return null;
      }

      const registrationSource = createRegistrationSource([
        ...collectImportedStoryElements(source),
        ...collectLocalStoryHosts(source),
      ]);

      if (!registrationSource) {
        return null;
      }

      return {
        code: \`\${source}\${registrationSource}\`,
        map: null,
      };
    },
  };
}
`);
  files.set(".storybook/main.js", `import { litsx } from "@litsx/vite-plugin";
import { litsxStoriesIndexer } from "./litsx-story-indexer.js";
import { litsxStoryRegistrationPlugin } from "./litsx-story-registration-plugin.js";

export default {
  framework: "@storybook/web-components-vite",
  stories: ["../src/**/*.stories.@(js|jsx|ts|tsx|litsx|mdx)", "../src/**/*.docs.mdx"],
  addons: ["@storybook/addon-docs", "@storybook/addon-a11y"],
  async experimental_indexers(existingIndexers) {
    return [...existingIndexers, litsxStoriesIndexer];
  },
  async viteFinal(config) {
    const optimizeDeps = { ...(config.optimizeDeps ?? {}) };
    delete optimizeDeps.rollupOptions;

    return {
      ...config,
      optimizeDeps,
      plugins: [...(config.plugins ?? []), litsxStoryRegistrationPlugin(), litsx({ sourceMaps: true })],
    };
  },
};
`);
  files.set(".storybook/preview.js", `import "@webcomponents/scoped-custom-element-registry";
import "../src/styles/tokens.css";

export const parameters = {
  controls: { expanded: true },
  layout: "centered",
  docs: { toc: true },
};
`);
  files.set("src/stories/litsx-button.stories.litsx", `import { LitsxButton } from "../components/litsx-button.litsx";

const LitsxButtonStory = ({ label = "View on GitHub", type = "secondary" } = {}) => {
  return <LitsxButton label={label} type={type} />;
};

const meta = {
  title: "Components/LitsxButton",
  component: "litsx-button-story",
  render: ({ label = "View on GitHub", type = "secondary" } = {}) => (
    <LitsxButtonStory label={label} type={type} />
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
  component: "litsx-hero",
  render: ({
    eyebrow = "Design system starter",
    tagline = "Web components with a sharper authoring experience. Less ceremony. More signal.",
    primaryLabel = "Getting Started",
    secondaryLabel = "View on GitHub",
  } = {}) => (
    <div style="max-width: 960px; margin: 0 auto;">
      <litsx-hero
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
  component: "starter-guide",
  render: () => <starter-guide />,
};

export default meta;
export const Default = {};
`);
  files.set("src/stories/starter-guide.docs.mdx", `import { Meta, Canvas } from "@storybook/addon-docs/blocks";
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
- \`npm run test\`
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

function createSsrProfileFiles(packageName, className) {
  const files = createAppProfileFiles(packageName, className);
  const tagName = packageName;

  files.delete("vite.config.js");
  files.set("index.html", `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>LitSX SSR Starter</title>
    <style>
      body {
        margin: 0;
        min-height: 100vh;
        background: linear-gradient(180deg, #f6efe8, #fdfaf6);
        color: #1d231f;
        font-family: ui-sans-serif, system-ui, sans-serif;
      }

      .page {
        max-width: 720px;
        margin: 0 auto;
        padding: 64px 24px 96px;
      }

      .status {
        margin-bottom: 16px;
        color: #6d776f;
        font: 12px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }

      body[data-hydrated="true"] .status::after {
        content: "hydrated";
        color: #146b43;
      }

      body:not([data-hydrated="true"]) .status::after {
        content: "server rendered";
        color: #8a4c00;
      }
    </style>
    <!--app-head-->
  </head>
  <body>
    <main class="page">
      <div class="status">LitSX SSR status: </div>
      <!--app-html-->
    </main>
    <!--app-bootstrap-->
  </body>
</html>
`);

  files.set("jsconfig.json", `{
  "compilerOptions": {
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "allowJs": true,
    "allowArbitraryExtensions": true,
    "checkJs": true,
    "jsx": "react-jsx",
    "jsxImportSource": "@litsx/core",
    "plugins": [
      {
        "name": "@litsx/typescript"
      }
    ]
  },
  "include": [
    "src",
    "dev.mjs",
    "render.mjs"
  ]
}
`);
  files.set("src/main.js", `// @ts-expect-error LitSX authored modules resolve through the LitSX/Vite pipeline.
const { defineAppElements } = await import("./${packageName}.litsx");
defineAppElements();

document.body.dataset.hydrated = "true";
`);
  files.set(`src/${packageName}.test.js`, `import { afterEach, describe, expect, it } from "vitest";
import { ${className}, defineAppElements } from "./${packageName}.litsx";

const tagName = "${tagName}";

defineAppElements();

describe("${className}", () => {
  let host = null;

  afterEach(() => {
    host?.remove();
    host = null;
  });

  it("renders the SSR starter shell in a real browser DOM", async () => {
    host = document.createElement(tagName);
    document.body.append(host);

    await host.updateComplete;

    const root = host.shadowRoot;

    expect(root?.querySelector("main.shell")).toBeTruthy();
    expect(root?.textContent ?? "").toContain("SSR for authored web components");
  });
});
`);
  files.set(`src/${packageName}.litsx`, `import { LitsxHero } from "./components/litsx-hero.litsx";
import { StarterGuide } from "./components/starter-guide.litsx";

export function ${className}({
  eyebrow = "SSR starter",
  tagline = "SSR for authored web components. Render the document on the server, then hydrate the same authored tree in the browser.",
  primaryLabel = "SSR docs",
  secondaryLabel = "View on GitHub",
}) {
  static styles = \`
    :host {
      display: block;
    }

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
        eyebrow={eyebrow}
        tagline={tagline}
        primaryLabel={primaryLabel}
        secondaryLabel={secondaryLabel}
        @primary-action={() => {
          window.open("https://litsx.dev/guides/ssr", "_blank", "noopener,noreferrer");
        }}
        @secondary-action={() => {
          window.open("https://github.com/litsxdev/litsx", "_blank", "noopener,noreferrer");
        }}
      />
      <StarterGuide />
    </main>
  );
}

export function defineAppElements() {
  if (!customElements.get("${tagName}")) {
    customElements.define("${tagName}", ${className} as any);
  }
}
`);
  files.set("dev.mjs", `import { createSsrDevServer } from "@litsx/ssr";

const server = await createSsrDevServer({
  root: new URL(".", import.meta.url).pathname,
  template: "./index.html",
  clientEntry: "./src/main.js",
  host: "127.0.0.1",
  port: 5177,
  logLevel: "info",
  elements(loader) {
    return {
      "${tagName}": async () =>
        (await loader("./src/${packageName}.litsx")).${className},
    };
  },
  render({ html }) {
    return html\`<${tagName}
      .eyebrow=\${"SSR starter"}
      .tagline=\${"SSR for authored web components. Render the document on the server, then hydrate the same authored tree in the browser."}
      .primaryLabel=\${"SSR docs"}
      .secondaryLabel=\${"View on GitHub"}
    ></${tagName}>\`;
  },
});

await server.listen();
server.printUrls();
`);
  files.set("render.mjs", `import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { renderDocument } from "@litsx/ssr";

const exampleDir = path.dirname(fileURLToPath(import.meta.url));
const outputDir = path.join(exampleDir, "dist");
const outputPath = path.join(outputDir, "index.html");

export async function renderAppDocument() {
  const result = await renderDocument({
    root: exampleDir,
    template: "./index.html",
    clientEntry: "./src/main.js",
    elements(loader) {
      return {
        "${tagName}": async () =>
          (await loader("./src/${packageName}.litsx")).${className},
      };
    },
    render({ html }) {
      return html\`<${tagName}
        .eyebrow=\${"SSR starter"}
        .tagline=\${"SSR for authored web components. Render the document on the server, then hydrate the same authored tree in the browser."}
        .primaryLabel=\${"SSR docs"}
        .secondaryLabel=\${"View on GitHub"}
      ></${tagName}>\`;
    },
  });

  await fs.mkdir(outputDir, { recursive: true });
  await fs.writeFile(outputPath, result.document);
  return result;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const result = await renderAppDocument();
  console.log(\`wrote \${outputPath}\`);
  console.log(\`client imports: \${result.clientImports.join(", ")}\`);
  console.log(\`hydration roots: \${result.hydrationData?.roots.length ?? 0}\`);
}
`);
  files.set("README.md", `# ${packageName}

Generated with \`create-litsx-app --template ssr\`.

## First Run

1. \`npm install\`
2. \`npm run dev\`
3. Open the local URL printed by the SSR dev server

Run \`npm run render\` when you want a prerendered document in \`dist/index.html\`.

## Scripts

- \`npm run dev\`
- \`npm run build\`
- \`npm run render\`
- \`npm run test\`
- \`npm run lint\`
- \`npm run format\`
- \`npm run typecheck\`

## What This Template Shows

- document-first server rendering with \`renderDocument(...)\`
- authored prerender/build flow with \`renderDocument({...})\`
- local SSR development with \`createSsrDevServer(...)\`
- automatic hydration bootstrap through \`clientEntry\`
- a shared \`index.html\` shell for dev SSR and static prerender output
- the same hero and guide components as the standard app scaffold
- SSR-specific copy, routes, and entrypoints
- authored LitSX source in \`src/${packageName}.litsx\`
`);

  return files;
}

function createPackageJson(packageName, template, options = {}) {
  const packageJson = template === "ssr"
    ? createSsrPackageJson(packageName)
    : createBasePackageJson(packageName);

  if (template === "design-system") {
    packageJson.scripts.storybook = "storybook dev -p 6006";
    packageJson.scripts["build-storybook"] = "storybook build";
    Object.assign(packageJson.devDependencies, {
      "@litsx/compiler": publishedPackageVersions["@litsx/compiler"],
      "@storybook/addon-a11y": "^10.4.0",
      "@storybook/addon-docs": "^10.4.0",
      "@storybook/web-components-vite": "^10.4.0",
      "storybook": "^10.4.0",
    });
  }

  if (options.visualTests) {
    addVisualTestingPackageBits(packageJson);
  }

  return packageJson;
}

export function renderProjectFiles(targetDir, options = {}) {
  const template = options.template ?? "app";
  const visualTests = Boolean(options.visualTests);

  if (!["app", "component", "design-system", "ssr"].includes(template)) {
    throw new Error(`Unknown template "${template}". Expected "app", "component", "design-system" or "ssr".`);
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
      : template === "design-system"
        ? createDesignSystemProfileFiles(packageName, className)
        : createSsrProfileFiles(packageName, className);

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
