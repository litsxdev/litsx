import assert from "assert";
import * as t from "@babel/types";
import {
  createTransformFunctionToClassPlugin,
  isCapitalizedComponentName,
} from "../packages/babel-preset-litsx/src/internal/transform-litsx-components.js";

describe("native components internals", () => {
  it("classifies capitalized component names defensively", () => {
    assert.strictEqual(isCapitalizedComponentName("Card"), true);
    assert.strictEqual(isCapitalizedComponentName("button"), false);
    assert.strictEqual(isCapitalizedComponentName(""), false);
    assert.strictEqual(isCapitalizedComponentName(null), false);
  });

  it("handles pre/post lifecycle without a Babel file and normalizes warning metadata", () => {
    const factory = createTransformFunctionToClassPlugin();
    const plugin = factory({
      assertVersion() {},
      types: t,
    });

    assert.doesNotThrow(() => {
      plugin.pre.call({});
      plugin.post.call({});
    });

    const state = {
      file: { metadata: {} },
    };

    plugin.pre.call(state);
    delete state.__litsxWarnings;
    plugin.post.call(state);

    assert.deepStrictEqual(state.file.metadata.litsxWarnings, []);
  });
});
