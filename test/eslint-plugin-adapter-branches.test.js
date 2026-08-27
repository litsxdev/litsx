import assert from "node:assert/strict";
import { describe, it, vi } from "vitest";

vi.mock("@litsx/authoring", () => ({
  collectHookDiagnostics: () => [{ code: "HOOK", message: "fallback node" }],
  collectComponentNameDiagnostics: () => [{ code: "NAME", message: "fallback node" }],
}));

describe("ESLint adapter defensive branches", () => {
  it("reports diagnostics without an authored node against the program", async () => {
    const [{ default: hooks }, { default: names }] = await Promise.all([
      import("../packages/eslint-plugin-litsx/src/rules/rules-of-hooks.js"),
      import("../packages/eslint-plugin-litsx/src/rules/valid-component-name.js"),
    ]);
    const program = { type: "Program" };
    for (const rule of [hooks, names]) {
      const reports = [];
      rule.create({ report: (entry) => reports.push(entry) })["Program:exit"](program);
      assert.equal(reports[0].node, program);
    }
  });
});
