import assert from "assert";
import fs from "fs";
import os from "os";
import path from "path";
import { describe, it, vi } from "vitest";

import { litsx } from "../packages/vite-plugin/src/index.js";
import * as compilerModule from "../packages/compiler/src/index.js";

describe("@litsx/vite-plugin", () => {
  it("transforms jsx and returns code with a sourcemap", async () => {
    const plugin = litsx({ sourceMaps: true });
    const source = [
      "export const Counter = () => {",
      "  return <button @click={save}>Hi</button>;",
      "};",
    ].join("\n");

    const result = await plugin.transform(source, "/virtual/Counter.jsx");

    assert.ok(result);
    assert.match(result.code, /html`/);
    assert.ok(result.map);
  }, 30000);

  it("transforms .litsx files and returns code with a sourcemap", async () => {
    const plugin = litsx({ sourceMaps: true });
    const source = [
      "export const Counter = ({ label }: { label: string }) => {",
      "  return <button @click={save}>{label}</button>;",
      "};",
    ].join("\n");

    const result = await plugin.transform(source, "/virtual/Counter.litsx");

    assert.ok(result);
    assert.match(result.code, /html`/);
    assert.ok(result.map);
  }, 30000);

  it("ignores non-matching files by default", async () => {
    const plugin = litsx();
    const result = await plugin.transform("export const value = 1;", "/virtual/value.js");

    assert.strictEqual(result, null);
  });

  it("supports custom include filters", async () => {
    const plugin = litsx({
      include: (id) => id.endsWith(".demo"),
    });
    const source = "export const Counter = () => <button @click={save}>Hi</button>;";

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
    const source = "export const Counter = () => <button @click={save}>Hi</button>;";

    const transformed = await plugin.transform(source, "/virtual/example.demo");
    const ignored = await plugin.transform(source, "/virtual/example.jsx");

    assert.ok(transformed);
    assert.match(transformed.code, /html`/);
    assert.strictEqual(ignored, null);
  }, 30000);

  it("adds an optimizeDeps esbuild plugin that compiles LitSX-authored jsx during dependency scanning", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "litsx-vite-optimize-deps-"));
    const sourcePath = path.join(tempDir, "Counter.jsx");
    fs.writeFileSync(
      sourcePath,
      'export const Counter = () => { ^styles(`:host { display: block; }`); return <button @click={save}>Hi</button>; };',
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
    const config = plugin.config({ optimizeDeps: { esbuildOptions: { plugins: [] } } });
    const scanPlugin = config.optimizeDeps.esbuildOptions.plugins.at(-1);
    const onLoad = vi.fn();

    try {
      scanPlugin.setup({
        onLoad,
      });

      assert.strictEqual(scanPlugin.name, "litsx-optimize-deps");
      assert.strictEqual(onLoad.mock.calls.length, 1);

      const [, handler] = onLoad.mock.calls[0];
      const result = await handler({ path: sourcePath });

      assert.ok(result);
      assert.strictEqual(result.loader, "js");
      assert.strictEqual(result.contents, "export const value = 1;");
      assert.strictEqual(transformSync.mock.calls.length, 1);
      assert.strictEqual(transformSync.mock.calls[0][1].filename, sourcePath);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
      sessionSpy.mockRestore();
    }
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
    const config = plugin.config({ optimizeDeps: { esbuildOptions: {} } });
    const scanPlugin = config.optimizeDeps.esbuildOptions.plugins.at(-1);
    const onLoad = vi.fn();

    try {
      scanPlugin.setup({ onLoad });
      const [, handler] = onLoad.mock.calls[0];
      const result = await handler({ path: "/virtual/example.jsx" });

      assert.strictEqual(result, null);
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
    const source = "export const Counter = () => <button @click={save}>Hi</button>;";

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
        "export const Broken = () => <button @click=>Hi</button>;",
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
        () => plugin.transform("export const Broken = () => <button @click=>Hi</button>;", "/virtual/Broken.jsx"),
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
