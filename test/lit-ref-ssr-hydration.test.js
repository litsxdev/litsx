// @vitest-environment happy-dom

import assert from "node:assert";
import { execFileSync } from "node:child_process";
import { html } from "lit";
import { ref } from "../packages/core/src/index.js";
import { createReactRef, toLitRef } from "../packages/core/src/react-compat.js";
import { hydrate } from "../packages/ssr/src/client.js";
import { describe, it } from "vitest";

const serverScript = [
  'import { html } from "lit";',
  'import { ref } from "./packages/core/src/index.js";',
  'import { render } from "./packages/ssr/src/index.js";',
  'let output = "";',
  'for (const chunk of render(html`<input ${ref(() => {})}>`)) output += chunk;',
  'process.stdout.write(output);',
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
