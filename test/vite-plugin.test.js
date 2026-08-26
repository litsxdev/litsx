import assert from "assert";
import fs from "fs";
import os from "os";
import path from "path";
import { describe, it, vi } from "vitest";
import { build } from "vite";
import packageJson from "../packages/vite-plugin/package.json" with { type: "json" };

import {
  createLitsxViteAssetResolver,
  litsx,
} from "../packages/vite-plugin/src/index.js";
import * as compilerModule from "../packages/compiler/src/index.js";

describe("@litsx/vite-plugin", () => {
  it("publishes the Vite plugin runtime and declarations from dist", () => {
    assert.strictEqual(packageJson.module, "./src/index.js");
    assert.strictEqual(packageJson.types, "./src/index.d.ts");
    assert.strictEqual(packageJson.exports["."].import, "./src/index.js");
    assert.strictEqual(packageJson.exports["."].types, "./src/index.d.ts");
    assert.deepStrictEqual(packageJson.files, ["dist", "src", "README.md"]);
  });

  it("creates a dev asset resolver from the Vite project root", () => {
    const resolver = createLitsxViteAssetResolver({
      root: "/repo",
    });

    assert.strictEqual(
      resolver("/repo/src/components/ProductCard.tsx"),
      "/src/components/ProductCard.tsx",
    );
  });

  it("resolves build assets through a Vite manifest", () => {
    const resolver = createLitsxViteAssetResolver({
      root: "/repo",
      base: "/app/",
      manifest: {
        "src/components/ProductCard.tsx": {
          file: "assets/ProductCard.abcd1234.js",
        },
      },
    });

    assert.strictEqual(
      resolver("/repo/src/components/ProductCard.tsx"),
      "/app/assets/ProductCard.abcd1234.js",
    );
  });

  it("resolves manifest entries with dot-prefixed keys and normalized base paths", () => {
    const resolver = createLitsxViteAssetResolver({
      root: "/repo",
      base: "nested/app",
      manifest: {
        "./src/components/ProductCard.tsx": {
          file: "assets/ProductCard.abcd1234.js",
        },
      },
    });

    assert.strictEqual(
      resolver("/repo/src/components/ProductCard.tsx"),
      "/nested/app/assets/ProductCard.abcd1234.js",
    );
  });

  it("returns null for LitSX SSR assets outside the Vite root", () => {
    const resolver = createLitsxViteAssetResolver({
      root: "/repo",
    });

    assert.strictEqual(
      resolver("/external/ProductCard.tsx"),
      null,
    );
  });

  it("resolves file URL module ids for SSR asset collection", () => {
    const resolver = createLitsxViteAssetResolver({
      root: "/repo",
      base: "/",
    });

    assert.strictEqual(
      resolver("file:///repo/src/components/ProductCard.tsx"),
      "/src/components/ProductCard.tsx",
    );
  });

  it("transforms jsx and returns code with a sourcemap", async () => {
    const plugin = litsx({ sourceMaps: true });
    const source = [
      "export const TestCounter = () => {",
      "  return <button on:click={save}>Hi</button>;",
      "};",
    ].join("\n");

    const result = await plugin.transform(source, "/virtual/TestCounter.jsx");

    assert.ok(result);
    assert.match(result.code, /html`/);
    assert.ok(result.map);
  }, 30000);

  it("transforms .tsx files and returns code with a sourcemap", async () => {
    const plugin = litsx({ sourceMaps: true });
    const source = [
      "export const TestCounter = ({ label }: { label: string }) => {",
      "  return <button on:click={save}>{label}</button>;",
      "};",
    ].join("\n");

    const result = await plugin.transform(source, "/virtual/TestCounter.tsx");

    assert.ok(result);
    assert.match(result.code, /html`/);
    assert.ok(result.map);
  }, 30000);

  it("transforms project JavaScript and TypeScript but ignores files outside the Vite root", async () => {
    const plugin = litsx();
    plugin.configResolved({ root: "/virtual", cacheDir: "/virtual/.vite-cache" });

    const javascript = await plugin.transform(
      "export const value = 1;",
      "/virtual/value.js",
    );
    const typescript = await plugin.transform(
      "export const value: number = 1;",
      "/virtual/value.ts",
    );
    const external = await plugin.transform(
      "export const value = 1;",
      "/workspace/runtime.js",
    );
    const dependency = await plugin.transform(
      "export const value = 1;",
      "/virtual/node_modules/plain-package/index.js",
    );
    const optimizedDependency = await plugin.transform(
      "export const value = 1;",
      "/virtual/.vite-cache/deps/lit.js?v=abc123",
    );

    assert.ok(javascript);
    assert.ok(typescript);
    assert.strictEqual(external, null);
    assert.strictEqual(dependency, null);
    assert.strictEqual(optimizedDependency, null);
  });

  it("transforms generic TypeScript module ids with Vite query strings", async () => {
    const plugin = litsx();
    const result = await plugin.transform(
      "export const deepFreeze = <T>(value: T): T => value;",
      "/virtual/module.ts?import",
    );

    assert.ok(result);
    assert.match(result.code, /const deepFreeze = value => value/);
  });

  it("transforms generic TypeScript during optimize-deps scanning", async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "litsx-vite-ts-scan-"));
    const filename = path.join(directory, "module.ts");
    fs.writeFileSync(
      filename,
      "export const deepFreeze = <T>(value: T): T => value;",
      "utf8",
    );
    const plugin = litsx();
    plugin.configResolved({ root: directory, cacheDir: path.join(directory, ".vite") });
    const config = plugin.config({ optimizeDeps: { rolldownOptions: {} } });
    const scanPlugin = config.optimizeDeps.rolldownOptions.plugins.at(-1);

    try {
      const result = await scanPlugin.load(filename);
      assert.ok(result);
      assert.match(result.code, /const deepFreeze = value => value/);
    } finally {
      plugin.buildEnd();
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  it("runs react-compat for allowlisted dependencies in client and SSR pipelines", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "litsx-vite-react-dep-"));
    try {
      const packageDir = path.join(tempDir, "node_modules", "resize-hooks");
      fs.mkdirSync(packageDir, { recursive: true });
      fs.writeFileSync(path.join(packageDir, "package.json"), JSON.stringify({
        name: "resize-hooks",
        type: "module",
        exports: "./index.js",
      }));
      const hookFilename = path.join(packageDir, "index.js");
      const hookSource = `
        import { useEffect } from "react";
        export function useWindowResize(listener) {
          useEffect(() => () => listener(), [listener]);
        }
      `;
      fs.writeFileSync(hookFilename, hookSource);
      const plugin = litsx({
        reactCompat: {
          transformDependencies: ["resize-hooks"],
        },
      });
      const config = plugin.config({
        optimizeDeps: { exclude: ["existing-dependency"] },
        ssr: { noExternal: ["existing-ssr-dependency"] },
      });

      assert.deepStrictEqual(config.optimizeDeps.exclude, [
        "existing-dependency",
        "resize-hooks",
      ]);
      assert.deepStrictEqual(config.ssr.noExternal, [
        "existing-ssr-dependency",
        "resize-hooks",
      ]);

      const result = await plugin.transform(hookSource, hookFilename);
      assert.ok(result);
      assert.match(result.code, /function useWindowResize\(listener\)/);
      assert.doesNotMatch(result.code, /function useWindowResize\(.*host/);
      assert.match(result.code, /useAfterUpdate\(/);
      assert.match(result.code, /Symbol\.for\("litsx\.hook"\)/);

      const componentDir = path.join(tempDir, "src");
      fs.mkdirSync(componentDir, { recursive: true });
      const componentFilename = path.join(componentDir, "ResizePanel.tsx");
      const componentSource = `
        import { useWindowResize } from "resize-hooks";
        export function ResizePanel() {
          useWindowResize(() => {});
          return <section>Ready</section>;
        }
      `;
      fs.writeFileSync(componentFilename, componentSource);
      const componentResult = await plugin.transform(componentSource, componentFilename);
      assert.match(componentResult.code, /useWindowResize\(\(\) => \{\}\)/);
      assert.doesNotMatch(componentResult.code, /useWindowResize\(this,/);
      assert.match(componentResult.code, /html`<section>Ready<\/section>`/);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }, 30000);

  it("supports custom include filters", async () => {
    const plugin = litsx({
      include: (id) => id.endsWith(".demo"),
    });
    const source = "export const TestCounter = () => <button on:click={save}>Hi</button>;";

    const transformed = await plugin.transform(source, "/virtual/example.demo");
    const ignored = await plugin.transform(source, "/virtual/example.jsx");

    assert.ok(transformed);
    assert.match(transformed.code, /html`/);
    assert.strictEqual(ignored, null);
  }, 30000);

  it("supports regexp include filters", async () => {
    const plugin = litsx({
      include: /\.demo$/,
    });
    const source = "export const TestCounter = () => <button on:click={save}>Hi</button>;";

    const transformed = await plugin.transform(source, "/virtual/example.demo");
    const ignored = await plugin.transform(source, "/virtual/example.jsx");

    assert.ok(transformed);
    assert.match(transformed.code, /html`/);
    assert.strictEqual(ignored, null);
  }, 30000);

  it("adds an optimizeDeps rolldown plugin that compiles LitSX-authored jsx during dependency scanning", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "litsx-vite-optimize-deps-"));
    const sourcePath = path.join(tempDir, "TestCounter.jsx");
    fs.writeFileSync(
      sourcePath,
      'export const TestCounter = () => { static styles = `:host { display: block; }`; return <button on:click={save}>Hi</button>; };',
      "utf8",
    );

    const transformSync = vi.fn(() => ({
      code: "export const value = 1;",
      map: null,
      metadata: {},
    }));
    const session = {
      transform: vi.fn(async () => ({ code: "", map: null, metadata: {} })),
      transformSync,
      getTypecheckSession: vi.fn(),
      invalidate: vi.fn(),
      dispose: vi.fn(),
    };
    const sessionSpy = vi
      .spyOn(compilerModule, "createLitsxCompilationSession")
      .mockReturnValue(session);
    const plugin = litsx();
    const config = plugin.config({ optimizeDeps: { rolldownOptions: { plugins: [] } } });
    const scanPlugin = config.optimizeDeps.rolldownOptions.plugins.at(-1);

    try {
      assert.strictEqual(scanPlugin.name, "litsx-optimize-deps");
      const result = await scanPlugin.load(sourcePath);

      assert.ok(result);
      assert.strictEqual(result.moduleType, "js");
      assert.strictEqual(result.code, "export const value = 1;");
      assert.strictEqual(transformSync.mock.calls.length, 1);
      assert.strictEqual(transformSync.mock.calls[0][1].filename, sourcePath);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
      sessionSpy.mockRestore();
    }
  });

  it("dedupes the lit package family in Vite resolve config", () => {
    const plugin = litsx();
    const config = plugin.config({
      resolve: {
        dedupe: ["foo", "lit"],
      },
      optimizeDeps: {
        rolldownOptions: {
          plugins: [],
        },
      },
    });

    assert.deepStrictEqual(config.resolve.dedupe, [
      "foo",
      "lit",
      "lit-html",
      "lit-element",
      "@lit/reactive-element",
      "@lit/context",
    ]);
  });

  it("bundles one production Lit runtime for consumer builds", async () => {
    const previousNodeEnv = process.env.NODE_ENV;
    const tempRoot = path.join(process.cwd(), "test-results");
    fs.mkdirSync(tempRoot, { recursive: true });
    const tempDir = fs.mkdtempSync(
      path.join(tempRoot, "litsx-vite-production-lit-"),
    );
    const entry = path.join(tempDir, "consumer-card.tsx");
    fs.writeFileSync(
      entry,
      `
export function ConsumerCard({ label = "Ready" }) {
  return <article>{label}</article>;
}
`,
      "utf8",
    );

    try {
      // Vite's CLI sets NODE_ENV=production for `vite build`. Vitest sets it to
      // `test`, so mirror the consumer build environment for this programmatic
      // build instead of exercising Lit's development export condition.
      process.env.NODE_ENV = "production";
      const result = await build({
        configFile: false,
        root: tempDir,
        logLevel: "silent",
        plugins: [litsx()],
        build: {
          write: false,
          minify: false,
          lib: {
            entry,
            formats: ["es"],
            fileName: "consumer-card",
          },
        },
      });
      const outputs = Array.isArray(result)
        ? result.flatMap((buildResult) => buildResult.output)
        : result.output;
      const code = outputs
        .filter((output) => output.type === "chunk")
        .map((output) => output.code)
        .join("\n");

      assert.doesNotMatch(code, /Lit is in dev mode|litIssuedWarnings/);
      assert.strictEqual(code.match(/litHtmlVersions/g)?.length ?? 0, 1);
      assert.strictEqual(code.match(/reactiveElementVersions/g)?.length ?? 0, 1);
    } finally {
      if (previousNodeEnv === undefined) {
        delete process.env.NODE_ENV;
      } else {
        process.env.NODE_ENV = previousNodeEnv;
      }
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }, 30000);

  it("drops legacy optimizeDeps rollupOptions when adding rolldown options", () => {
    const existingRolldownPlugin = { name: "existing-rolldown-plugin" };
    const plugin = litsx();
    const config = plugin.config({
      optimizeDeps: {
        include: ["lit"],
        rollupOptions: {
          plugins: [{ name: "legacy-rollup-plugin" }],
        },
        rolldownOptions: {
          plugins: [existingRolldownPlugin],
        },
      },
    });

    assert.strictEqual("rollupOptions" in config.optimizeDeps, false);
    assert.deepStrictEqual(config.optimizeDeps.include, ["lit"]);
    assert.strictEqual(
      config.optimizeDeps.rolldownOptions.plugins[0],
      existingRolldownPlugin,
    );
    assert.strictEqual(
      config.optimizeDeps.rolldownOptions.plugins.at(-1).name,
      "litsx-optimize-deps",
    );
  });

  it("skips optimizeDeps transforms for files outside the include filter", async () => {
    const transformSync = vi.fn();
    const session = {
      transform: vi.fn(async () => ({ code: "", map: null, metadata: {} })),
      transformSync,
      getTypecheckSession: vi.fn(),
      invalidate: vi.fn(),
      dispose: vi.fn(),
    };
    const sessionSpy = vi
      .spyOn(compilerModule, "createLitsxCompilationSession")
      .mockReturnValue(session);
    const plugin = litsx({
      include: /\.demo$/,
    });
    const config = plugin.config({ optimizeDeps: { rolldownOptions: {} } });
    const scanPlugin = config.optimizeDeps.rolldownOptions.plugins.at(-1);

    try {
      const result = await scanPlugin.load("/virtual/example.jsx");

      assert.strictEqual(result, null);
      assert.strictEqual(transformSync.mock.calls.length, 0);
    } finally {
      sessionSpy.mockRestore();
    }
  });

  it("never compiles dependency or prebundled chunks during optimizeDeps scanning", async () => {
    const transformSync = vi.fn();
    const session = {
      transform: vi.fn(),
      transformSync,
      getTypecheckSession: vi.fn(),
      invalidate: vi.fn(),
      dispose: vi.fn(),
    };
    const sessionSpy = vi
      .spyOn(compilerModule, "createLitsxCompilationSession")
      .mockReturnValue(session);
    const plugin = litsx();
    const config = plugin.config({ optimizeDeps: { rolldownOptions: {} } });
    const scanPlugin = config.optimizeDeps.rolldownOptions.plugins.at(-1);
    plugin.configResolved({
      root: "/project",
      cacheDir: "/project/node_modules/.vite",
    });

    try {
      for (const id of [
        "/project/node_modules/minified-dep/index.tsx",
        "node_modules/minified-dep/index.tsx",
        "/project/node_modules/.vite/deps/chunk-ABCD.tsx",
        "/outside/generated/chunk-ABCD.tsx",
        "\0virtual:generated.tsx",
      ]) {
        assert.strictEqual(await scanPlugin.load(id), null, id);
      }
      assert.strictEqual(transformSync.mock.calls.length, 0);
    } finally {
      sessionSpy.mockRestore();
    }
  });

  it("supports custom function-based include filters", async () => {
    const plugin = litsx({
      include(id) {
        return id.includes("/custom-lit-components/") && (id.endsWith(".jsx") || id.endsWith(".tsx"));
      },
      sourceMaps: true,
    });
    const source = "export const TestCounter = () => <button on:click={save}>Hi</button>;";

    const transformed = await plugin.transform(
      source,
      "/repo/custom-lit-components/counter.jsx"
    );
    const ignored = await plugin.transform(
      source,
      "/repo/guides/counter.jsx"
    );

    assert.ok(transformed);
    assert.match(transformed.code, /html`/);
    assert.ok(transformed.map);
    assert.strictEqual(ignored, null);
  }, 30000);

  it("reuses a compilation session across transforms and invalidates on hot updates", async () => {
    const invalidate = vi.fn();
    const dispose = vi.fn();
    const transform = vi.fn(async (code, options) => ({
      code: `${options.filename}:${code}`,
      map: null,
      metadata: {},
    }));
    const session = {
      transform,
      transformSync: vi.fn(),
      getTypecheckSession: vi.fn(),
      invalidate,
      dispose,
    };
    const sessionSpy = vi
      .spyOn(compilerModule, "createLitsxCompilationSession")
      .mockReturnValue(session);

    try {
      const plugin = litsx();
      const first = await plugin.transform("export const one = 1;", "/virtual/one.jsx");
      const second = await plugin.transform("export const two = 2;", "/virtual/two.jsx");

      assert.ok(first);
      assert.ok(second);
      assert.strictEqual(sessionSpy.mock.calls.length, 1);
      assert.strictEqual(transform.mock.calls.length, 2);

      plugin.handleHotUpdate({ file: "/virtual/one.jsx" });
      assert.deepStrictEqual(invalidate.mock.calls[0][0], ["/virtual/one.jsx"]);

      plugin.buildEnd();
      assert.strictEqual(dispose.mock.calls.length, 1);
    } finally {
      sessionSpy.mockRestore();
    }
  });

  it("surfaces LitSX compiler warnings through the Vite plugin context", async () => {
    const transform = vi.fn(async () => ({
      code: "export const value = 1;",
      map: null,
      metadata: {
        litsxWarnings: [
          {
            code: "LITSX_NATIVE_CLASSNAME",
            line: 3,
            column: 14,
            message: "className is not native LitSX syntax.",
          },
        ],
      },
    }));
    const session = {
      transform,
      transformSync: vi.fn(),
      getTypecheckSession: vi.fn(),
      invalidate: vi.fn(),
      dispose: vi.fn(),
    };
    const sessionSpy = vi
      .spyOn(compilerModule, "createLitsxCompilationSession")
      .mockReturnValue(session);
    const warn = vi.fn();

    try {
      const plugin = litsx();
      const result = await plugin.transform.call(
        { warn },
        "export const value = 1;",
        "/virtual/example.jsx"
      );

      assert.ok(result);
      assert.strictEqual(warn.mock.calls.length, 1);
      assert.match(
        warn.mock.calls[0][0],
        /\[LITSX_NATIVE_CLASSNAME\] \/virtual\/example\.jsx:3:14 className is not native LitSX syntax\./
      );
    } finally {
      sessionSpy.mockRestore();
    }
  });

  it("formats fallback LitSX warnings when code or column are missing", async () => {
    const transform = vi.fn(async () => ({
      code: "export const value = 1;",
      map: null,
      metadata: {
        litsxWarnings: [
          {
            line: 3,
            message: "",
          },
        ],
      },
    }));
    const session = {
      transform,
      transformSync: vi.fn(),
      getTypecheckSession: vi.fn(),
      invalidate: vi.fn(),
      dispose: vi.fn(),
    };
    const sessionSpy = vi
      .spyOn(compilerModule, "createLitsxCompilationSession")
      .mockReturnValue(session);
    const warn = vi.fn();

    try {
      const plugin = litsx();
      await plugin.transform.call({ warn }, "export const value = 1;", "/virtual/example.jsx");

      assert.strictEqual(warn.mock.calls.length, 1);
      assert.match(
        warn.mock.calls[0][0],
        /\[LITSX_WARNING\] \/virtual\/example\.jsx:3 LitSX emitted a warning during compilation\./,
      );
    } finally {
      sessionSpy.mockRestore();
    }
  });

  it("dedupes repeated LitSX warnings within the same plugin session", async () => {
    const transform = vi.fn(async () => ({
      code: "export const value = 1;",
      map: null,
      metadata: {
        litsxWarnings: [
          {
            code: "LITSX_NATIVE_CLASSNAME",
            line: 3,
            column: 14,
            message: "className is not native LitSX syntax.",
          },
        ],
      },
    }));
    const session = {
      transform,
      transformSync: vi.fn(),
      getTypecheckSession: vi.fn(),
      invalidate: vi.fn(),
      dispose: vi.fn(),
    };
    const sessionSpy = vi
      .spyOn(compilerModule, "createLitsxCompilationSession")
      .mockReturnValue(session);
    const warn = vi.fn();

    try {
      const plugin = litsx();

      await plugin.transform.call({ warn }, "export const one = 1;", "/virtual/example.jsx");
      await plugin.transform.call({ warn }, "export const two = 2;", "/virtual/example.jsx");

      assert.strictEqual(warn.mock.calls.length, 1);
    } finally {
      sessionSpy.mockRestore();
    }
  });

  it("surfaces compiler failures through the Vite plugin error channel with location context", async () => {
    const compilerError = Object.assign(new SyntaxError("Unexpected token (1:31)"), {
      code: "BABEL_PARSER_SYNTAX_ERROR",
      loc: { line: 1, column: 31 },
    });
    const transform = vi.fn(async () => {
      throw compilerError;
    });
    const session = {
      transform,
      transformSync: vi.fn(),
      getTypecheckSession: vi.fn(),
      invalidate: vi.fn(),
      dispose: vi.fn(),
    };
    const sessionSpy = vi
      .spyOn(compilerModule, "createLitsxCompilationSession")
      .mockReturnValue(session);
    const error = vi.fn((value) => value);

    try {
      const plugin = litsx();
      const result = await plugin.transform.call(
        { error },
        "export const Broken = () => <button on:click=>Hi</button>;",
        "/virtual/Broken.jsx"
      );

      assert.strictEqual(error.mock.calls.length, 1);
      assert.strictEqual(result, error.mock.calls[0][0]);
      assert.match(result.message, /LitSX compilation failed in \/virtual\/Broken\.jsx/);
      assert.strictEqual(result.plugin, "litsx");
      assert.deepStrictEqual(result.loc, {
        file: "/virtual/Broken.jsx",
        line: 1,
        column: 31,
      });
      assert.match(result.frame, /1 \| export const Broken =/);
    } finally {
      sessionSpy.mockRestore();
    }
  });

  it("rethrows enriched compiler failures when no Vite error channel is available", async () => {
    const compilerError = Object.assign(new SyntaxError("Unexpected token (1:31)"), {
      code: "BABEL_PARSER_SYNTAX_ERROR",
      loc: { line: 1, column: 31 },
    });
    const transform = vi.fn(async () => {
      throw compilerError;
    });
    const session = {
      transform,
      transformSync: vi.fn(),
      getTypecheckSession: vi.fn(),
      invalidate: vi.fn(),
      dispose: vi.fn(),
    };
    const sessionSpy = vi
      .spyOn(compilerModule, "createLitsxCompilationSession")
      .mockReturnValue(session);

    try {
      const plugin = litsx();

      await assert.rejects(
        () => plugin.transform("export const Broken = () => <button on:click=>Hi</button>;", "/virtual/Broken.jsx"),
        (error) => {
          assert.match(error.message, /LitSX compilation failed in \/virtual\/Broken\.jsx/);
          assert.strictEqual(error.plugin, "litsx");
          assert.strictEqual(error.code, "BABEL_PARSER_SYNTAX_ERROR");
          assert.deepStrictEqual(error.loc, {
            file: "/virtual/Broken.jsx",
            line: 1,
            column: 31,
          });
          return true;
        }
      );
    } finally {
      sessionSpy.mockRestore();
    }
  });

  it("surfaces compiler failures without location context when no loc is available", async () => {
    const compilerError = new Error("plain failure");
    const transform = vi.fn(async () => {
      throw compilerError;
    });
    const session = {
      transform,
      transformSync: vi.fn(),
      getTypecheckSession: vi.fn(),
      invalidate: vi.fn(),
      dispose: vi.fn(),
    };
    const sessionSpy = vi
      .spyOn(compilerModule, "createLitsxCompilationSession")
      .mockReturnValue(session);
    const error = vi.fn((value) => value);

    try {
      const plugin = litsx();
      const result = await plugin.transform.call(
        { error },
        "export const Broken = true;",
        "/virtual/Broken.jsx",
      );

      assert.strictEqual(result.loc, undefined);
      assert.strictEqual(result.frame, undefined);
      assert.match(result.message, /plain failure/);
    } finally {
      sessionSpy.mockRestore();
    }
  });
});
