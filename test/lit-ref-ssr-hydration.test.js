// @vitest-environment happy-dom

import assert from "node:assert";
import { execFileSync } from "node:child_process";
import { html } from "lit";
import { hydrate } from "@lit-labs/ssr-client";
import { ref } from "../packages/core/src/index.js";
import { createReactRef, toLitRef } from "../packages/core/src/react-compat.js";
import { describe, it } from "vitest";

const serverScript = [
  'import { html } from "lit";',
  'import { ref } from "./packages/core/src/index.js";',
  'import { renderToString } from "./packages/ssr/src/index.js";',
  'const result = await renderToString(html`<input ${ref(() => {})}>`);',
  'process.stdout.write(result.html);',
].join("\n");

describe("direct Lit ref SSR hydration", () => {
  it("hydrates the server node and publishes it through a React facade", () => {
    const markup = execFileSync(
      process.execPath,
      ["--input-type=module", "-e", serverScript],
      { cwd: process.cwd(), encoding: "utf8" },
    );
    const container = document.createElement("div");
    container.innerHTML = markup;
    const original = container.querySelector("input");
    const reactRef = createReactRef();

    hydrate(html`<input ${ref(toLitRef(reactRef))}>`, container);

    assert.strictEqual(container.querySelector("input"), original);
    assert.strictEqual(reactRef.current, original);
  });
});
