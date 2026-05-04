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

const tempDirs = [];

afterEach(() => {
  while (tempDirs.length > 0) {
    fs.rmSync(tempDirs.pop(), { recursive: true, force: true });
  }
});

describe("create-litsx-app", () => {
  it("renders the design-system profile by default", () => {
    const result = renderProjectFiles("/tmp/my-litsx-app");

    assert.strictEqual(result.packageName, "my-litsx-app");
    assert.strictEqual(result.className, "MyLitsxApp");
    assert.strictEqual(result.template, "design-system");
    assert.strictEqual(result.visualTests, false);

    const packageJson = JSON.parse(result.files.get("package.json"));
    const jsconfig = result.files.get("jsconfig.json");
    const eslintConfig = result.files.get("eslint.config.js");
    const prettierConfig = result.files.get("prettier.config.js");
    const vscodeSettings = result.files.get(".vscode/settings.json");
    const viteConfig = result.files.get("vite.config.js");
    const mainSource = result.files.get("src/main.js");
    const storybookMain = result.files.get(".storybook/main.js");
    const storybookPreview = result.files.get(".storybook/preview.js");
    const appSource = result.files.get("src/my-litsx-app.litsx");
    const buttonStorySource = result.files.get("src/stories/litsx-button.stories.litsx");
    const heroStorySource = result.files.get("src/stories/litsx-hero.stories.litsx");
    const storySource = result.files.get("src/stories/starter-guide.stories.litsx");
    const docsSource = result.files.get("src/stories/starter-guide.docs.mdx");
    const titleLogo = result.files.get("public/title.svg");
    const wordmarkLogo = result.files.get("public/litsx-wordmark.svg");
    const buttonSource = result.files.get("src/components/litsx-button.litsx");
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
    assert.ok(packageJson.devDependencies["@litsx/eslint-plugin"]);
    assert.ok(packageJson.devDependencies.prettier);
    assert.ok(packageJson.devDependencies["prettier-plugin-litsx"]);
    assert.ok(packageJson.devDependencies.eslint);
    assert.strictEqual(packageJson.scripts.lint, "eslint .");
    assert.strictEqual(packageJson.scripts.format, "prettier --write .");
    assert.strictEqual(packageJson.scripts.typecheck, "litsx-tsc -p jsconfig.json --noEmit");
    assert.ok(packageJson.devDependencies["@storybook/web-components-vite"]);
    assert.ok(packageJson.devDependencies["@storybook/addon-docs"]);
    assert.ok(packageJson.devDependencies["@storybook/addon-a11y"]);
    assert.ok(!packageJson.devDependencies["@storybook/addon-essentials"]);
    assert.strictEqual(packageJson.devDependencies.storybook, "^9.1.5");
    assert.ok(packageJson.devDependencies.storybook);
    assert.ok(packageJson.scripts.storybook);
    assert.ok(packageJson.scripts["build-storybook"]);
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
    assert.match(viteConfig, /plugins: \[litsx\(\)\]/);
    assert.match(mainSource, /import "@webcomponents\/scoped-custom-element-registry";/);
    assert.match(mainSource, /import \{ MyLitsxApp \} from "\.\/my-litsx-app\.litsx";/);
    assert.ok(!result.files.has("tools/litsx-vite-plugin.js"));
    assert.match(storybookMain, /@storybook\/web-components-vite/);
    assert.match(storybookMain, /@storybook\/addon-docs/);
    assert.match(storybookMain, /@storybook\/addon-a11y/);
    assert.doesNotMatch(storybookMain, /@storybook\/addon-essentials/);
    assert.match(storybookMain, /@litsx\/vite-plugin/);
    assert.match(storybookMain, /litsx\(\)/);
    assert.match(storybookPreview, /tokens\.css/);
    assert.match(appSource, /<LitsxHero/);
    assert.match(appSource, /<StarterGuide/);
    assert.doesNotMatch(appSource, /StatusPill/);
    assert.doesNotMatch(appSource, /ButtonCard/);
    assert.match(titleLogo, /aria-label="LitSX"/);
    assert.match(wordmarkLogo, /flameGradient/);
    assert.match(buttonSource, /export const LitsxButton = \(\{/);
    assert.match(buttonSource, /type = "secondary"/);
    assert.match(buttonSource, /label = ""/);
    assert.match(buttonSource, /class=\{type === "primary" \? "primary" : ""\}/);
    assert.doesNotMatch(buttonSource, /onClick/);
    assert.match(heroSource, /Web components with a sharper authoring experience/);
    assert.match(heroSource, /import \{ LitsxButton \} from "\.\/litsx-button\.litsx";/);
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
    assert.match(starterGuideSource, /suspendUntil\(0, revealedCount\)/);
    assert.match(starterGuideSource, /useState\(0\)/);
    assert.match(starterGuideSource, /useOnConnect\(\(\) => \{/);
    assert.match(starterGuideSource, /tail="hidden"/);
    assert.match(starterGuideSource, /setInterval\(\(\) => \{/);
    assert.match(storySource, /Getting Started\/StarterGuide/);
    assert.match(storySource, /<StarterGuide \/>/);
    assert.match(buttonStorySource, /Components\/LitsxButton/);
    assert.match(buttonStorySource, /export const Secondary/);
    assert.match(buttonStorySource, /export const Primary/);
    assert.match(heroStorySource, /Marketing\/LitsxHero/);
    assert.match(heroStorySource, /<LitsxHero/);
    assert.match(docsSource, /@storybook\/blocks/);
    assert.match(docsSource, /Starter Guide/);
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
    assert.match(appSource, /useState/);
    assert.match(appSource, /\^styles\(/);
    assert.match(appSource, /Count: \{count\}/);
    assert.doesNotMatch(appSource, /SuspenseBoundary/);
    assert.doesNotMatch(appSource, /ButtonCard/);
    assert.match(readme, /First Run/);
    assert.match(readme, /npm run lint/);
    assert.match(readme, /npm run format/);
    assert.match(readme, /npm run typecheck/);
    assert.match(eslintConfig, /recommended-flat/);
    assert.match(prettierConfig, /prettier-plugin-litsx/);
    assert.match(jsconfig, /"moduleResolution": "Bundler"/);
    assert.match(jsconfig, /"allowArbitraryExtensions": true/);
    assert.match(vscodeSettings, /"typescript\.tsserver\.useSeparateSyntaxServer": false/);
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
    assert.ok(result.files.has("src/components/starter-guide.litsx"));
    assert.ok(!result.files.has(".storybook/main.js"));
    assert.ok(!result.files.has("src/stories/starter-guide.stories.litsx"));
    assert.match(mainSource, /import "@webcomponents\/scoped-custom-element-registry";/);
    assert.match(componentSource, /<LitsxHero/);
    assert.match(componentSource, /<StarterGuide/);
    assert.match(componentSource, /\^styles\(/);
    assert.doesNotMatch(componentSource, /ButtonCard/);
    assert.doesNotMatch(componentSource, /StatusPill/);
    assert.match(heroSource, /View on GitHub/);
    assert.match(starterGuideSource, /<SuspenseList/);
    assert.match(readme, /component-library structure/);
    assert.match(readme, /eslint-plugin/);
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
