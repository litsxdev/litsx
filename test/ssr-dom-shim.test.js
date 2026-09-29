import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { describe, it } from "vitest";

const workspaceRoot = path.resolve(import.meta.dirname, "..");

function copyPackage(packageName, targetNodeModules) {
  const source = path.join(workspaceRoot, "node_modules", ...packageName.split("/"));
  const target = path.join(targetNodeModules, ...packageName.split("/"));
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.cpSync(source, target, { recursive: true });
}

function createIndependentLitTree(tempRoot) {
  const nodeModules = path.join(tempRoot, "node_modules");
  for (const packageName of [
    "lit",
    "lit-element",
    "lit-html",
    "@lit/reactive-element",
    "@lit-labs/ssr-dom-shim",
  ]) {
    copyPackage(packageName, nodeModules);
  }
}

function createIndependentInstallerTree(tempRoot) {
  const nodeModules = path.join(tempRoot, "node_modules");
  for (const packageName of [
    "@lit-labs/ssr",
    "@lit-labs/ssr-dom-shim",
    "node-fetch",
    "data-uri-to-buffer",
    "fetch-blob",
    "formdata-polyfill",
    "node-domexception",
    "web-streams-polyfill",
  ]) {
    copyPackage(packageName, nodeModules);
  }
  fs.copyFileSync(
    path.join(workspaceRoot, "packages/ssr/src/install-dom-shim.js"),
    path.join(tempRoot, "install-dom-shim.mjs"),
  );
}

function runIsolatedModule(source, options = {}) {
  return execFileSync(
    process.execPath,
    [...(options.nodeArgs ?? []), "--input-type=module", "--eval", source],
    {
      cwd: options.cwd ?? workspaceRoot,
      encoding: "utf8",
      env: {
        ...process.env,
        NODE_NO_WARNINGS: "1",
      },
    },
  );
}

describe("@litsx/ssr DOM shim initialization", () => {
  it("installs one DOM identity before Lit from an independent application tree", () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "litsx-ssr-dom-shim-"));
    createIndependentLitTree(tempRoot);

    const componentPath = path.join(tempRoot, "component.mjs");
    fs.writeFileSync(
      componentPath,
      `import { LitElement, html } from "lit";

export class IndependentCard extends LitElement {
  static [Symbol.for("litsx.component")] = true;
  static [Symbol.for("litsx.hydratableTag")] = "independent-card";
  static [Symbol.for("litsx.moduleId")] = "/src/IndependentCard.tsx";

  render() {
    return html\`<strong>independent tree</strong>\`;
  }
}
`,
    );

    const ssrEntryUrl = pathToFileURL(
      path.join(workspaceRoot, "packages/ssr/src/index.js"),
    ).href;
    const elementsEntryUrl = pathToFileURL(
      path.join(workspaceRoot, "packages/core/src/elements/index.js"),
    ).href;
    const componentUrl = pathToFileURL(componentPath).href;
    const output = runIsolatedModule(`
      const { html, renderToString } = await import(${JSON.stringify(ssrEntryUrl)});
      const { IndependentCard } = await import(${JSON.stringify(componentUrl)});
      const { annotateHydratableCustomElement } = await import(${JSON.stringify(elementsEntryUrl)});
      annotateHydratableCustomElement(IndependentCard, {
        tagName: "independent-card",
        moduleId: "/src/IndependentCard.tsx",
      });
      const result = await renderToString(
        html\`<independent-card></independent-card>\`,
        {
          elements: { "independent-card": IndependentCard },
        },
      );

      if (!(IndependentCard.prototype instanceof globalThis.HTMLElement)) {
        throw new Error("The application component does not share the installed HTMLElement");
      }
      process.stdout.write(JSON.stringify({
        html: result.html,
        hydrationData: result.hydrationData,
      }));
    `, { cwd: tempRoot });
    const result = JSON.parse(output);

    assert.match(result.html, /<independent-card\b/);
    assert.match(result.html, /<template shadowroot="open"/);
    assert.match(result.html, /independent tree/);
    assert.deepStrictEqual(result.hydrationData.roots, [{
      id: "litsx-root-0",
      tagName: "independent-card",
      moduleId: "/src/IndependentCard.tsx",
    }]);
  });

  it("reexports html only after installing the server DOM", () => {
    const output = runIsolatedModule(`
      const { html } = await import("@litsx/ssr");
      const value = html\`<main>ready</main>\`;
      process.stdout.write(String(
        typeof globalThis.HTMLElement === "function" &&
        value.strings[0] === "<main>ready</main>"
      ));
    `);

    assert.strictEqual(output, "true");
  });

  it("is safe to import more than once", () => {
    const output = runIsolatedModule(`
      await import("@litsx/ssr/install-dom-shim");
      const firstWindow = globalThis.window;
      const firstHTMLElement = globalThis.HTMLElement;
      await import("@litsx/ssr/install-dom-shim");
      process.stdout.write(String(
        firstWindow === globalThis.window &&
        firstHTMLElement === globalThis.HTMLElement
      ));
    `);

    assert.strictEqual(output, "true");
  });

  it("does not replace globals when two physical initializer trees are loaded", () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "litsx-ssr-installers-"));
    const firstTree = path.join(tempRoot, "first");
    const secondTree = path.join(tempRoot, "second");
    fs.mkdirSync(firstTree, { recursive: true });
    fs.mkdirSync(secondTree, { recursive: true });
    createIndependentInstallerTree(firstTree);
    createIndependentInstallerTree(secondTree);

    const firstUrl = pathToFileURL(path.join(firstTree, "install-dom-shim.mjs")).href;
    const secondUrl = pathToFileURL(path.join(secondTree, "install-dom-shim.mjs")).href;
    const output = runIsolatedModule(`
      await import(${JSON.stringify(firstUrl)});
      const firstWindow = globalThis.window;
      const firstHTMLElement = globalThis.HTMLElement;
      await import(${JSON.stringify(secondUrl)});
      process.stdout.write(String(
        firstWindow === globalThis.window &&
        firstHTMLElement === globalThis.HTMLElement
      ));
    `, { cwd: tempRoot });

    assert.strictEqual(output, "true");
  });

  it("preserves a pre-existing global window", () => {
    const initializerUrl = pathToFileURL(
      path.join(workspaceRoot, "packages/ssr/src/install-dom-shim.js"),
    ).href;
    const output = runIsolatedModule(`
      class ConsumerHTMLElement {}
      const existingWindow = {
        installedByConsumer: true,
        HTMLElement: ConsumerHTMLElement,
      };
      globalThis.window = existingWindow;
      globalThis.HTMLElement = ConsumerHTMLElement;
      await import(${JSON.stringify(initializerUrl)});
      process.stdout.write(String(
        globalThis.window === existingWindow &&
        globalThis.HTMLElement === ConsumerHTMLElement
      ));
    `);

    assert.strictEqual(output, "true");
  });

  it("does not install SSR globals from browser entries", () => {
    const hydrationUrl = pathToFileURL(
      path.join(workspaceRoot, "packages/ssr/src/hydration.js"),
    ).href;
    const browserInitializerOutput = runIsolatedModule(`
      const hadWindow = Object.hasOwn(globalThis, "window");
      const hadDocument = Object.hasOwn(globalThis, "document");
      await import("@litsx/ssr/install-dom-shim");
      process.stdout.write(JSON.stringify({
        windowInstalled: !hadWindow && Object.hasOwn(globalThis, "window"),
        documentInstalled: !hadDocument && Object.hasOwn(globalThis, "document"),
      }));
    `, { nodeArgs: ["--conditions=browser"] });
    const hydrationOutput = runIsolatedModule(`
      const hadWindow = Object.hasOwn(globalThis, "window");
      const hadDocument = Object.hasOwn(globalThis, "document");
      await import(${JSON.stringify(hydrationUrl)});
      process.stdout.write(JSON.stringify({
        windowInstalled: !hadWindow && Object.hasOwn(globalThis, "window"),
        documentInstalled: !hadDocument && Object.hasOwn(globalThis, "document"),
      }));
    `);

    const expected = {
      windowInstalled: false,
      documentInstalled: false,
    };
    assert.deepStrictEqual(JSON.parse(browserInitializerOutput), expected);
    assert.deepStrictEqual(JSON.parse(hydrationOutput), expected);
  });
});
