import assert from "node:assert";
import { describe, it } from "vitest";
import plugin from "../packages/eslint-plugin-litsx/src/index.js";

async function createFlatESLint(options) {
  const { ESLint } = await import("eslint");
  return new ESLint(options);
}

describe("@litsx/eslint-plugin", () => {
  it("exports standard JSX rules without a syntax processor", () => {
    assert.deepStrictEqual(plugin.processors, undefined);
    assert.ok(plugin.rules["no-native-classname"]);
    assert.ok(plugin.rules["no-react-memo"]);
    assert.ok(plugin.configs.recommended);
    assert.ok(plugin.configs["recommended-flat"]);
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
    assert.ok(result.messages.some((message) => message.ruleId === "@litsx/no-react-memo"));
  });
});
