import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "vitest";
import { LitElement, css, html } from "lit";
import { renderLight } from "@lit-labs/ssr-client/directives/render-light.js";
import { transformLitsxSync } from "../packages/compiler/src/index.js";
import {
  __litsxScopedTemplate,
  LightDomMixin,
} from "../packages/core/src/elements/index.js";
import { renderToString } from "../packages/ssr/src/index.js";
import { renderScopedTemplateWithLitSsr } from "../packages/ssr/src/scoped-rendering.js";

const fixtureRoot = path.resolve(
  import.meta.dirname,
  "fixtures/lit-interoperability",
);

describe("pure Lit component interoperability", () => {
  it("lowers imported Lit classes to scoped JSX bindings without rewriting their modules", () => {
    const filename = path.join(fixtureRoot, "src/hybrid-host.tsx");
    const source = fs.readFileSync(filename, "utf8");
    const result = transformLitsxSync(source, {
      filename,
      projectPath: path.join(fixtureRoot, "tsconfig.json"),
    });

    assert.match(
      result.code,
      /class HybridHost extends ShadowDomMixin\(LitElement\)/,
    );
    assert.match(
      result.code,
      /class HybridLightHost extends LightDomMixin\(LitElement\)/,
    );
    assert.match(result.code, /"plain-lit-counter": PlainLitCounter/);
    assert.match(result.code, /"mixed-lit-badge": MixedLitBadge/);
    assert.match(result.code, /"light-lit-counter": LightLitCounter/);
    assert.match(result.code, /\.active=\$\{true\}/);
    assert.match(result.code, /\.payload=\$\{\{/);
    assert.match(result.code, /@count-change=\$\{/);
    assert.match(
      result.code,
      /jsxSpreadElement\("mixed-lit-badge", \[badgeProps\], \{[\s\S]*component: MixedLitBadge/,
    );
    assert.deepStrictEqual(result.warnings ?? [], []);

    const pureLitSource = fs.readFileSync(
      path.join(fixtureRoot, "src/plain-lit-elements.ts"),
      "utf8",
    );
    assert.match(pureLitSource, /class PlainLitCounter extends LitElement/);
    assert.match(
      pureLitSource,
      /class MixedLitBadge extends CapabilityMixin\(LitElement\)/,
    );
    assert.doesNotMatch(pureLitSource, /@litsx\/core/);
  });

  it("composes transitive structural mixins and authored Lit metadata", () => {
    const filename = path.join(fixtureRoot, "src/matrix-components.tsx");
    const source = fs.readFileSync(filename, "utf8");
    const result = transformLitsxSync(source, {
      filename,
      projectPath: path.join(fixtureRoot, "tsconfig.json"),
    });

    assert.match(
      result.code,
      /class MatrixComplexLeaf extends ShadowDomMixin\(applyStructuralHooks\(LitElement,/,
    );
    assert.strictEqual(
      result.code.match(/useAlpha\[Symbol\.for\("litsx\.structuralHooks"\)\]/g)
        ?.length,
      2,
    );
    assert.match(
      result.code,
      /\.\.\.\(useBeta\[Symbol\.for\("litsx\.structuralHooks"\)\] \|\| \[useBeta\]\)/,
    );
    assert.match(
      result.code,
      /\.\.\.\(useFormValue\[Symbol\.for\("litsx\.structuralHooks"\)\] \|\| \[useFormValue\]\)/,
    );
    assert.match(result.code, /\.\.\.\(super\.elements \?\? \{\}\)/);
    assert.match(result.code, /"plain-lit-terminal": PlainLitTerminal/);
    assert.match(result.code, /"own-marker": OwnMarker/);
    assert.match(
      result.code,
      /static styles = \[super\.styles \?\? \[\], css`/,
    );
    assert.match(result.code, /"plain-lit-context-bridge": PlainLitContextBridge/);
    assert.match(
      result.code,
      /"litsx-context-provider": LitsxContextProviderElement/,
    );
    assert.deepStrictEqual(result.warnings ?? [], []);
  });

  it("emits client-visible renderLight markers for nested light-DOM component boundaries", () => {
    const filename = path.join(fixtureRoot, "src/matrix-components.tsx");
    const source = fs.readFileSync(filename, "utf8");
    const result = transformLitsxSync(source, {
      filename,
      projectPath: path.join(fixtureRoot, "tsconfig.json"),
    });

    assert.match(result.code, /__litsxRenderLight/);
  });

  it("SSR renders nested pure Lit classes with inherited properties and styles", async () => {
    class PlainLitLabel extends LitElement {
      static properties = {
        label: { type: String },
      };

      static styles = css`
        strong {
          color: rgb(0, 0, 255);
        }
      `;

      constructor() {
        super();
        this.label = "plain";
      }

      render() {
        return html`<strong data-plain>${this.label}</strong>`;
      }
    }

    const CapabilityMixin = (Base) =>
      class CapabilityHost extends Base {
        static properties = {
          ...super.properties,
          tone: { type: String, reflect: true },
          enabled: { type: Boolean, reflect: true },
        };

        static styles = [
          super.styles ?? [],
          css`
            em {
              color: rgb(0, 128, 0);
            }
          `,
        ];

        constructor() {
          super();
          this.tone = "neutral";
          this.enabled = false;
        }
      };

    class MixedLitLabel extends CapabilityMixin(LitElement) {
      static properties = {
        ...super.properties,
        model: { attribute: false },
      };

      render() {
        return html`<em data-mixed>${this.tone}:${this.model?.id}</em>`;
      }
    }

    class PureLitComposition extends LitElement {
      static elements = {
        "plain-lit-label": PlainLitLabel,
        "mixed-lit-label": MixedLitLabel,
      };

      render() {
        return html`
          <plain-lit-label label="direct"></plain-lit-label>
          <mixed-lit-label
            tone="positive"
            ?enabled=${true}
            .model=${{ id: "inherited" }}
          ></mixed-lit-label>
        `;
      }
    }

    const output = await renderScopedTemplateWithLitSsr(
      __litsxScopedTemplate(
        html`<pure-lit-composition></pure-lit-composition>`,
        { "pure-lit-composition": PureLitComposition },
      ),
    );

    assert.strictEqual(customElements.get("pure-lit-composition"), undefined);
    assert.strictEqual(customElements.get("plain-lit-label"), undefined);
    assert.strictEqual(customElements.get("mixed-lit-label"), undefined);
    assert.match(output, /<pure-lit-composition\b/);
    assert.match(output, /<plain-lit-label[\s\S]*<strong data-plain>/);
    assert.match(output, /direct/);
    assert.match(
      output,
      /<mixed-lit-label\b[^>]*tone="positive"[^>]*enabled[^>]*defer-hydration/,
    );
    assert.match(output, /<em data-mixed>[\s\S]*positive/);
    assert.match(output, /positive[\s\S]*inherited[\s\S]*<\/em>/);
    assert.match(output, /color: rgb\(0, 0, 255\)/);
    assert.match(output, /color: rgb\(0, 128, 0\)/);
  });

  it("SSR automatically renders empty registered light-DOM roots", async () => {
    class RuntimeLightRoot extends LightDomMixin(LitElement) {
      render() {
        return html`<span data-light-content>${this.getAttribute("data-value")}</span>`;
      }
    }

    const result = await renderToString(
      html`<runtime-light-root
        data-value=${"dynamic"}
      ></runtime-light-root>`,
      { elements: { "runtime-light-root": RuntimeLightRoot } },
    );

    assert.match(result.html, /<runtime-light-root\b[^>]*data-value="dynamic"/);
    assert.match(result.html, /<span data-light-content>/);
    assert.match(result.html, /dynamic/);
  });

  it("does not duplicate explicit light rendering or replace authored children", async () => {
    class RuntimeLightRoot extends LightDomMixin(LitElement) {
      render() {
        return html`<span data-light-content>rendered</span>`;
      }
    }
    const elements = { "runtime-light-root": RuntimeLightRoot };

    const explicit = await renderToString(
      html`<runtime-light-root>${renderLight()}</runtime-light-root>`,
      { elements },
    );
    assert.strictEqual(
      explicit.html.match(/data-light-content/g)?.length,
      1,
    );

    const authored = await renderToString(
      html`<runtime-light-root><span data-authored>child</span></runtime-light-root>`,
      { elements },
    );
    assert.match(authored.html, /data-authored/);
    assert.doesNotMatch(authored.html, /data-light-content/);
  });
});
