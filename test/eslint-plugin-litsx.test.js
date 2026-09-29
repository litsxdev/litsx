import assert from "node:assert";
import { describe, it } from "vitest";
import plugin from "../packages/eslint-plugin-litsx/src/index.js";
import packageJson from "../packages/eslint-plugin-litsx/package.json" with { type: "json" };

async function createFlatESLint(options) {
  const { ESLint } = await import("eslint");
  return new ESLint(options);
}

describe("@litsx/eslint-plugin", () => {
  it("exports standard JSX rules without a syntax processor", () => {
    assert.deepStrictEqual(plugin.processors, undefined);
    assert.ok(plugin.rules["no-native-classname"]);
    assert.strictEqual(plugin.rules["no-react-memo"], undefined);
    assert.ok(plugin.rules["rules-of-hooks"]);
    assert.ok(plugin.rules["valid-component-name"]);
    assert.ok(plugin.configs.recommended);
    assert.ok(plugin.configs["recommended-flat"]);
    assert.strictEqual(plugin.meta.version, packageJson.version);
  });

  it("reports shared component-name and hook diagnostics with stable codes", async () => {
    const eslint = await createFlatESLint({
      cwd: process.cwd(),
      overrideConfigFile: true,
      overrideConfig: [plugin.configs["recommended-flat"]],
    });
    const [result] = await eslint.lintText(
      [
        'import { useState } from "@litsx/core";',
        "export function Switch({ active }) {",
        "  if (active) useState(0);",
        "  return <button />;",
        "}",
      ].join("\n"),
      { filePath: "invalid.tsx" },
    );

    assert.ok(result.messages.some((message) => (
      message.ruleId === "@litsx/valid-component-name" &&
      message.message.includes("[LITSX_INVALID_COMPONENT_NAME]")
    )));
    assert.ok(result.messages.some((message) => (
      message.ruleId === "@litsx/rules-of-hooks" &&
      message.message.includes("[LITSX_HOOK_CONDITIONAL]")
    )));
  });

  it("does not duplicate diagnostics inside either ESLint adapter rule", async () => {
    const eslint = await createFlatESLint({
      cwd: process.cwd(),
      overrideConfigFile: true,
      overrideConfig: [plugin.configs["recommended-flat"]],
    });
    const [result] = await eslint.lintText(
      'import { useState } from "@litsx/core"; function Switch(){ useState(0); return <div />; }',
      { filePath: "single.tsx" },
    );

    assert.strictEqual(
      result.messages.filter((message) => message.ruleId === "@litsx/valid-component-name").length,
      1,
    );
    assert.strictEqual(
      result.messages.filter((message) => message.ruleId === "@litsx/rules-of-hooks").length,
      0,
    );
  });

  it("lints and fixes standard TSX directly", async () => {
    const eslint = await createFlatESLint({
      cwd: process.cwd(),
      fix: true,
      overrideConfigFile: true,
      overrideConfig: [plugin.configs["recommended-flat"]],
    });
    const [result] = await eslint.lintText(
      'import { memo } from "react";\nconst Button = memo(() => <button className="cta" on:click={() => {}} />);',
      { filePath: "example.tsx" },
    );

    assert.match(result.output, /class="cta"/);
    assert.deepStrictEqual(result.messages, []);
  });
});
