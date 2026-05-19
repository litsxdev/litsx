import assert from "assert";
import fs from "fs";
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
import { publishedPackageVersions } from "../packages/create-litsx-app/src/published-package-versions.js";
const tempDirs = [];

function getStaticStyleSources(render) {
  const sources = [];
  const templates = render === renderProjectFiles
    ? ["app", "component", "design-system", "ssr"]
    : ["app", "component", "design-system"];

  for (const template of templates) {
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

    assert.ok(packageJson.dependencies["@litsx/core"]);
    assert.strictEqual(
      packageJson.dependencies["@webcomponents/scoped-custom-element-registry"],
      "^0.0.10",
    );
    assert.ok(!("@open-wc/scoped-elements" in packageJson.dependencies));
    assert.ok(packageJson.dependencies.lit);
    assert.ok(packageJson.devDependencies["@litsx/typescript"]);
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
    assert.match(jsconfig, /"jsxImportSource": "@litsx\/core"/);
    assert.match(eslintConfig, /@litsx\/eslint-plugin/);
    assert.match(eslintConfig, /recommended-flat/);
    assert.match(prettierConfig, /prettier-plugin-litsx/);
    assert.match(prettierConfig, /parser: "litsx"/);
    assert.match(prettierConfig, /parser: "litsx-jsx"/);
    assert.match(vscodeSettings, /"js\/ts\.tsdk\.path": "node_modules\/typescript\/lib"/);
    assert.match(vscodeSettings, /"typescript\.tsserver\.useSyntaxServer": "never"/);
    assert.match(jsconfig, /"name": "@litsx\/typescript"/);
    assert.doesNotMatch(JSON.stringify(packageJson.devDependencies), /@litsx\/babel-parser/);
    assert.match(viteConfig, /@litsx\/vite-plugin/);
    assert.match(viteConfig, /plugins: \[litsx\(\{ sourceMaps: true \}\)\]/);
    assert.match(viteConfig, /dedupe: \["lit", "lit-html", "lit-element", "@lit\/reactive-element"\]/);
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
    assert.match(guideCardSource, /import type \{ LitsxRenderable \} from "@litsx\/core";/);
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
    assert.match(heroSource, /import \{ useEmit \} from "@litsx\/core";/);
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
    assert.match(starterGuideSource, /import \{ SuspenseBoundary, SuspenseList, useOnConnect, useRef, useState \} from "@litsx\/core";/);
    assert.match(starterGuideSource, /const pendingStepsRef = useRef<Map<number, DeferredStep> \| null>\(null\);/);
    assert.match(
      starterGuideSource,
      /function resolvePendingSteps\(pendingStepsRef: \{ current: Map<number, DeferredStep> \| null \}\) \{/,
    );
    assert.match(starterGuideSource, /pendingStepsRef\.current \?\?= new Map<number, DeferredStep>\(\);/);
    assert.match(starterGuideSource, /const pendingSteps = resolvePendingSteps\(pendingStepsRef\);/);
    assert.match(starterGuideSource, /const promise = new Promise<void>\(\(nextResolve\) => \{/);
    assert.match(starterGuideSource, /const delays: number\[\] = \[180, 220, 240\];/);
    assert.match(starterGuideSource, /let intervalId: ReturnType<typeof setInterval> \| null = null;/);
    assert.match(
      starterGuideSource,
      /function suspendUntil\(\s*pendingStepsRef: \{ current: Map<number, DeferredStep> \| null \},\s*stepIndex: number,\s*revealedCount: number,\s*\)/,
    );
    assert.match(starterGuideSource, /const pendingSteps = resolvePendingSteps\(pendingStepsRef\);/);
    assert.match(starterGuideSource, /suspendUntil\(pendingStepsRef, 0, revealedCount\)/);
    assert.match(starterGuideSource, /suspendUntil\(pendingStepsRef, 1, revealedCount\)/);
    assert.match(starterGuideSource, /suspendUntil\(pendingStepsRef, 2, revealedCount\)/);
    assert.match(starterGuideSource, /useState\(0\)/);
    assert.match(starterGuideSource, /useOnConnect\(\(\) => \{/);
    assert.match(starterGuideSource, /for \(const deferred of resolvePendingSteps\(pendingStepsRef\)\.values\(\)\) \{/);
    assert.match(starterGuideSource, /pendingStepsRef\.current = new Map<number, DeferredStep>\(\);/);
    assert.match(starterGuideSource, /setRevealedCount\(0\);/);
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
    assert.match(vscodeSettings, /"typescript\.tsserver\.useSyntaxServer": "never"/);
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

  it("renders the ssr profile with productized SSR entrypoints", () => {
    const result = renderProjectFiles("/tmp/my-litsx-app", { template: "ssr" });
    const packageJson = JSON.parse(result.files.get("package.json"));
    const jsconfig = result.files.get("jsconfig.json");
    const mainSource = result.files.get("src/main.js");
    const appSource = result.files.get("src/my-litsx-app.litsx");
    const appTestSource = result.files.get("src/my-litsx-app.test.js");
    const indexHtml = result.files.get("index.html");
    const devSource = result.files.get("dev.mjs");
    const renderSource = result.files.get("render.mjs");
    const readme = result.files.get("README.md");

    assert.strictEqual(result.template, "ssr");
    assert.ok(packageJson.dependencies["@litsx/ssr"]);
    assert.ok(packageJson.dependencies["@litsx/ssr-client"]);
    assert.ok(packageJson.devDependencies["@litsx/compiler"]);
    assert.ok(packageJson.devDependencies["@lit-labs/ssr"]);
    assert.strictEqual(packageJson.scripts.dev, "node dev.mjs");
    assert.strictEqual(packageJson.scripts.build, "node render.mjs");
    assert.strictEqual(packageJson.scripts.render, "node render.mjs");
    assert.ok(!("preview" in packageJson.scripts));
    assert.ok(result.files.has("index.html"));
    assert.ok(!result.files.has("vite.config.js"));
    assert.match(indexHtml, /<!--app-head-->/);
    assert.match(indexHtml, /<!--app-html-->/);
    assert.match(indexHtml, /<!--app-bootstrap-->/);
    assert.match(jsconfig, /"include": \[/);
    assert.match(jsconfig, /"dev\.mjs"/);
    assert.match(jsconfig, /"render\.mjs"/);
    assert.doesNotMatch(mainSource, /hydratePage/);
    assert.match(mainSource, /defineAppElements/);
    assert.match(mainSource, /defineAppElements/);
    assert.match(appSource, /export function MyLitsxApp/);
    assert.match(appSource, /import \{ LitsxHero \} from "\.\/components\/litsx-hero\.litsx";/);
    assert.match(appSource, /import \{ StarterGuide \} from "\.\/components\/starter-guide\.litsx";/);
    assert.match(appSource, /customElements\.define\("my-litsx-app", MyLitsxApp as any\)/);
    assert.match(appSource, /eyebrow = "SSR starter"/);
    assert.match(appSource, /SSR for authored web components\./);
    assert.match(appSource, /primaryLabel = "SSR docs"/);
    assert.match(appSource, /https:\/\/litsx\.dev\/guides\/ssr/);
    assert.match(appSource, /<LitsxHero/);
    assert.match(appSource, /<StarterGuide/);
    assert.match(appTestSource, /renders the SSR starter shell in a real browser DOM/);
    assert.match(devSource, /import \{ createSsrDevServer \} from "@litsx\/ssr";/);
    assert.match(devSource, /template: "\.\/index\.html"/);
    assert.match(devSource, /clientEntry: "\.\/src\/main\.js"/);
    assert.doesNotMatch(devSource, /scopedTemplate/);
    assert.match(devSource, /elements\(loader\) \{/);
    assert.match(devSource, /loader\("\.\/src\/my-litsx-app\.litsx"\)/);
    assert.match(devSource, /return html`<my-litsx-app/);
    assert.match(devSource, /\.eyebrow=\$\{"SSR starter"\}/);
    assert.match(devSource, /\.primaryLabel=\$\{"SSR docs"\}/);
    assert.doesNotMatch(devSource, /LitSX SSR status/);
    assert.match(renderSource, /import \{ renderDocument \} from "@litsx\/ssr";/);
    assert.doesNotMatch(renderSource, /createServer/);
    assert.doesNotMatch(renderSource, /@litsx\/vite-plugin/);
    assert.doesNotMatch(renderSource, /install-global-dom-shim/);
    assert.doesNotMatch(renderSource, /__litsxScopedTemplate/);
    assert.match(renderSource, /const outputDir = path\.join\(exampleDir, "dist"\);/);
    assert.match(renderSource, /const outputPath = path\.join\(outputDir, "index\.html"\);/);
    assert.match(renderSource, /renderDocument\(\{/);
    assert.match(renderSource, /template: "\.\/index\.html"/);
    assert.match(renderSource, /clientEntry: "\.\/src\/main\.js"/);
    assert.match(renderSource, /elements\(loader\) \{/);
    assert.match(renderSource, /loader\("\.\/src\/my-litsx-app\.litsx"\)/);
    assert.match(readme, /--template ssr/);
    assert.match(readme, /renderDocument/);
    assert.match(readme, /renderDocument\(\.\.\.\)|renderDocument/);
    assert.match(readme, /createSsrDevServer/);
    assert.match(readme, /dist\/index\.html/);
    assert.match(readme, /automatic hydration bootstrap through `clientEntry`/);
    assert.match(readme, /same hero and guide components as the standard app scaffold/);
    assert.match(readme, /shared `index\.html` shell/i);
  });

  it("does not emit legacy hoist closers in any authored template", () => {
    for (const { template, name, source } of getStaticStyleSources(renderProjectFiles)) {
      assert.doesNotMatch(
        source,
        /`\);/,
        `src ${template} ${name} still contains a legacy \`); hoist closer`,
      );
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
    const storybookMain = result.files.get(".storybook/main.js");
    const storyRegistrationPlugin = result.files.get(".storybook/litsx-story-registration-plugin.js");
    const previewSource = result.files.get(".storybook/preview.js");
    const buttonStory = result.files.get("src/stories/litsx-button.stories.litsx");
    const heroStory = result.files.get("src/stories/litsx-hero.stories.litsx");
    const starterGuideStory = result.files.get("src/stories/starter-guide.stories.litsx");
    const starterGuideDocs = result.files.get("src/stories/starter-guide.docs.mdx");

    assert.strictEqual(result.visualTests, true);
    assert.ok(packageJson.devDependencies["@playwright/test"]);
    assert.strictEqual(
      packageJson.devDependencies["@litsx/compiler"],
      publishedPackageVersions["@litsx/compiler"],
    );
    assert.ok(packageJson.scripts["test:visual"]);
    assert.ok(packageJson.scripts["test:visual:update"]);
    assert.strictEqual(packageJson.scripts.test, "vitest run");
    assert.match(playwrightConfig, /command: "npm run storybook"/);
    assert.match(playwrightConfig, /timezoneId: "UTC"/);
    assert.match(dockerfile, /mcr\.microsoft\.com\/playwright/);
    assert.match(visualTest, /toHaveScreenshot/);
    assert.match(storybookMain, /import \{ litsxStoryRegistrationPlugin \} from "\.\/litsx-story-registration-plugin\.js";/);
    assert.match(storybookMain, /const optimizeDeps = \{ \.\.\.\(config\.optimizeDeps \?\? \{\}\) \};/);
    assert.match(storybookMain, /delete optimizeDeps\.rollupOptions;/);
    assert.match(
      storybookMain,
      /plugins: \[\.\.\.\(config\.plugins \?\? \[\]\), litsxStoryRegistrationPlugin\(\), litsx\(\{ sourceMaps: true \}\)\]/,
    );
    assert.match(storyRegistrationPlugin, /enforce: "pre"/);
    assert.match(storyRegistrationPlugin, /STORY_FILE_PATTERN = \/\\\.stories\\\.litsx/);
    assert.match(storyRegistrationPlugin, /customElements\.define/);
    assert.match(previewSource, /import "@webcomponents\/scoped-custom-element-registry";/);
    assert.doesNotMatch(buttonStory, /customElements\.define\("litsx-button", LitsxButton\)/);
    assert.match(buttonStory, /const LitsxButtonStory = \(\{ label = "View on GitHub", type = "secondary" \} = \{\}\) => \{/);
    assert.match(buttonStory, /return <LitsxButton label=\{label\} type=\{type\} \/>;/);
    assert.match(buttonStory, /component: "litsx-button-story"/);
    assert.match(buttonStory, /<LitsxButtonStory label=\{label\} type=\{type\} \/>/);
    assert.doesNotMatch(heroStory, /customElements\.define\("litsx-hero", LitsxHero\)/);
    assert.match(heroStory, /component: "litsx-hero"/);
    assert.match(heroStory, /<litsx-hero/);
    assert.doesNotMatch(starterGuideStory, /customElements\.define\("starter-guide", StarterGuide\)/);
    assert.match(starterGuideStory, /component: "starter-guide"/);
    assert.match(starterGuideStory, /render: \(\) => <starter-guide \/>/);
    assert.match(starterGuideDocs, /import \{ Meta, Canvas \} from "@storybook\/addon-docs\/blocks";/);
    assert.match(starterGuideDocs, /import \* as StarterGuideStories from "\.\/starter-guide\.stories\.litsx";/);
    assert.match(starterGuideDocs, /<Meta of=\{StarterGuideStories\} \/>/);
    assert.match(starterGuideDocs, /<Canvas of=\{StarterGuideStories\.Default\} \/>/);
  });

  it("generates a Storybook pretransform that auto-registers imported and local story elements", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "create-litsx-app-story-plugin-"));
    tempDirs.push(tempDir);

    const result = renderProjectFiles("/tmp/my-litsx-app", { template: "design-system" });
    const pluginPath = path.join(tempDir, "litsx-story-registration-plugin.mjs");
    fs.writeFileSync(pluginPath, result.files.get(".storybook/litsx-story-registration-plugin.js"), "utf8");

    const { litsxStoryRegistrationPlugin } = await import(`${pluginPath}?cache=${Date.now()}`);
    const plugin = litsxStoryRegistrationPlugin();
    const source = [
      'import { VdsButton, VdsDrawer as DrawerElement, type VdsButtonProps } from "../components/vds-button.litsx";',
      'import { VdsModal } from "../components/vds-modal.litsx";',
      'import type { VdsIgnoredStory } from "../components/vds-ignored-story.litsx";',
      "",
      "const VdsDrawerStory = () => <DrawerElement />;",
      "function VdsModalStory() {",
      "  return <VdsModal />;",
      "}",
      "",
      "export const Default = { render: () => <VdsButton label=\"Buy\" /> };",
      "",
    ].join("\n");

    const transformed = plugin.transform(source, "/project/src/stories/catalog.stories.litsx");

    assert.strictEqual(plugin.enforce, "pre");
    assert.match(transformed.code, /customElements\.define\("vds-button", VdsButton\);/);
    assert.match(transformed.code, /customElements\.define\("vds-drawer", DrawerElement\);/);
    assert.match(transformed.code, /customElements\.define\("vds-modal", VdsModal\);/);
    assert.match(transformed.code, /customElements\.define\("vds-drawer-story", VdsDrawerStory\);/);
    assert.match(transformed.code, /customElements\.define\("vds-modal-story", VdsModalStory\);/);
    assert.doesNotMatch(transformed.code, /customElements\.define\("vds-button-props", VdsButtonProps\);/);
    assert.doesNotMatch(transformed.code, /customElements\.define\("vds-ignored-story", VdsIgnoredStory\);/);
    assert.strictEqual(plugin.transform(source, "/project/src/stories/catalog.stories.tsx"), null);
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
    assert.ok(fs.existsSync(path.join(targetDir, ".storybook", "litsx-story-registration-plugin.js")));
    assert.ok(fs.existsSync(path.join(targetDir, "playwright.config.js")));
    assert.ok(fs.existsSync(path.join(targetDir, "Dockerfile.visual")));
    assert.ok(fs.existsSync(path.join(targetDir, "tests", "visual", "storybook.spec.js")));
    assert.ok(fs.existsSync(path.join(targetDir, "src", `${result.packageName}.litsx`)));
    assert.ok(fs.existsSync(path.join(targetDir, "src", "components", "litsx-hero.litsx")));
    assert.ok(fs.existsSync(path.join(targetDir, "src", "components", "litsx-button.litsx")));
    assert.ok(fs.existsSync(path.join(targetDir, "src", "components", "starter-guide.litsx")));
    assert.ok(fs.existsSync(path.join(targetDir, ".storybook", "litsx-story-indexer.js")));
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
        "@litsx/core": "^0.1.0",
        "@litsx/ssr": "^0.1.0",
        "@litsx/ssr-client": "^0.1.0",
        lit: "^3.2.1",
      },
      devDependencies: {
        "@litsx/compiler": "^0.1.0",
        "@litsx/eslint-plugin": "^0.1.0",
        "@litsx/typescript": "^0.1.0",
        "@litsx/vite-plugin": "^0.1.0",
        "prettier-plugin-litsx": "^0.1.0",
        vite: "^7.1.0",
      },
    };

    applyLocalWorkspaceOverrides(packageJson);

    assert.strictEqual(packageJson.dependencies["@litsx/core"], "workspace:^");
    assert.strictEqual(packageJson.dependencies["@litsx/ssr"], "workspace:^");
    assert.strictEqual(packageJson.dependencies["@litsx/ssr-client"], "workspace:^");
    assert.strictEqual(packageJson.dependencies.lit, "^3.2.1");
    assert.strictEqual(packageJson.devDependencies["@litsx/compiler"], "workspace:^");
    assert.strictEqual(packageJson.devDependencies["@litsx/eslint-plugin"], "workspace:^");
    assert.strictEqual(packageJson.devDependencies["@litsx/typescript"], "workspace:^");
    assert.strictEqual(packageJson.devDependencies["@litsx/vite-plugin"], "workspace:^");
    assert.strictEqual(packageJson.devDependencies["prettier-plugin-litsx"], "workspace:^");
    assert.strictEqual(packageJson.devDependencies.vite, "^7.1.0");
  });
});
