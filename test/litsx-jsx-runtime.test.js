import assert from "assert";
import fs from "fs";
import { describe, it } from "vitest";

import {
  Fragment,
  LITSX_JSX_TYPE,
  jsx,
  jsxs,
} from "../packages/litsx/src/jsx-runtime.js";
import { jsxDEV } from "../packages/litsx/src/jsx-dev-runtime.js";
import packageJson from "../packages/litsx/package.json" with { type: "json" };

describe("litsx jsx runtime", () => {
  it("creates jsx nodes with a stable runtime marker", () => {
    const node = jsx("div", { id: "root" }, "key-1");

    assert.strictEqual(node.$$typeof, LITSX_JSX_TYPE);
    assert.strictEqual(node.type, "div");
    assert.strictEqual(node.key, "key-1");
    assert.deepStrictEqual(node.props, { id: "root" });
  });

  it("exports fragment and dev helpers", () => {
    const node = jsxs(Fragment, { children: ["a", "b"] });
    const devNode = jsxDEV("span", { title: "x" }, undefined, false, "file", "self");

    assert.strictEqual(node.type, Fragment);
    assert.strictEqual(devNode.$$typeof, LITSX_JSX_TYPE);
    assert.strictEqual(devNode.type, "span");
    assert.strictEqual(devNode.__source, "file");
    assert.strictEqual(devNode.__self, "self");
  });

  it("defaults jsxDEV props and key when they are omitted", () => {
    const devNode = jsxDEV("span", null, undefined, false, undefined, undefined);

    assert.deepStrictEqual(devNode.props, {});
    assert.strictEqual(devNode.key, null);
    assert.strictEqual(devNode.__source, undefined);
    assert.strictEqual(devNode.__self, undefined);
  });

  it("defaults JSX props to an empty object when none are provided", () => {
    const node = jsx("div", null, undefined);

    assert.deepStrictEqual(node.props, {});
    assert.strictEqual(node.key, null);
  });

  it("publishes jsx runtime entrypoints and type declarations", () => {
    assert.ok(packageJson.exports["./jsx-runtime"]);
    assert.ok(packageJson.exports["./jsx-dev-runtime"]);
    assert.strictEqual(packageJson.types, "./src/index.d.ts");
    assert.ok(fs.existsSync(new URL("../packages/litsx/src/index.d.ts", import.meta.url)));
    assert.ok(fs.existsSync(new URL("../packages/litsx/src/jsx-runtime.d.ts", import.meta.url)));
    assert.ok(fs.existsSync(new URL("../packages/litsx/src/jsx-dev-runtime.d.ts", import.meta.url)));
  });

  it("types useEmit as a hook that returns an emit function", () => {
    const declarations = fs.readFileSync(new URL("../packages/litsx/src/index.d.ts", import.meta.url), "utf8");

    assert.match(declarations, /export declare function useEmit\(\): <T = undefined>\(/);
    assert.doesNotMatch(declarations, /export declare function useEmit<T = undefined>\(/);
  });

  it("publishes transition helpers with accurate return types", () => {
    const declarations = fs.readFileSync(new URL("../packages/litsx/src/index.d.ts", import.meta.url), "utf8");

    assert.match(declarations, /export declare function useTransition\(\): \[boolean, <T>\(callback: \(\) => T\) => T\];/);
    assert.match(declarations, /export declare function startTransition<T>\(callback: \(\) => T\): T;/);
  });
});
