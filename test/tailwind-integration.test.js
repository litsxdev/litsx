import assert from "node:assert";
import { describe, it } from "vitest";
import { transformLitsxSync } from "../packages/compiler/src/index.js";
import { withTailwindCompiler } from "../packages/tailwind/src/compiler.js";
import { createTailwindContext } from "../packages/tailwind/src/context.js";

function compile(source, integration = {}) {
  const context = createTailwindContext(integration);
  const result = transformLitsxSync(
    source,
    withTailwindCompiler(
      { filename: "/virtual/tailwind.tsx" },
      context,
      integration,
    ),
  );
  const keys = [...result.code.matchAll(/tailwind\/component\/([a-z0-9]+)\.css/gu)]
    .map((match) => match[1]);
  return {
    code: result.code,
    payloads: [...new Set(keys)].map((key) => context.get(key)),
  };
}

describe("@litsx/tailwind compiler integration", () => {
  it("isolates finite local maps per component", () => {
    const { code, payloads } = compile(`
const SIZES = { sm: "h-8 px-3", lg: "h-12 px-6" };
const COUNTER = "inline-flex min-w-[var(--counter-width)]";

export function UiButton({ size = "sm" }) {
  return <button class={SIZES[size]}>Save</button>;
}

export function UiCounter() {
  return <span class={COUNTER}>2</span>;
}
`);
    assert.strictEqual(payloads.length, 2);
    const button = payloads.find((payload) => payload.candidates.includes("h-8"));
    const counter = payloads.find((payload) => payload.candidates.includes("inline-flex"));
    assert.deepStrictEqual(button.candidates, ["h-12", "h-8", "px-3", "px-6"]);
    assert(counter.candidates.includes("min-w-[var(--counter-width)]"));
    assert(!button.candidates.includes("inline-flex"));
    assert(!counter.candidates.includes("h-8"));
    assert.match(code, /unsafeCSS/);
    assert.match(code, /tailwind\/preflight\.css\?inline/);
  });

  it("uses only matching safelist entries for a dynamic component", () => {
    const { payloads } = compile(
      `
export function DynamicBox({ color }) {
  return <div class={\`bg-\${color}-600\`} />;
}
export function StaticBox() {
  return <div class="p-4" />;
}
`,
      { safelist: ["bg-red-600", "bg-green-600", "text-white", "p-8"] },
    );
    const dynamic = payloads.find((payload) => payload.candidates.includes("bg-red-600"));
    const statik = payloads.find((payload) => payload.candidates.includes("p-4"));
    assert.deepStrictEqual(dynamic.candidates, ["bg-green-600", "bg-red-600"]);
    assert.deepStrictEqual(statik.candidates, ["p-4"]);
  });

  it("consumes Component.styles guards without emitting class strings as CSS", () => {
    const { code, payloads } = compile(`
const GUARDED = { red: "bg-red-600", green: "bg-green-600" };
export function DynamicBox({ color }) {
  return <div class={\`bg-\${color}-600\`} />;
}
DynamicBox.styles = [GUARDED];
`);
    assert(payloads[0].candidates.includes("bg-red-600"));
    assert(payloads[0].candidates.includes("bg-green-600"));
    assert.doesNotMatch(code, /__LITSX_TAILWIND_GUARD_/);
    assert.match(code, /static styles = \[.*_litsxTailwindGuard``/s);
  });

  it("routes scoped and global light DOM without shadow CSSResults", () => {
    const scoped = compile(`
export function LightCard() { return <div class="p-4" />; }
LightCard.lightDom = true;
`);
    assert.match(scoped.code, /import "virtual:@litsx\/tailwind\/component\//);
    assert.doesNotMatch(scoped.code, /unsafeCSS/);
    assert.strictEqual(scoped.payloads[0].mode, "scoped");
    assert.match(scoped.payloads[0].scope, /data-litsx-style-scope/);

    const global = compile(
      `export function CompatCard() { return <div class="p-4" />; }`,
      {},
    );
    assert.strictEqual(global.payloads[0].mode, "shadow");
  });
});
