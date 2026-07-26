import assert from "node:assert";
import { describe, it } from "vitest";
import {
  collectLitsxAuthoredIssues,
  getLitsxAttributeCompletionNames,
  getLitsxMarkupCompletionNames,
  inferLitsxAttributeCompletionContext,
  inferLitsxComponentEventNames,
  inferLitsxComponentPropNames,
  inferLitsxMarkupCompletionContext,
} from "../packages/typescript/src/authored-semantics.js";

describe("@litsx/typescript authored semantic edge cases", () => {
  it("infers aliases, string-keyed metadata, and namespaced markup completions", () => {
    const source = `
      export const Notice = function Notice({ tone = "info", message }) {
        __litsx_static_properties({ "data-tone": { type: String } });
        const dispatch = useEmit();
        dispatch("notice-open");
        dispatch("notice-close");
        return <section>{message}</section>;
      };
    `;

    assert.deepStrictEqual(inferLitsxComponentEventNames(source), {
      Notice: ["notice-close", "notice-open"],
    });
    assert.deepStrictEqual(inferLitsxComponentPropNames(source), {
      Notice: ["data-tone"],
    });

    const attributeContext = inferLitsxAttributeCompletionContext(
      "<input ?dis",
      "<input ?dis".length,
    );
    assert.deepStrictEqual(getLitsxAttributeCompletionNames(attributeContext), ["?disabled"]);

    const markupContext = inferLitsxMarkupCompletionContext(
      "<svg aria",
      "<svg aria".length,
    );
    assert.ok(getLitsxMarkupCompletionNames(markupContext).includes("aria-label"));
  });

  it("reports parse fallbacks and typo suggestions through the public diagnostics API", () => {
    const parseIssues = collectLitsxAuthoredIssues("const broken = <div>");
    const typoIssues = collectLitsxAuthoredIssues("const view = <input ?disabld />;");

    assert.ok(parseIssues.some((issue) => issue.code === 91000));
    assert.ok(typoIssues.some((issue) => (
      issue.code === 91005 && issue.message.includes('Did you mean "?disabled"?')
    )));
  });
});
