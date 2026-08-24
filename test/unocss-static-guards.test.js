import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, it } from "vitest";
import {
  createStaticGuardResolver,
  resolveStaticClassExpression,
  resolveStaticGuardExport,
  runtimeStyleExpression,
} from "../packages/unocss/src/static-guards.js";

const tempDirs = [];

afterEach(() => {
  while (tempDirs.length) fs.rmSync(tempDirs.pop(), { recursive: true, force: true });
});

function fixture(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "litsx-static-guards-"));
  tempDirs.push(dir);
  for (const [relative, source] of Object.entries(files)) {
    const filename = path.join(dir, relative);
    fs.mkdirSync(path.dirname(filename), { recursive: true });
    fs.writeFileSync(filename, source);
  }
  return dir;
}

describe("UnoCSS static guard resolver", () => {
  it("evaluates finite strings through templates, operators, arrays, objects, and member access", () => {
    const filename = "/virtual/guards.ts";
    const source = `
      const tone = condition ? "red" : "blue";
      const primary = "normal";
      const weight = primary || "bold";
      const joined = "text-" + tone;
      const list = ["base", , ...[joined, weight]];
      const base = { plain: "p-2", 2: "m-2" };
      const styles = { ...base, active: \`bg-\${tone}\`, ["fixed"]: "block" };
      const selected = styles.active;
      const numeric = styles[2];
      const dynamic = styles[key];
      const wrapped = (selected as string)!;
    `;
    const resolver = createStaticGuardResolver({ source, filename });

    assert.deepEqual(resolver.resolveLocal("tone").candidates.sort(), ["blue", "red"]);
    assert.deepEqual(resolver.resolveLocal("joined").candidates.sort(), ["text-blue", "text-red"]);
    assert.deepEqual(resolver.resolveLocal("list").candidates.sort(), ["base", "bold", "normal", "text-blue", "text-red"]);
    assert.deepEqual(resolver.resolveLocal("selected").candidates.sort(), ["bg-blue", "bg-red"]);
    assert.deepEqual(resolver.resolveLocal("numeric").candidates, ["m-2"]);
    assert.deepEqual(resolver.resolveLocal("dynamic").candidates.sort(), ["bg-blue", "bg-red", "block", "m-2", "p-2"]);
    assert.deepEqual(resolver.resolveLocal("wrapped").candidates.sort(), ["bg-blue", "bg-red"]);
    assert.deepEqual(resolver.resolveLocal("styles").candidates.sort(), ["bg-blue", "bg-red", "block", "m-2", "p-2"]);
  });

  it("resolves named, default, re-exported, export-all, directory, and absolute imports", () => {
    const dir = fixture({
      "tokens.ts": `
        const local = "local-token";
        export const named = "named-token";
        export { local as renamed };
        export default local;
      `,
      "barrel/index.ts": `export { named as fromBarrel } from "../tokens";`,
      "all.ts": `export * from "./missing"; export * from "./tokens";`,
      "main.ts": `
        import defaultToken, { named, renamed } from "./tokens";
        import { fromBarrel } from "./barrel";
        import external from "definitely-not-a-real-litsx-package";
        export const combined = \`\${defaultToken} \${named} \${renamed} \${fromBarrel}\`;
      `,
    });
    const main = path.join(dir, "main.ts");
    const tokens = path.join(dir, "tokens.ts");
    const all = path.join(dir, "all.ts");
    const resolver = createStaticGuardResolver({ source: fs.readFileSync(main, "utf8"), filename: main });

    assert.deepEqual(resolver.resolveLocal("combined").candidates, ["local-token", "named-token"]);
    assert.equal(resolver.resolveLocal("external").kind, "external");
    assert.equal(resolver.resolveLocal("named").descriptor.exportName, "named");
    assert.ok(resolver.resolveLocal("named").dependencies.includes(tokens));
    assert.deepEqual(resolver.resolveExport(tokens, "default").candidates, ["local-token"]);
    assert.deepEqual(resolver.resolveExport(tokens, "renamed").candidates, ["local-token"]);
    assert.deepEqual(resolver.resolveExport(all, "named").candidates, ["named-token"]);
    assert.deepEqual(resolveStaticGuardExport({ file: tokens, localName: "local" }).candidates, ["local-token"]);
    assert.deepEqual(resolveStaticGuardExport({ file: tokens, exportName: "named" }).candidates, ["named-token"]);

    const absoluteSource = `import { named } from ${JSON.stringify(tokens)};`;
    const absoluteResolver = createStaticGuardResolver({ source: absoluteSource, filename: path.join(dir, "absolute.ts") });
    assert.deepEqual(absoluteResolver.resolveLocal("named").candidates, ["named-token"]);
  });

  it("classifies runtime style expressions through direct and wrapped AST nodes", () => {
    assert.equal(runtimeStyleExpression(null), false);
    assert.equal(runtimeStyleExpression({ type: "TaggedTemplateExpression" }), true);
    assert.equal(runtimeStyleExpression({ type: "NewExpression", callee: { type: "Identifier", name: "CSSStyleSheet" } }), true);
    assert.equal(runtimeStyleExpression({ type: "NewExpression", callee: { type: "Identifier", name: "Other" } }), false);
    assert.equal(runtimeStyleExpression({ type: "CallExpression", callee: { type: "Identifier", name: "css" } }), true);
    assert.equal(runtimeStyleExpression({ type: "CallExpression", callee: { type: "Identifier", name: "unsafeCSS" } }), true);
    assert.equal(runtimeStyleExpression({ type: "CallExpression", callee: { type: "Identifier", name: "other" } }), false);
    assert.equal(runtimeStyleExpression({ type: "TSAsExpression", expression: { type: "TaggedTemplateExpression" } }), true);

    const filename = "/virtual/runtime.ts";
    const resolver = createStaticGuardResolver({
      filename,
      source: "const sheet = new CSSStyleSheet(); const styles = css`x`;",
    });
    assert.equal(resolver.resolveLocal("sheet").kind, "runtime");
    assert.equal(resolver.resolveLocal("styles").kind, "runtime");
    assert.equal(resolver.resolveNode({ type: "TaggedTemplateExpression" }).kind, "runtime");
  });

  it("rejects cycles, non-finite expressions, invalid containers, and expansion overflow", () => {
    const filename = "/virtual/errors.ts";
    const source = `
      const a = b;
      const b = a;
      const object = { value: "x" };
      const badTemplate = \`x-\${object}\`;
      const badBinary = "x" + object;
      const badSpread = { ...["x"] };
      const badMethod = { method() {} };
      const computed = { [key]: "x" };
      const badMember = "x".value;
      const runtime = css\`x\`;
      const referencesRuntime = \`x-\${runtime}\`;
    `;
    const resolver = createStaticGuardResolver({ source, filename });

    assert.throws(() => resolver.resolveLocal("a"), /cyclic static dependency/);
    assert.throws(() => resolver.resolveLocal("missing"), /cannot resolve local binding/);
    assert.throws(() => resolver.resolveNode(null), /missing initializer/);
    assert.throws(() => resolver.resolveNode({ type: "NumericLiteral", value: 1 }), /unsupported NumericLiteral/);
    assert.throws(() => resolver.resolveLocal("badTemplate"), /finite set of strings/);
    assert.throws(() => resolver.resolveLocal("badBinary"), /non-string value/);
    assert.throws(() => resolver.resolveLocal("badSpread"), /object spread is not statically resolvable/);
    assert.throws(() => resolver.resolveLocal("badMethod"), /methods are not supported/);
    assert.throws(() => resolver.resolveLocal("computed"), /computed object key/);
    assert.throws(() => resolver.resolveLocal("badMember"), /member access target/);
    assert.throws(() => resolver.resolveLocal("referencesRuntime"), /runtime style/);

    const choices = Array.from({ length: 13 }, (_, index) => `\${flag${index} ? "a" : "b"}`).join("");
    const overflow = createStaticGuardResolver({
      filename: "/virtual/overflow.ts",
      source: `const huge = \`${choices}\`;`,
    });
    assert.throws(() => overflow.resolveLocal("huge"), /more than 4096 values/);
  });

  it("detects cyclic and missing exports and supports descriptor expressions or nodes", () => {
    const dir = fixture({
      "a.ts": `export { value } from "./b";`,
      "b.ts": `export { value } from "./a";`,
      "plain.ts": `export default "plain";`,
    });
    const a = path.join(dir, "a.ts");
    const plain = path.join(dir, "plain.ts");
    const resolver = createStaticGuardResolver({ source: fs.readFileSync(a, "utf8"), filename: a });

    assert.throws(() => resolver.resolveExport(a, "value"), /cyclic export dependency/);
    assert.throws(() => resolver.resolveExport(plain, "missing"), /does not export missing/);
    assert.deepEqual(resolveStaticGuardExport({ file: plain, exportName: "default" }).candidates, ["plain"]);
    assert.deepEqual(resolveStaticClassExpression({ file: plain, expression: '"one two"' }).candidates, ["one", "two"]);
    assert.deepEqual(resolveStaticClassExpression({ file: plain, node: { type: "StringLiteral", value: "three" } }).candidates, ["three"]);
  });
});
