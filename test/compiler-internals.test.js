import assert from "assert";
import { beforeEach, describe, expect, it, vi } from "vitest";

const transformFromAstAsync = vi.fn();
const transformFromAstSync = vi.fn();
const patchLitAttributeSourcemap = vi.fn();
const createLitsxPresetPlugins = vi.fn();
const detectLitsxSourceFeatures = vi.fn();
const prepareLitsxAuthoredInput = vi.fn();
const mergeLitsxWarnings = vi.fn();
const ensureTypescriptModule = vi.fn();
const createLitsxTypecheckSession = vi.fn();
const createStandaloneTsSession = vi.fn();
const normalizeFilePath = vi.fn((value = "") => String(value).replace(/\\/g, "/"));

vi.mock("@babel/core", () => ({
  default: {
    transformFromAstAsync,
    transformFromAstSync,
  },
}));

vi.mock("@litsx/babel-plugin-transform-jsx-html-template", () => ({
  default: "jsx-template-plugin",
  patchLitAttributeSourcemap,
}));

vi.mock("@litsx/babel-preset-litsx", () => ({
  createLitsxPresetPlugins,
  detectLitsxSourceFeatures,
}));

vi.mock("@litsx/babel-preset-litsx/internal/transform-litsx-properties", () => ({
  ensureTypescriptModule,
}));

vi.mock("@litsx/typescript/typecheck", () => ({
  createLitsxTypecheckSession,
}));

vi.mock("@litsx/typescript-session", () => ({
  createStandaloneTsSession,
  normalizeFilePath,
}));

vi.mock("../packages/compiler/src/authored-input.js", () => ({
  ensureLitsxParserPlugins: vi.fn(),
  prepareLitsxAuthoredInput,
}));

vi.mock("../packages/compiler/src/warnings.js", () => ({
  mergeLitsxWarnings,
}));

describe("compiler internals", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();

    ensureTypescriptModule.mockReturnValue({
      ScriptTarget: { ESNext: "ESNext" },
      ModuleKind: { ESNext: "ESNext" },
      ModuleResolutionKind: { Bundler: "Bundler" },
      JsxEmit: { Preserve: "Preserve" },
    });

    createStandaloneTsSession.mockReturnValue({
      invalidate: vi.fn(),
      clearOverlayFiles: vi.fn(),
    });

    createLitsxTypecheckSession.mockImplementation((args, options = {}) => ({
      projectSession: options.projectSession || {
        invalidate: vi.fn(),
        clearOverlayFiles: vi.fn(),
      },
    }));

    detectLitsxSourceFeatures.mockReturnValue({
      hooks: false,
      domRefs: false,
      scopedElements: false,
    });

    prepareLitsxAuthoredInput.mockReturnValue({
      filename: "/virtual/Example.jsx",
      virtualization: { map: { version: 3 } },
      inputAst: { type: "File" },
      authoredWarnings: [{ code: "WARN" }],
    });

    createLitsxPresetPlugins.mockReturnValue(["preset-plugin"]);
    mergeLitsxWarnings.mockImplementation((existing, authored) => [...existing, ...authored]);
    patchLitAttributeSourcemap.mockReturnValue({ patched: true });
    transformFromAstAsync.mockReset();
    transformFromAstSync.mockReset();
  });

  it("sync transform returns empty output when Babel yields no result", async () => {
    transformFromAstSync.mockReturnValue(null);
    const mod = await import("../packages/compiler/src/index.js");

    const result = mod.transformLitsxSync("export const Example = () => <div />;", {
      filename: "/virtual/Example.jsx",
      jsxTemplate: false,
    });

    assert.strictEqual(result.code, "");
    assert.strictEqual(result.map, null);
    assert.deepStrictEqual(result.metadata, {});
  });

  it("async transform patches sourcemaps when template mappings are emitted", async () => {
    transformFromAstAsync
      .mockResolvedValueOnce({
        ast: { type: "File" },
        code: "first-pass",
        map: { first: true },
        metadata: {
          litsxTemplateAttributeMappings: [{ from: 1, to: 2 }],
          litsxWarnings: [{ code: "FIRST" }],
        },
      })
      .mockResolvedValueOnce({
        code: "second-pass",
        map: { second: true },
        metadata: {
          litsxWarnings: [{ code: "SECOND" }],
        },
      });

    const mod = await import("../packages/compiler/src/index.js");
    const result = await mod.transformLitsx("export const Example = () => <div />;", {
      filename: "/virtual/Example.jsx",
      sourceMaps: true,
    });

    expect(transformFromAstAsync).toHaveBeenCalledTimes(2);
    expect(patchLitAttributeSourcemap).toHaveBeenCalledTimes(1);
    assert.deepStrictEqual(result.map, { patched: true });
    assert.deepStrictEqual(
      result.metadata.litsxWarnings,
      [{ code: "SECOND" }, { code: "WARN" }]
    );
  });

  it("async transform reuses provided compilation sessions and skips the final template pass when disabled", async () => {
    transformFromAstAsync.mockResolvedValue({
      code: "native-pass",
      map: { native: true },
      metadata: {},
    });

    const mod = await import("../packages/compiler/src/index.js");
    const session = mod.createLitsxCompilationSession({
      transformOptions: { jsxTemplate: false },
    });

    try {
      const result = await mod.transformLitsx("export const Example = () => <div />;", {
        filename: "/virtual/Example.jsx",
        jsxTemplate: false,
        __litsxCompilationSession: session,
      });

      expect(transformFromAstAsync).toHaveBeenCalledTimes(1);
      assert.deepStrictEqual(result.map, null);
    } finally {
      session.dispose();
    }
  });

  it("sync transform runs the template lowering pass and preserves profile metadata when profiling is enabled", async () => {
    process.env.LITSX_PROFILE = "1";
    vi.resetModules();

    transformFromAstSync
      .mockReturnValueOnce({
        ast: { type: "File" },
        code: "first-pass",
        map: { first: true },
        metadata: {
          litsxTemplateAttributeMappings: [{ from: 1, to: 2 }],
        },
      })
      .mockReturnValueOnce({
        code: "second-pass",
        map: { second: true },
        metadata: {},
      });

    const mod = await import("../packages/compiler/src/index.js");
    const result = mod.transformLitsxSync("export const Example = () => <div />;", {
      filename: "/virtual/Example.jsx",
      sourceMaps: true,
    });

    expect(transformFromAstSync).toHaveBeenCalledTimes(2);
    expect(patchLitAttributeSourcemap).toHaveBeenCalledTimes(1);
    assert.ok(Array.isArray(result.metadata.litsxProfile));

    delete process.env.LITSX_PROFILE;
  });

  it("normalizes final sourcemap sourcesContent back to the authored source", async () => {
    transformFromAstSync.mockReturnValue({
      code: "compiled-output",
      map: {
        version: 3,
        sources: ["/virtual/Example.litsx"],
        sourcesContent: ["const compiled = true;"],
        names: [],
        mappings: "",
      },
      metadata: {},
    });

    const mod = await import("../packages/compiler/src/index.js");
    const source = "export const Example = () => <div />;";
    const result = mod.transformLitsxSync(source, {
      filename: "/virtual/Example.litsx",
      jsxTemplate: false,
      sourceMaps: true,
    });

    assert.deepStrictEqual(result.map.sources, ["/virtual/Example.litsx"]);
    assert.deepStrictEqual(result.map.sourcesContent, [source]);
  });

  it("uses session-level typecheck sessions when a compilation session is project-backed", async () => {
    const projectSession = {
      invalidate: vi.fn(),
      clearOverlayFiles: vi.fn(),
    };
    createLitsxTypecheckSession.mockImplementation((args, options = {}) => ({
      projectSession: options.projectSession || projectSession,
    }));

    const mod = await import("../packages/compiler/src/index.js");
    const session = mod.createLitsxCompilationSession({
      projectPath: "/virtual/tsconfig.json",
    });

    try {
      const wrapped = session.getTypecheckSession(["--project", "/virtual/tsconfig.json"]);
      assert.strictEqual(wrapped.projectSession, session.typescriptSession);
    } finally {
      session.dispose();
    }
  });

  it("creates standalone sessions with default typecheck args and invalidates authored jsx overlays", async () => {
    const standaloneSession = {
      invalidate: vi.fn(),
      clearOverlayFiles: vi.fn(),
    };
    createStandaloneTsSession.mockReturnValueOnce(standaloneSession);

    const mod = await import("../packages/compiler/src/index.js");
    const session = mod.createLitsxCompilationSession({
      transformOptions: { filename: "Component.litsx.jsx" },
    });

    try {
      const wrapped = session.getTypecheckSession();
      expect(createLitsxTypecheckSession).toHaveBeenLastCalledWith([], {
        projectSession: session.typescriptSession,
      });
      assert.strictEqual(wrapped.projectSession, session.typescriptSession);

      session.invalidate(["/virtual/Component.litsx.jsx"]);
      expect(standaloneSession.invalidate).toHaveBeenCalled();
    } finally {
      session.dispose();
    }
  });

  it("handles async template lowering when the first pass omits ast, code, metadata and sourcemaps", async () => {
    transformFromAstAsync
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({
        code: "",
        map: null,
        metadata: null,
      });

    const mod = await import("../packages/compiler/src/index.js");
    const result = await mod.transformLitsx("export const Example = () => <div />;", {
      filename: "/virtual/Example.jsx",
      sourceMaps: true,
    });

    expect(transformFromAstAsync).toHaveBeenCalledTimes(2);
    expect(transformFromAstAsync.mock.calls[1][1]).toBe("export const Example = () => <div />;");
    assert.strictEqual(result.code, "");
    assert.strictEqual(result.map, null);
    assert.deepStrictEqual(result.metadata.litsxWarnings, [{ code: "WARN" }]);
  });

  it("keeps empty-result profile metadata and preserves null maps when template lowering is disabled", async () => {
    process.env.LITSX_PROFILE = "1";
    vi.resetModules();
    transformFromAstSync.mockReturnValue(null);

    const mod = await import("../packages/compiler/src/index.js");
    const result = mod.transformLitsxSync("export const Example = () => <div />;");

    assert.strictEqual(result.code, "");
    assert.strictEqual(result.map, null);
    assert.ok(Array.isArray(result.metadata.litsxProfile));

    delete process.env.LITSX_PROFILE;
  });

  it("builds configs for missing source features and primitive memoization keys", async () => {
    detectLitsxSourceFeatures.mockReturnValueOnce(null);

    const mod = await import("../packages/compiler/src/index.js");
    const config = mod.createLitsxTransformConfig("export const Example = () => <div />;", {
      jsxTemplate: false,
      __litsxMemoizeOptions: "memo-key",
    });

    assert.strictEqual(config.shouldRunFinalTemplatePass, false);
    assert.deepStrictEqual(config.finalTemplatePlugins, []);
    assert.deepStrictEqual(config.babelOptions.plugins, ["preset-plugin"]);
  });

  it("reuses session preset-plugin caches for primitive memoization keys and bare filenames", async () => {
    const mod = await import("../packages/compiler/src/index.js");
    const session = mod.createLitsxCompilationSession({
      transformOptions: { filename: "Entry.jsx" },
    });

    try {
      const first = mod.createLitsxTransformConfig("export const Example = () => <div />;", {
        filename: "Entry.jsx",
        jsxTemplate: false,
        __litsxCompilationSession: session,
        __litsxMemoizeOptions: "memo-key",
      });
      const second = mod.createLitsxTransformConfig("export const Example = () => <div />;", {
        filename: "Entry.jsx",
        jsxTemplate: false,
        __litsxCompilationSession: session,
        __litsxMemoizeOptions: "memo-key",
      });

      assert.deepStrictEqual(first.babelOptions.plugins, ["preset-plugin"]);
      assert.deepStrictEqual(second.babelOptions.plugins, ["preset-plugin"]);
      expect(createLitsxPresetPlugins).toHaveBeenCalledTimes(1);
    } finally {
      session.dispose();
    }
  });

  it("handles session-backed async template lowering when the first pass omits ast, code and metadata", async () => {
    transformFromAstAsync
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({
        code: "lowered",
        map: null,
        metadata: null,
      });

    const mod = await import("../packages/compiler/src/index.js");
    const session = mod.createLitsxCompilationSession({
      transformOptions: { filename: "/virtual/Example.jsx" },
    });

    try {
      const result = await mod.transformLitsx("export const Example = () => <div />;", {
        filename: "/virtual/Example.jsx",
        __litsxCompilationSession: session,
      });

      expect(transformFromAstAsync).toHaveBeenCalledTimes(2);
      expect(transformFromAstAsync.mock.calls[1][1]).toBe("export const Example = () => <div />;");
      assert.strictEqual(result.code, "lowered");
      assert.deepStrictEqual(result.metadata.litsxWarnings, [{ code: "WARN" }]);
    } finally {
      session.dispose();
    }
  });
});
