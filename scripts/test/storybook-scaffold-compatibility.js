import { execFileSync } from "node:child_process";
import fs from "node:fs";
import { createServer } from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { createProject } from "../../packages/create-litsx-app/src/index.js";

const supportedVersions = ["10.4.6", "10.5.10"];
const stylingOptions = ["css", "tailwind", "unocss"];
const requestedVersions = process.argv.slice(2);
const versions =
  requestedVersions.length > 0 ? requestedVersions : supportedVersions;
const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
);

function runNpm(fixtureDir, args, cacheDir) {
  execFileSync("npm", args, {
    cwd: fixtureDir,
    env: {
      ...process.env,
      npm_config_cache: cacheDir,
      npm_config_fund: "false",
      npm_config_audit: "false",
      STORYBOOK_DISABLE_TELEMETRY: "1",
    },
    stdio: "inherit",
  });
}

function installFixtureChromium(fixtureDir, cacheDir) {
  execFileSync(
    path.join(fixtureDir, "node_modules", ".bin", "playwright"),
    ["install", "chromium"],
    {
      cwd: fixtureDir,
      env: {
        ...process.env,
        npm_config_cache: cacheDir,
        PLAYWRIGHT_DOWNLOAD_CONNECTION_TIMEOUT: "120000",
      },
      stdio: "inherit",
    },
  );
}

async function loadFixtureChromium(fixtureDir) {
  const playwrightUrl = pathToFileURL(
    path.join(fixtureDir, "node_modules", "playwright", "index.mjs"),
  ).href;
  const { chromium } = await import(playwrightUrl);
  const executablePath = chromium.executablePath();
  if (!fs.existsSync(executablePath)) {
    throw new Error(
      `Fixture Playwright browser was not installed at ${executablePath}.`,
    );
  }
  return chromium;
}

const contentTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".mjs", "text/javascript; charset=utf-8"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
]);

async function assertBuiltStoryRuntime(fixtureDir, styling) {
  const chromium = await loadFixtureChromium(fixtureDir);
  const staticRoot = path.join(fixtureDir, "storybook-static");
  const server = createServer(async (request, response) => {
    try {
      const pathname = decodeURIComponent(
        new URL(request.url, "http://localhost").pathname,
      );
      const relativePath = pathname === "/" ? "index.html" : pathname.slice(1);
      const filePath = path.resolve(staticRoot, relativePath);
      if (!filePath.startsWith(`${staticRoot}${path.sep}`)) {
        response.writeHead(403).end("Forbidden");
        return;
      }

      const body = await fs.promises.readFile(filePath);
      response.writeHead(200, {
        "content-type":
          contentTypes.get(path.extname(filePath)) ??
          "application/octet-stream",
      });
      response.end(body);
    } catch (error) {
      response.writeHead(error?.code === "ENOENT" ? 404 : 500).end("Not found");
    }
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });

  const address = server.address();
  let browser = null;
  try {
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    const runtimeErrors = [];
    page.on("pageerror", (error) => runtimeErrors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") runtimeErrors.push(message.text());
    });

    await page.goto(
      `http://127.0.0.1:${address.port}/iframe.html?id=components-litsxbutton--primary&viewMode=story`,
      { waitUntil: "networkidle" },
    );
    try {
      await page.waitForFunction((selectedStyling) => {
        const element = document.querySelector("litsx-button");
        const renderRoot = element?.shadowRoot ?? element;
        const button = renderRoot?.querySelector("button");
        return Boolean(
          customElements.get("litsx-button") &&
          button?.textContent?.trim() === "Getting Started" &&
          (selectedStyling === "css" ||
            getComputedStyle(button).fontWeight === "700"),
        );
      }, styling);
    } catch (error) {
      const runtimeState = await page.evaluate(() => {
        const element = document.querySelector("litsx-button");
        return {
          url: location.href,
          title: document.title,
          bodyText: document.body.textContent?.trim().slice(0, 500),
          registered: Boolean(customElements.get("litsx-button")),
          element: element?.outerHTML,
          shadowText: element?.shadowRoot?.textContent?.trim().slice(0, 500),
        };
      });
      throw new Error(
        `Storybook story did not render:\n${JSON.stringify(runtimeState, null, 2)}\n${runtimeErrors.join("\n")}`,
        { cause: error },
      );
    }

    if (runtimeErrors.length > 0) {
      throw new Error(
        `Storybook runtime emitted errors:\n${runtimeErrors.join("\n")}`,
      );
    }
  } finally {
    await browser?.close();
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
}

for (const version of versions) {
  if (!supportedVersions.includes(version)) {
    throw new Error(
      `Unsupported Storybook compatibility target ${version}. Expected one of: ${supportedVersions.join(", ")}.`,
    );
  }

  for (const styling of stylingOptions) {
    const tempRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), `litsx-storybook-${version}-${styling}-`),
    );
    const fixtureDir = path.join(tempRoot, "generated-design-system");
    const cacheDir = path.join(os.tmpdir(), "litsx-storybook-npm-cache");
    let passed = false;

    try {
      createProject(fixtureDir, { template: "design-system", styling });
      const packagePath = path.join(fixtureDir, "package.json");
      const packageJson = JSON.parse(fs.readFileSync(packagePath, "utf8"));

      const localLitsxPackages = {
        "@litsx/authoring": "authoring",
        "@litsx/babel-plugin-shared-hooks": "babel-plugin-shared-hooks",
        "@litsx/babel-plugin-transform-jsx-html-template":
          "babel-plugin-transform-jsx-html-template",
        "@litsx/babel-plugin-transform-litsx-scoped-elements":
          "babel-plugin-transform-litsx-scoped-elements",
        "@litsx/babel-preset-litsx": "babel-preset-litsx",
        "@litsx/compiler": "compiler",
        "@litsx/core": "core",
        "@litsx/eslint-plugin": "eslint-plugin-litsx",
        "@litsx/scoped-registry-shim": "scoped-registry-shim",
        "@litsx/storybook": "storybook",
        "@litsx/tailwind": "tailwind",
        "@litsx/typescript-session": "typescript-session",
        "@litsx/unocss": "unocss",
        "@litsx/vite-plugin": "vite-plugin",
      };
      for (const [packageName, directory] of Object.entries(
        localLitsxPackages,
      )) {
        packageJson.devDependencies[packageName] =
          `file:${path.join(repoRoot, "packages", directory)}`;
      }
      for (const packageName of [
        "storybook",
        "@storybook/addon-a11y",
        "@storybook/addon-docs",
        "@storybook/web-components-vite",
      ]) {
        packageJson.devDependencies[packageName] = version;
      }
      fs.writeFileSync(
        packagePath,
        `${JSON.stringify(packageJson, null, 2)}\n`,
        "utf8",
      );

      console.log(
        `\n[storybook ${version} / ${styling}] install generated fixture`,
      );
      runNpm(fixtureDir, ["install", "--loglevel=error"], cacheDir);
      console.log(
        `\n[storybook ${version} / ${styling}] install fixture Playwright Chromium`,
      );
      installFixtureChromium(fixtureDir, cacheDir);
      for (const script of ["build", "typecheck", "test", "build-storybook"]) {
        console.log(`\n[storybook ${version} / ${styling}] npm run ${script}`);
        runNpm(fixtureDir, ["run", script], cacheDir);
      }
      console.log(
        `\n[storybook ${version} / ${styling}] validate registered story runtime`,
      );
      await assertBuiltStoryRuntime(fixtureDir, styling);
      passed = true;
    } finally {
      if (passed) {
        fs.rmSync(tempRoot, { recursive: true, force: true });
      } else {
        console.error(
          `Storybook fixture preserved for inspection: ${tempRoot}`,
        );
      }
    }
  }
}

console.log(
  `Storybook scaffold compatibility passed: ${versions.join(", ")} × ${stylingOptions.join(", ")}`,
);
