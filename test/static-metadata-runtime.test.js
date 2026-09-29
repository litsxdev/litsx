// @vitest-environment happy-dom

import assert from "assert";
import { describe, it } from "vitest";
import { LitElement } from "lit";
import { css, replaceStyles } from "../packages/core/src/index.js";
import { mergePropertyDeclarations } from "../packages/core/src/elements/index.js";

describe("static component metadata runtime", () => {
  it("keeps replaceStyles as a direct Lit CSSResultGroup identity", () => {
    const styles = [css`:host { display: block; }`];
    assert.strictEqual(replaceStyles(styles), styles);
  });

  it("shallowly merges property declaration options", () => {
    assert.deepStrictEqual(
      mergePropertyDeclarations(
        { active: { type: Boolean }, title: { type: String } },
        { active: { reflect: true } },
      ),
      {
        active: { type: Boolean, reflect: true },
        title: { type: String },
      },
    );
  });

  it("uses Lit inheritance for properties and cooperative composition for styles and elements", () => {
    const baseStyles = css`:host { color: red; }`;
    const mixedStyles = css`:host { background: white; }`;
    const componentStyles = css`:host { display: block; }`;
    class BaseChild {}
    class MixedChild {}
    class ComponentChild {}

    class Base extends LitElement {
      static properties = {
        baseValue: { type: String },
        active: { type: Boolean, reflect: true },
      };
      static styles = baseStyles;
      static elements = { "base-child": BaseChild };
    }

    class Mixed extends Base {
      static properties = { mixedValue: { type: Number } };
      static styles = [super.styles ?? [], mixedStyles];
      static elements = {
        ...(super.elements ?? {}),
        "mixed-child": MixedChild,
      };
    }

    class Component extends Mixed {
      static properties = {
        active: { type: Boolean, attribute: false },
        componentValue: { type: Object },
      };
      static styles = [super.styles ?? [], componentStyles];
      static elements = {
        ...(super.elements ?? {}),
        "component-child": ComponentChild,
      };
    }

    Component.finalize();

    assert.deepStrictEqual(
      [...Component.elementProperties.keys()].filter((name) =>
        ["active", "baseValue", "mixedValue", "componentValue"].includes(name),
      ),
      ["baseValue", "active", "mixedValue", "componentValue"],
    );
    assert.deepStrictEqual(Component.elementProperties.get("active"), {
      type: Boolean,
      attribute: false,
    });
    assert.deepStrictEqual(
      Component.elementStyles.map((style) => style.cssText),
      [baseStyles.cssText, mixedStyles.cssText, componentStyles.cssText],
    );
    assert.deepStrictEqual(Component.elements, {
      "base-child": BaseChild,
      "mixed-child": MixedChild,
      "component-child": ComponentChild,
    });
  });
});
