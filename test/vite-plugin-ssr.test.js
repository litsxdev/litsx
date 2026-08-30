import assert from "node:assert/strict";
import fs from "node:fs";
import { describe, it } from "vitest";
import ssrPackageJson from "../packages/ssr/package.json" with { type: "json" };
import vitePackageJson from "../packages/vite-plugin/package.json" with { type: "json" };
import * as ssr from "../packages/ssr/src/index.js";
import { createSsrDevServer } from "../packages/vite-plugin/src/ssr.js";

describe("@litsx/vite-plugin/ssr", () => {
  it("owns the Vite SSR adapter without coupling @litsx/ssr to Vite", () => {
    assert.strictEqual(typeof createSsrDevServer, "function");
    assert.strictEqual("createSsrDevServer" in ssr, false);
    assert.strictEqual(ssrPackageJson.dependencies["@litsx/vite-plugin"], undefined);
    assert.strictEqual(ssrPackageJson.peerDependencies?.vite, undefined);
    assert.strictEqual(vitePackageJson.exports["./ssr"].import, "./src/ssr.js");
    assert.strictEqual(vitePackageJson.exports["./ssr"].types, "./src/ssr.d.ts");
    assert.ok(vitePackageJson.peerDependencies["@litsx/ssr"]);
    assert.strictEqual(
      vitePackageJson.peerDependenciesMeta["@litsx/ssr"].optional,
      true,
    );
    const ssrDeclarations = fs.readFileSync(
      new URL("../packages/ssr/src/index.d.ts", import.meta.url),
      "utf8",
    );
    assert.doesNotMatch(ssrDeclarations, /import\("vite"\)|from "vite"/);
    assert.match(ssrDeclarations, /loadModule\?: LitsxSsrAuthoredModuleLoader/);
  });

  it("surfaces SSR console output and render errors in the dev-server response", async () => {
    let shouldFail = false;
    const server = await createSsrDevServer({
      root: process.cwd(),
      host: "127.0.0.1",
      port: 0,
      logLevel: "silent",
      render({ html }) {
        if (shouldFail) {
          console.warn("SSR diagnostic before failure");
          throw new Error("SSR render exploded");
        }

        console.log("SSR diagnostic value", { id: 42 });
        return html`<main>ready</main>`;
      },
    });
    await server.listen();

    try {
      const url = server.resolvedUrls.local[0];
      const success = await fetch(url);
      const successDocument = await success.text();
      assert.strictEqual(success.status, 200);
      assert.match(successDocument, /\[LitSX SSR\]/);
      assert.match(successDocument, /SSR diagnostic value/);

      shouldFail = true;
      const failure = await fetch(url);
      const failureDocument = await failure.text();
      assert.strictEqual(failure.status, 500);
      assert.match(failureDocument, /LitSX SSR error/);
      assert.match(failureDocument, /SSR render exploded/);
      assert.match(failureDocument, /SSR diagnostic before failure/);
    } finally {
      await server.close();
    }
  }, 30000);

  it("passes through unrelated requests and normalizes opaque render failures", async () => {
    let shouldThrowOpaque = false;
    const server = await createSsrDevServer({
      vite: {
        logLevel: "silent",
        server: { host: "127.0.0.1", port: 0, strictPort: false },
      },
      render({ html }) {
        if (shouldThrowOpaque) throw "opaque SSR failure";
        return html`<main>default options</main>`;
      },
    });
    await server.listen();
    try {
      const url = server.resolvedUrls.local[0];
      const head = await fetch(url, { method: "HEAD" });
      assert.equal(head.status, 200);

      const unrelated = await fetch(new URL("/missing", url));
      assert.equal(unrelated.status, 404);
      const post = await fetch(url, { method: "POST" });
      assert.notEqual(post.status, 200);

      shouldThrowOpaque = true;
      const failure = await fetch(url);
      assert.equal(failure.status, 500);
      assert.match(await failure.text(), /opaque SSR failure/);
    } finally {
      await server.close();
    }
  }, 30000);
});
