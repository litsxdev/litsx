import assert from "node:assert/strict";
import path from "node:path";
import { describe, it } from "vitest";
import { createTailwindBuildEngine } from "../packages/tailwind/src/build-engine.js";
import { createTailwindContext } from "../packages/tailwind/src/context.js";
import {
  componentCss,
  componentPreflightCss,
  extractTailwindProperties,
  importDirective,
  infrastructureCss,
  referenceDirective,
  removeTailwindProperties,
  synchronizeTailwindTheme,
} from "../packages/tailwind/src/css.js";

describe("neutral Tailwind helper branches", () => {
  it("constructs directives and routes theme and property layers", () => {
    const context = {
      entry: 'C:\\theme "quoted".css',
      sources: ['C:\\source "one"'],
    };
    assert.match(referenceDirective(context.entry), /C:\\\\theme \\"quoted\\"/);
    assert.equal(
      importDirective("tailwindcss"),
      '@import "tailwindcss" source(none);',
    );
    assert.match(importDirective(context.entry), /^@import/);
    assert.match(
      componentCss(context, {}),
      /@tailwind utilities source\(none\)/,
    );
    assert.match(infrastructureCss(context), /litsx-tailwind-infrastructure/);

    const properties = [
      '@property --tw-x { syntax: "*"; inherits: false; }',
      "@layer properties { :root { --tw-x: initial; } }",
      "@layer utilities { .keep { display: block; } }",
    ].join("\n");
    const cleaned = removeTailwindProperties(properties);
    assert.doesNotMatch(cleaned, /@property|@layer properties/);
    assert.match(cleaned, /\.keep/);
    assert.equal(removeTailwindProperties(".plain{}"), ".plain{}");

    const extracted = extractTailwindProperties(properties);
    assert.match(extracted, /@property --tw-x/);
    assert.match(extracted, /@layer properties/);
    assert.doesNotMatch(extracted, /\.keep/);

    const preflight = componentPreflightCss(
      "@layer theme{:root{--brand:red}}@layer base{*{box-sizing:border-box}}",
    );
    assert.doesNotMatch(preflight, /--brand/);
    assert.match(preflight, /box-sizing/);

    assert.equal(
      synchronizeTailwindTheme("@layer base{a{color:red}}", ".plain{}"),
      "@layer base{a{color:red}}",
    );
    const inserted = synchronizeTailwindTheme(
      "@layer base{a{color:red}}",
      "@layer theme{:root{--brand:blue}}",
    );
    assert.match(inserted, /^@layer theme/);
    const replaced = synchronizeTailwindTheme(
      "@layer theme{:root{--brand:red}}",
      "@layer theme{:root{--brand:green}}",
    );
    assert.match(replaced, /green/);
    assert.doesNotMatch(replaced, /red/);
  });

  it("handles an empty graph, relative guard dependencies, and disposal", async () => {
    const context = createTailwindContext();
    context.configure({ root: process.cwd() });
    const engine = createTailwindBuildEngine(context);
    const empty = await engine.generateGlobal();
    assert.match(empty.css, /@layer base/);

    const component = await engine.generateComponent({
      candidates: ["p-1"],
      dependencies: ["./guard.js"],
    });
    assert.match(component.css, /\.p-1/);
    assert.ok(component.dependencies.includes(path.resolve("guard.js")));
    engine.invalidate();
    engine.dispose();
    await assert.rejects(engine.generatePreflight(), /disposed/);
  });

  it("covers context retention, notifications, unknown keys, and cleanup", () => {
    const context = createTailwindContext();
    const changed = [];
    const unsubscribe = context.onChange((key) => changed.push(key));
    const first = context.register("card.tsx", "Card", {
      candidates: ["p-1"],
    });
    context.register("card.tsx", "Card", { candidates: ["p-1"] });
    assert.deepEqual(changed, []);
    context.register("card.tsx", "Card", { candidates: ["p-2"] });
    assert.deepEqual(changed, [first]);
    assert.deepEqual(context.keys("missing.tsx"), []);
    context.retain("missing.tsx", []);
    context.retain("card.tsx", []);
    assert.equal(context.get(first), null);
    context.forget("missing.tsx");
    unsubscribe();
    context.clear();
  });
});
