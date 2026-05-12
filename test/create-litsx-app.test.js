import assert from "assert";
import fs from "fs";
import { createRequire } from "module";
import os from "os";
import path from "path";
import { afterEach, describe, it } from "vitest";

import {
  applyLocalWorkspaceOverrides,
  createNextStepCommands,
  createProject,
  inferPackageManager,
  renderProjectFiles,
} from "../packages/create-litsx-app/src/index.js";

const require = createRequire(import.meta.url);
const distEntrypoint = path.resolve("packages/create-litsx-app/dist/index.cjs");
const renderDistProjectFiles = fs.existsSync(distEntrypoint)
  ? require(distEntrypoint).renderProjectFiles
  : null;
const tempDirs = [];

function getStaticStyleSources(render) {
  const sources = [];

  for (const template of ["app", "component", "design-system"]) {
    const { files } = render("/tmp/my-litsx-app", { template });

    for (const [name, source] of files) {
      if (name.endsWith(".litsx") && source.includes("static styles =")) {
        sources.push({ template, name, source });
      }
    }
  }

  return sources;
}

afterEach(() => {
  while (tempDirs.length > 0) {
    fs.rmSync(tempDirs.pop(), { recursive: true, force: true });
  }
});

describe("create-litsx-app", () => {
  it("renders the app profile by default", () => {
    const result = renderProjectFiles("/tmp/my-litsx-app");

    assert.strictEqual(result.packageName, "my-litsx-app");
    assert.strictEqual(result.className, "MyLitsxApp");
    assert.strictEqual(result.template, "app");
    assert.strictEqual(result.visualTests, false);

    const packageJson = JSON.parse(result.files.get("package.json"));
    const jsconfig = result.files.get("jsconfig.json");
    const eslintConfig = result.files.get("eslint.config.js");
    const prettierConfig = result.files.get("prettier.config.js");
    const vscodeSettings = result.files.get(".vscode/settings.json");
    const viteConfig = result.files.get("vite.config.js");
    const vitestConfig = result.files.get("vitest.config.js");
    const mainSource = result.files.get("src/main.js");
    const appSource = result.files.get("src/my-litsx-app.litsx");
    const appTestSource = result.files.get("src/my-litsx-app.test.js");
    const titleLogo = result.files.get("public/title.svg");
    const wordmarkLogo = result.files.get("public/litsx-wordmark.svg");
    const buttonSource = result.files.get("src/components/litsx-button.litsx");
    const guideCardSource = result.files.get("src/components/guide-card.litsx");
    const heroSource = result.files.get("src/components/litsx-hero.litsx");
    const starterGuideSource = result.files.get("src/components/starter-guide.litsx");

    assert.ok(packageJson.dependencies["@litsx/litsx"]);
    assert.strictEqual(
      packageJson.dependencies["@webcomponents/scoped-custom-element-registry"],
      "^0.0.10",
    );
    assert.ok(!("@open-wc/scoped-elements" in packageJson.dependencies));
    assert.ok(packageJson.dependencies.lit);
    assert.ok(packageJson.devDependencies["@litsx/typescript-plugin"]);
    assert.ok(packageJson.devDependencies["@litsx/vite-plugin"]);
    assert.ok(packageJson.devDependencies["@vitest/browser"]);
    assert.ok(packageJson.devDependencies["@vitest/browser-playwright"]);
    assert.ok(packageJson.devDependencies["@litsx/eslint-plugin"]);
    assert.ok(packageJson.devDependencies.playwright);
    assert.ok(packageJson.devDependencies.prettier);
    assert.ok(packageJson.devDependencies["prettier-plugin-litsx"]);
    assert.ok(packageJson.devDependencies.eslint);
    assert.ok(packageJson.devDependencies.vitest);
    assert.strictEqual(packageJson.scripts.lint, "eslint .");
    assert.strictEqual(packageJson.scripts.test, "vitest run");
    assert.strictEqual(packageJson.scripts["test:watch"], "vitest");
    assert.strictEqual(packageJson.scripts.format, "prettier --write .");
    assert.strictEqual(packageJson.scripts.typecheck, "litsx-tsc -p jsconfig.json --noEmit");
    assert.match(jsconfig, /"module": "ESNext"/);
    assert.match(jsconfig, /"moduleResolution": "Bundler"/);
    assert.match(jsconfig, /"allowArbitraryExtensions": true/);
    assert.match(jsconfig, /"allowJs": true/);
    assert.match(jsconfig, /"checkJs": true/);
    assert.match(jsconfig, /"jsxImportSource": "@litsx\/litsx"/);
    assert.match(eslintConfig, /@litsx\/eslint-plugin/);
    assert.match(eslintConfig, /recommended-flat/);
    assert.match(prettierConfig, /prettier-plugin-litsx/);
    assert.match(prettierConfig, /parser: "litsx"/);
    assert.match(prettierConfig, /parser: "litsx-jsx"/);
    assert.match(vscodeSettings, /"js\/ts\.tsdk\.path": "node_modules\/typescript\/lib"/);
    assert.match(vscodeSettings, /"typescript\.tsserver\.useSeparateSyntaxServer": false/);
    assert.match(jsconfig, /"name": "@litsx\/typescript-plugin"/);
    assert.doesNotMatch(JSON.stringify(packageJson.devDependencies), /@litsx\/babel-parser/);
    assert.match(viteConfig, /@litsx\/vite-plugin/);
    assert.match(viteConfig, /plugins: \[litsx\(\{ sourceMaps: true \}\)\]/);
    assert.match(vitestConfig, /import \{ defineConfig \} from "vitest\/config";/);
    assert.match(vitestConfig, /provider: "playwright"/);
    assert.match(vitestConfig, /browser: "chromium"/);
    assert.match(mainSource, /import "@webcomponents\/scoped-custom-element-registry";/);
    assert.match(mainSource, /import \{ MyLitsxApp \} from "\.\/my-litsx-app\.litsx";/);
    assert.match(appTestSource, /import \{ afterEach, describe, expect, it \} from "vitest";/);
    assert.match(appTestSource, /const tagName = "test-my-litsx-app";/);
    assert.match(appTestSource, /await host\.updateComplete;/);
    assert.match(appTestSource, /renders the starter shell in a real browser DOM/);
    assert.ok(!result.files.has("tools/litsx-vite-plugin.js"));
    assert.ok(!packageJson.scripts.storybook);
    assert.ok(!packageJson.scripts["build-storybook"]);
    assert.ok(!packageJson.devDependencies.storybook);
    assert.ok(!packageJson.devDependencies["@storybook/web-components-vite"]);
    assert.ok(!packageJson.devDependencies["@storybook/addon-docs"]);
    assert.ok(!packageJson.devDependencies["@storybook/addon-a11y"]);
    assert.ok(!result.files.has(".storybook/main.js"));
    assert.ok(!result.files.has(".storybook/preview.js"));
    assert.ok(!result.files.has("src/stories/litsx-button.stories.litsx"));
    assert.ok(!result.files.has("src/stories/litsx-hero.stories.litsx"));
    assert.ok(!result.files.has("src/stories/starter-guide.stories.litsx"));
    assert.ok(!result.files.has("src/stories/starter-guide.docs.mdx"));
    assert.match(appSource, /<LitsxHero/);
    assert.match(appSource, /<StarterGuide/);
    assert.doesNotMatch(appSource, /StatusPill/);
    assert.doesNotMatch(appSource, /ButtonCard/);
    assert.match(appSource, /eyebrow=\{"Application starter"\}/);
    assert.match(appSource, /https:\/\/litsx\.dev\/getting-started/);
    assert.match(titleLogo, /aria-label="LitSX"/);
    assert.match(wordmarkLogo, /flameGradient/);
    assert.match(buttonSource, /export const LitsxButton = \(\{/);
    assert.match(buttonSource, /type LitsxButtonProps = \{/);
    assert.match(buttonSource, /type\?: "primary" \| "secondary";/);
    assert.match(buttonSource, /\}: LitsxButtonProps\) => \{/);
    assert.match(buttonSource, /type = "secondary"/);
    assert.match(buttonSource, /label = ""/);
    assert.match(buttonSource, /class=\{type === "primary" \? "primary" : ""\}/);
    assert.doesNotMatch(buttonSource, /onClick/);
    assert.match(guideCardSource, /import type \{ LitsxRenderable \} from "@litsx\/litsx";/);
    assert.match(guideCardSource, /type GuideCardProps = \{/);
    assert.match(guideCardSource, /titleRenderer = \(\) => null/);
    assert.match(guideCardSource, /contentRenderer = \(\) => null/);
    assert.match(heroSource, /Web components with a sharper authoring experience/);
    assert.match(heroSource, /import \{ LitsxButton \} from "\.\/litsx-button\.litsx";/);
    assert.match(heroSource, /type LitsxHeroProps = \{/);
    assert.match(heroSource, /\}: LitsxHeroProps\) => \{/);
    assert.match(heroSource, /src="\/title\.svg"/);
    assert.match(heroSource, /src="\/flame_512\.png"/);
    assert.match(heroSource, /class="LitsxHero"/);
    assert.match(heroSource, /primaryLabel = "Getting Started"/);
    assert.match(heroSource, /import \{ useEmit \} from "@litsx\/litsx";/);
    assert.match(heroSource, /const emit = useEmit\(\);/);
    assert.match(heroSource, /emit\("primary-action"\)/);
    assert.match(heroSource, /emit\("secondary-action"\)/);
    assert.match(heroSource, /<LitsxButton/);
    assert.match(heroSource, /type="primary"/);
    assert.match(heroSource, /type="secondary"/);
    assert.match(heroSource, /@click=\{\(\) => emit\("primary-action"\)\}/);
    assert.match(heroSource, /@click=\{\(\) => emit\("secondary-action"\)\}/);
    assert.match(appSource, /@primary-action=\{/);
    assert.match(appSource, /@secondary-action=\{/);
    assert.match(appSource, /https:\/\/litsx\.dev\/getting-started/);
    assert.match(starterGuideSource, /<SuspenseList/);
    assert.match(starterGuideSource, /type DeferredStep = \{/);
    assert.match(starterGuideSource, /const pendingSteps = new Map<number, DeferredStep>\(\);/);
    assert.match(starterGuideSource, /const promise = new Promise<void>\(\(nextResolve\) => \{/);
    assert.match(starterGuideSource, /const delays: number\[\] = \[180, 220, 240\];/);
    assert.match(starterGuideSource, /let intervalId: ReturnType<typeof setInterval> \| null = null;/);
    assert.match(starterGuideSource, /suspendUntil\(0, revealedCount\)/);
    assert.match(starterGuideSource, /useState\(0\)/);
    assert.match(starterGuideSource, /useOnConnect\(\(\) => \{/);
    assert.match(starterGuideSource, /tail="hidden"/);
    assert.match(starterGuideSource, /const \[intervalDelay = 0\] = remainingDelays/);
    assert.match(starterGuideSource, /setInterval\(\(\) => \{/);
  });

  it("renders the app profile without storybook baggage", () => {
    const result = renderProjectFiles("/tmp/my-litsx-app", { template: "app" });
    const packageJson = JSON.parse(result.files.get("package.json"));
    const appSource = result.files.get("src/my-litsx-app.litsx");
    const mainSource = result.files.get("src/main.js");
    const readme = result.files.get("README.md");
    const eslintConfig = result.files.get("eslint.config.js");
    const prettierConfig = result.files.get("prettier.config.js");
    const jsconfig = result.files.get("jsconfig.json");
    const vscodeSettings = result.files.get(".vscode/settings.json");
    const appTestSource = result.files.get("src/my-litsx-app.test.js");

    assert.strictEqual(result.template, "app");
    assert.strictEqual(result.visualTests, false);
    assert.ok(!packageJson.scripts.storybook);
    assert.ok(!packageJson.devDependencies.storybook);
    assert.ok(!("@open-wc/scoped-elements" in packageJson.dependencies));
    assert.strictEqual(packageJson.scripts.lint, "eslint .");
    assert.strictEqual(packageJson.scripts.format, "prettier --write .");
    assert.ok(!result.files.has(".storybook/main.js"));
    assert.ok(!result.files.has("src/stories/starter-guide.stories.litsx"));
    assert.match(mainSource, /import "@webcomponents\/scoped-custom-element-registry";/);
    assert.match(appSource, /<LitsxHero/);
    assert.match(appSource, /<StarterGuide/);
    assert.match(appSource, /static styles = /);
    assert.match(appSource, /Application starter/);
    assert.match(appSource, /@primary-action=\{/);
    assert.match(appSource, /@secondary-action=\{/);
    assert.doesNotMatch(appSource, /ButtonCard/);
    assert.match(readme, /First Run/);
    assert.match(readme, /LitsxHero/);
    assert.match(readme, /StarterGuide/);
    assert.match(readme, /npm run format/);
    assert.match(readme, /npm run test/);
    assert.match(readme, /npm run typecheck/);
    assert.match(eslintConfig, /recommended-flat/);
    assert.match(prettierConfig, /prettier-plugin-litsx/);
    assert.match(jsconfig, /"moduleResolution": "Bundler"/);
    assert.match(jsconfig, /"allowArbitraryExtensions": true/);
    assert.match(vscodeSettings, /"typescript\.tsserver\.useSeparateSyntaxServer": false/);
    assert.match(appTestSource, /Getting Started/);
  });

  it("renders the component profile with library structure but without storybook", () => {
    const result = renderProjectFiles("/tmp/my-litsx-app", { template: "component" });
    const packageJson = JSON.parse(result.files.get("package.json"));
    const componentSource = result.files.get("src/my-litsx-app.litsx");
    const mainSource = result.files.get("src/main.js");
    const readme = result.files.get("README.md");
    const heroSource = result.files.get("src/components/litsx-hero.litsx");
    const starterGuideSource = result.files.get("src/components/starter-guide.litsx");

    assert.strictEqual(result.template, "component");
    assert.strictEqual(result.visualTests, false);
    assert.ok(!packageJson.scripts.storybook);
    assert.ok(!packageJson.devDependencies.storybook);
    assert.ok(!("@open-wc/scoped-elements" in packageJson.dependencies));
    assert.strictEqual(packageJson.scripts.lint, "eslint .");
    assert.strictEqual(packageJson.scripts.test, "vitest run");
    assert.ok(result.files.has("src/components/starter-guide.litsx"));
    assert.ok(result.files.has("src/my-litsx-app.test.js"));
    assert.ok(!result.files.has(".storybook/main.js"));
    assert.ok(!result.files.has("src/stories/starter-guide.stories.litsx"));
    assert.match(mainSource, /import "@webcomponents\/scoped-custom-element-registry";/);
    assert.match(componentSource, /<LitsxHero/);
    assert.match(componentSource, /<StarterGuide/);
    assert.match(componentSource, /static styles = /);
    assert.match(componentSource, /Design system starter/);
    assert.doesNotMatch(heroSource, /`\);/);
    assert.doesNotMatch(starterGuideSource, /`\);/);
    assert.doesNotMatch(componentSource, /ButtonCard/);
    assert.doesNotMatch(componentSource, /StatusPill/);
    assert.match(heroSource, /View on GitHub/);
    assert.match(starterGuideSource, /<SuspenseList/);
    assert.match(readme, /component-library structure/);
    assert.match(readme, /eslint-plugin/);
    assert.match(readme, /npm run test/);
  });

  it("does not emit legacy hoist closers in any authored template", () => {
    const renderers = [["src", renderProjectFiles]];
    if (renderDistProjectFiles) {
      renderers.push(["dist", renderDistProjectFiles]);
    }

    for (const [entrypoint, render] of renderers) {
      for (const { template, name, source } of getStaticStyleSources(render)) {
        assert.doesNotMatch(
          source,
          /`\);/,
          `${entrypoint} ${template} ${name} still contains a legacy \`); hoist closer`,
        );
      }
    }
  });

  it("adds visual testing assets when requested", () => {
    const result = renderProjectFiles("/tmp/my-litsx-app", {
      template: "design-system",
      visualTests: true,
    });
    const packageJson = JSON.parse(result.files.get("package.json"));
    const playwrightConfig = result.files.get("playwright.config.js");
    const dockerfile = result.files.get("Dockerfile.visual");
    const visualTest = result.files.get("tests/visual/storybook.spec.js");

    assert.strictEqual(result.visualTests, true);
    assert.ok(packageJson.devDependencies["@playwright/test"]);
    assert.ok(packageJson.scripts["test:visual"]);
    assert.ok(packageJson.scripts["test:visual:update"]);
    assert.strictEqual(packageJson.scripts.test, "vitest run");
    assert.match(playwrightConfig, /command: "npm run storybook"/);
    assert.match(playwrightConfig, /timezoneId: "UTC"/);
    assert.match(dockerfile, /mcr\.microsoft\.com\/playwright/);
    assert.match(visualTest, /toHaveScreenshot/);
  });

  it("writes the scaffold to disk", () => {
    const targetDir = fs.mkdtempSync(path.join(os.tmpdir(), "create-litsx-app-"));
    tempDirs.push(targetDir);

    const result = createProject(targetDir, { template: "design-system", visualTests: true });

    assert.ok(fs.existsSync(path.join(targetDir, "package.json")));
    assert.ok(fs.existsSync(path.join(targetDir, "jsconfig.json")));
    assert.ok(fs.existsSync(path.join(targetDir, "eslint.config.js")));
    assert.ok(fs.existsSync(path.join(targetDir, "vite.config.js")));
    assert.ok(!fs.existsSync(path.join(targetDir, "tools", "litsx-vite-plugin.js")));
    assert.ok(fs.existsSync(path.join(targetDir, ".storybook", "main.js")));
    assert.ok(fs.existsSync(path.join(targetDir, ".storybook", "preview.js")));
    assert.ok(fs.existsSync(path.join(targetDir, "playwright.config.js")));
    assert.ok(fs.existsSync(path.join(targetDir, "Dockerfile.visual")));
    assert.ok(fs.existsSync(path.join(targetDir, "tests", "visual", "storybook.spec.js")));
    assert.ok(fs.existsSync(path.join(targetDir, "src", `${result.packageName}.litsx`)));
    assert.ok(fs.existsSync(path.join(targetDir, "src", "components", "litsx-hero.litsx")));
    assert.ok(fs.existsSync(path.join(targetDir, "src", "components", "litsx-button.litsx")));
    assert.ok(fs.existsSync(path.join(targetDir, "src", "components", "starter-guide.litsx")));
    assert.ok(fs.existsSync(path.join(targetDir, "src", "stories", "litsx-button.stories.litsx")));
    assert.ok(fs.existsSync(path.join(targetDir, "src", "stories", "litsx-hero.stories.litsx")));
    assert.ok(fs.existsSync(path.join(targetDir, "src", "stories", "starter-guide.stories.litsx")));
    assert.ok(fs.existsSync(path.join(targetDir, "src", "stories", "starter-guide.docs.mdx")));
    assert.ok(fs.existsSync(path.join(targetDir, "src", "styles", "tokens.css")));
    assert.ok(fs.existsSync(path.join(targetDir, "public", "title.svg")));
    assert.ok(fs.existsSync(path.join(targetDir, "public", "litsx-wordmark.svg")));
    assert.ok(fs.existsSync(path.join(targetDir, "public", "flame_512.png")));
  });

  it("refuses to scaffold into a non-empty directory", () => {
    const targetDir = fs.mkdtempSync(path.join(os.tmpdir(), "create-litsx-app-nonempty-"));
    tempDirs.push(targetDir);
    fs.writeFileSync(path.join(targetDir, "keep.txt"), "x", "utf8");

    assert.throws(() => {
      createProject(targetDir);
    }, /Target directory is not empty/);
  });

  it("rejects unknown templates", () => {
    assert.throws(() => {
      renderProjectFiles("/tmp/unknown-template", { template: "docs" });
    }, /Unknown template/);
  });

  it("infers the invoking package manager from npm user agent", () => {
    assert.strictEqual(inferPackageManager("pnpm/10.0.0 npm/? node/v22.0.0 darwin x64"), "pnpm");
    assert.strictEqual(inferPackageManager("yarn/1.22.22 npm/? node/v22.0.0 darwin x64"), "yarn");
    assert.strictEqual(inferPackageManager("npm/10.9.0 node/v22.0.0 darwin x64"), "npm");
    assert.strictEqual(inferPackageManager(""), "npm");
  });

  it("creates package-manager-aware next-step commands", () => {
    assert.deepStrictEqual(createNextStepCommands("my-app", "npm"), [
      "cd my-app",
      "npm install",
      "npm run dev",
      "npm run lint",
      "npm run typecheck",
    ]);
    assert.deepStrictEqual(createNextStepCommands("my-app", "pnpm"), [
      "cd my-app",
      "pnpm install",
      "pnpm run dev",
      "pnpm run lint",
      "pnpm run typecheck",
    ]);
    assert.deepStrictEqual(createNextStepCommands("my-app", "yarn"), [
      "cd my-app",
      "yarn",
      "yarn dev",
      "yarn lint",
      "yarn typecheck",
    ]);
  });

  it("can rewrite scaffold dependencies to local workspace ranges for smoke testing", () => {
    const packageJson = {
      dependencies: {
        "@litsx/litsx": "^0.1.0",
        lit: "^3.2.1",
      },
      devDependencies: {
        "@litsx/eslint-plugin": "^0.1.0",
        "@litsx/typescript-plugin": "^0.1.0",
        "@litsx/vite-plugin": "^0.1.0",
        "prettier-plugin-litsx": "^0.1.0",
        vite: "^7.1.0",
      },
    };

    applyLocalWorkspaceOverrides(packageJson);

    assert.strictEqual(packageJson.dependencies["@litsx/litsx"], "workspace:^");
    assert.strictEqual(packageJson.dependencies.lit, "^3.2.1");
    assert.strictEqual(packageJson.devDependencies["@litsx/eslint-plugin"], "workspace:^");
    assert.strictEqual(packageJson.devDependencies["@litsx/typescript-plugin"], "workspace:^");
    assert.strictEqual(packageJson.devDependencies["@litsx/vite-plugin"], "workspace:^");
    assert.strictEqual(packageJson.devDependencies["prettier-plugin-litsx"], "workspace:^");
    assert.strictEqual(packageJson.devDependencies.vite, "^7.1.0");
  });
});
