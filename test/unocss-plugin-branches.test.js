import assert from "node:assert";
import { transformSync } from "@babel/core";
import { describe, it } from "vitest";
import {
  createUnoCssAuthoringPlugin,
  createUnoCssOutputPlugin,
  decodeUnoCssGuardPayload,
  UNO_CSS_GUARD_PATTERN,
} from "../packages/unocss/src/index.js";

function transform(source, plugin, filename = "/virtual/unocss-branches.tsx") {
  return transformSync(source, {
    filename,
    configFile: false,
    babelrc: false,
    sourceType: "module",
    parserOpts: { plugins: ["jsx", "typescript", "classProperties"] },
    plugins: [plugin],
  });
}

function payloads(code) {
  return [...code.matchAll(new RegExp(UNO_CSS_GUARD_PATTERN.source, "g"))]
    .map((match) => decodeUnoCssGuardPayload(match[1]));
}

describe("UnoCSS Babel plugin branch behavior", () => {
  it("composes output styles across getters, arrays, aliases, scopes, and dynamic markup", () => {
    const result = transform(`
      import { css as litCss } from "@litsx/core";
      import { html as view } from "lit";
      const oldA = litCss\`:host{}\`;
      const oldB = litCss\`p{}\`;
      class Base {}
      class GetterCard extends Base {
        static [Symbol.for("litsx.component")] = true;
        static get styles() { return [oldA, oldB]; }
        render() {
          const side = this.active ? "left" : "right";
          return view\`<article class='fixed \${side} \${this.size && "wide"} prefix-\${this.kind}'>x</article>\`;
        }
      }
      class PropertyCard extends Base {
        static [Symbol.for("litsx.component")] = true;
        static styles = oldA;
        render() { return html\`<p class=plain>p</p>\`; }
      }
      class EmptyGetter extends Base {
        static [Symbol.for("litsx.component")] = true;
        static get styles() {}
        render() { return html\`<i class="solo"></i>\`; }
      }
      class ScopedCard extends Wrapper(LightDomMixin(Base)) {
        static [Symbol.for("litsx.component")] = true;
        static [Symbol.for("litsx.lightDomStyleScope")] = "scope-a";
        render() { return html\`<b class="scoped"></b>\`; }
      }
    `, createUnoCssOutputPlugin({
      globalCssModule: "virtual:global.css",
      preflightModule: "virtual:preflight.css",
    }));

    assert.match(result.code, /virtual:global\.css/);
    assert.match(result.code, /virtual:preflight\.css/);
    assert.match(result.code, /static get styles/);
    const guards = payloads(result.code);
    assert(guards.some((guard) => guard.candidates.includes("fixed")));
    assert(guards.some((guard) => guard.dynamicPatterns.length > 0));
    assert(guards.some((guard) => guard.scope?.includes("scope-a")));
  });

  it("handles light DOM output without component styles and anonymous ownership", () => {
    const result = transform(`
      const html = String.raw;
      export default class extends LightDomMixin(Object) {
        static [Symbol.for("litsx.component")] = true;
        render() { return html\`<main class="global-only"></main>\`; }
      }
    `, createUnoCssOutputPlugin({ lightDomStyles: { strategy: "global" } }));
    const guards = payloads(result.code);
    assert(guards.some((guard) => guard.emit === "global"));
    assert(guards.some((guard) => guard.owner == null));
  });

  it("consumes direct, computed, namespace, array, and spread style assignments", () => {
    const result = transform(`
      import { css, replaceStyles } from "@litsx/core";
      import * as core from "@litsx/core";
      const local = ["p-1", "bg-red-500"];
      function LightCard() {}
      const OtherCard = () => null;
      LightCard.lightDom = true;
      LightCard["styles"] = replaceStyles([local, ...["m-2"], css\`:host{}\`]);
      OtherCard.styles = core.replaceStyles("text-sm");
    `, createUnoCssAuthoringPlugin({
      defaultDomMode: "light",
      lightDomStyles: { strategy: "global" },
    }));

    const guards = payloads(result.code);
    assert(guards.some((guard) => guard.owner === "LightCard" && guard.emit === "global"));
    assert(guards.some((guard) => guard.owner === "OtherCard"));
    assert(guards.some((guard) => guard.candidates.includes("m-2")));
    assert.match(result.code, /import \{ css/);
  });

  it("leaves runtime guards intact and diagnoses unsupported static values", () => {
    const runtime = transform(`
      import { css } from "@litsx/core";
      function Card() {}
      Card.styles = css\`:host{}\`;
    `, createUnoCssAuthoringPlugin());
    assert.match(runtime.code, /Card\.styles/);

    assert.throws(() => transform(`
      function Card() {}
      Card.styles = 123;
    `, createUnoCssAuthoringPlugin()), /could not statically resolve/);
  });
});
