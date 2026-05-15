import assert from "assert";
import { createRequire } from "module";
import { describe, it } from "vitest";

const require = createRequire(import.meta.url);

describe("canonical package rename compatibility", () => {
  it("keeps @litsx/litsx compatible with @litsx/core", async () => {
    const core = await import("@litsx/core");
    const compat = await import("@litsx/litsx");
    const coreJsx = await import("@litsx/core/jsx-runtime");
    const compatJsx = await import("@litsx/litsx/jsx-runtime");
    const coreRendering = await import("@litsx/core/rendering");
    const compatRenderContext = await import("@litsx/litsx/internal/runtime-render-context");

    assert.strictEqual(compat.useState, core.useState);
    assert.strictEqual(compat.useEmit, core.useEmit);
    assert.strictEqual(compatJsx.jsx, coreJsx.jsx);
    assert.strictEqual(compatJsx.Fragment, coreJsx.Fragment);
    assert.strictEqual(compatRenderContext.bindRendererContext, coreRendering.bindRendererContext);
  });

  it("keeps @litsx/jsx-authoring compatible with @litsx/authoring", async () => {
    process.env.LITSX_DISABLE_DEPRECATION_WARNINGS = "1";
    const authoring = await import("@litsx/authoring");
    const compat = await import("@litsx/jsx-authoring");
    const authoringParser = await import("@litsx/authoring/parser");
    const compatParser = await import("@litsx/jsx-authoring/parser");

    assert.strictEqual(compat.createVirtualLitsxJsxSource, authoring.createVirtualLitsxJsxSource);
    assert.strictEqual(compat.decodeVirtualAttributeName, authoring.decodeVirtualAttributeName);
    assert.strictEqual(compatParser.parseWithLitsxVirtualization, authoringParser.parseWithLitsxVirtualization);
  });

  it("keeps @litsx/typescript-plugin compatible with @litsx/typescript", async () => {
    process.env.LITSX_DISABLE_DEPRECATION_WARNINGS = "1";
    const typescript = await import("@litsx/typescript");
    const compat = await import("@litsx/typescript-plugin");
    const typescriptVirtualSource = await import("@litsx/typescript/virtualization");
    const compatVirtualSource = await import("@litsx/typescript-plugin/virtual-source");
    const typescriptTypecheck = await import("@litsx/typescript/typecheck");
    const compatTypecheck = await import("@litsx/typescript-plugin/typecheck");

    assert.strictEqual(typeof compat.default, "function");
    assert.strictEqual(typeof typescript.default, "function");
    assert.strictEqual(
      compatVirtualSource.createToolingVirtualLitsxSource,
      typescriptVirtualSource.createToolingVirtualLitsxSource,
    );
    assert.strictEqual(compatTypecheck.runLitsxTypecheck, typescriptTypecheck.runLitsxTypecheck);
  });

  it("keeps the legacy TypeScript plugin CJS entrypoint loadable", () => {
    process.env.LITSX_DISABLE_DEPRECATION_WARNINGS = "1";
    const init = require("@litsx/typescript-plugin");

    assert.strictEqual(typeof init, "function");
  });
});
