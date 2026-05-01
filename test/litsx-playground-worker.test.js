import assert from "assert";
import { afterEach, describe, expect, it, vi } from "vitest";

const originalSelf = globalThis.self;
const originalProcess = globalThis.process;
const originalGlobal = globalThis.global;

describe("@litsx/playground worker entrypoints", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();

    if (originalSelf === undefined) {
      delete globalThis.self;
    } else {
      globalThis.self = originalSelf;
    }

    if (originalProcess === undefined) {
      delete globalThis.process;
    } else {
      globalThis.process = originalProcess;
    }

    if (originalGlobal === undefined) {
      delete globalThis.global;
    } else {
      globalThis.global = originalGlobal;
    }
  });

  it("installs browser-like process shims when missing", async () => {
    const { installLitsxPlaygroundWorkerShims } = await import(
      "../packages/litsx-playground/src/litsx-playground.worker-shims.js"
    );
    const workerScope = {};

    installLitsxPlaygroundWorkerShims(workerScope);

    assert.strictEqual(workerScope.process.browser, true);
    assert.strictEqual(workerScope.process.cwd(), "/");
    assert.strictEqual(workerScope.global, workerScope);
  });

  it("routes successful worker compile messages back to self.postMessage", async () => {
    vi.doMock("../packages/litsx-playground/src/litsx-playground-compiler.js", () => ({
      compileLitsxPlayground: vi.fn(async () => ({
        code: "export const Demo = true;",
        metadata: {
          litsxWarnings: [{ message: "warning" }],
        },
      })),
    }));

    const selfScope = {
      postMessage: vi.fn(),
    };
    globalThis.self = selfScope;

    await import("../packages/litsx-playground/src/litsx-playground.worker.js");
    await selfScope.onmessage({
      data: {
        id: 7,
        source: "export function Demo() { return <p>Hello</p>; }",
        filename: "/playground/Demo.tsx",
        mode: "react-compat",
      },
    });

    expect(selfScope.postMessage).toHaveBeenCalledWith({
      id: 7,
      ok: true,
      code: "export const Demo = true;",
      warnings: [{ message: "warning" }],
    });
  });

  it("serializes worker compile failures into safe message payloads", async () => {
    vi.doMock("../packages/litsx-playground/src/litsx-playground-compiler.js", () => ({
      compileLitsxPlayground: vi.fn(async () => {
        throw new Error("compile exploded");
      }),
    }));

    const selfScope = {
      postMessage: vi.fn(),
    };
    globalThis.self = selfScope;

    await import("../packages/litsx-playground/src/litsx-playground.worker.js");
    await selfScope.onmessage({
      data: {
        id: 8,
        source: "broken",
      },
    });

    expect(selfScope.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 8,
        ok: false,
        error: "compile exploded",
      })
    );
    expect(selfScope.postMessage.mock.calls[0][0].stack).toMatch(/compile exploded/);
  });

  it("uses fallback filenames and empty warnings when worker payloads are partial", async () => {
    const compileLitsxPlayground = vi.fn(async () => ({
      code: "export const Demo = 1;",
      metadata: {},
    }));
    vi.doMock("../packages/litsx-playground/src/litsx-playground-compiler.js", () => ({
      compileLitsxPlayground,
    }));

    const selfScope = {
      postMessage: vi.fn(),
    };
    globalThis.self = selfScope;

    await import("../packages/litsx-playground/src/litsx-playground.worker.js");
    await selfScope.onmessage({
      data: {
        id: 9,
        source: "export const Demo = 1;",
      },
    });

    expect(compileLitsxPlayground).toHaveBeenCalledWith("export const Demo = 1;", {
      filename: "/playground/App.tsx",
      mode: undefined,
    });
    expect(selfScope.postMessage).toHaveBeenCalledWith({
      id: 9,
      ok: true,
      code: "export const Demo = 1;",
      warnings: [],
    });
  });

  it("stringifies non-Error worker failures safely", async () => {
    vi.doMock("../packages/litsx-playground/src/litsx-playground-compiler.js", () => ({
      compileLitsxPlayground: vi.fn(async () => {
        throw "bad compile";
      }),
    }));

    const selfScope = {
      postMessage: vi.fn(),
    };
    globalThis.self = selfScope;

    await import("../packages/litsx-playground/src/litsx-playground.worker.js");
    await selfScope.onmessage({});

    expect(selfScope.postMessage).toHaveBeenCalledWith({
      id: undefined,
      ok: false,
      error: "bad compile",
      stack: "",
    });
  });
});
