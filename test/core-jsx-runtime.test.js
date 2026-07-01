import assert from "assert";
import fs from "fs";
import { describe, it } from "vitest";

import {
  Fragment,
  LITSX_JSX_TYPE,
  jsx,
  jsxs,
} from "../packages/core/src/jsx-runtime.js";
import { jsxDEV } from "../packages/core/src/jsx-dev-runtime.js";
import packageJson from "../packages/core/package.json" with { type: "json" };

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
    assert.strictEqual(packageJson.module, "./src/index.js");
    assert.strictEqual(packageJson.types, "./src/index.d.ts");
    assert.strictEqual(packageJson.exports["."].import, "./src/index.js");
    assert.strictEqual(packageJson.exports["."].types, "./src/index.d.ts");
    assert.strictEqual(packageJson.exports["./jsx-runtime"].import, "./src/jsx-runtime.js");
    assert.strictEqual(packageJson.exports["./jsx-runtime"].types, "./src/jsx-runtime.d.ts");
    assert.strictEqual(packageJson.exports["./jsx-dev-runtime"].import, "./src/jsx-dev-runtime.js");
    assert.strictEqual(packageJson.exports["./jsx-dev-runtime"].types, "./src/jsx-dev-runtime.d.ts");
    assert.strictEqual(packageJson.exports["./elements"].import, "./src/elements/index.js");
    assert.strictEqual(packageJson.exports["./elements"].types, "./src/elements/index.d.ts");
    assert.strictEqual(packageJson.exports["./rendering"].import, "./src/rendering.js");
    assert.strictEqual(packageJson.exports["./context"].import, "./src/context.js");
    assert.strictEqual(packageJson.exports["./context"].types, "./src/context.d.ts");
    assert.ok(fs.existsSync(new URL("../packages/core/src/index.js", import.meta.url)));
    assert.ok(fs.existsSync(new URL("../packages/core/src/jsx-runtime.js", import.meta.url)));
    assert.ok(fs.existsSync(new URL("../packages/core/src/jsx-dev-runtime.js", import.meta.url)));
    assert.ok(fs.existsSync(new URL("../packages/core/src/elements/index.js", import.meta.url)));
    assert.ok(fs.existsSync(new URL("../packages/core/src/rendering.js", import.meta.url)));
    assert.ok(fs.existsSync(new URL("../packages/core/src/context.js", import.meta.url)));
    assert.ok(fs.existsSync(new URL("../packages/core/src/index.d.ts", import.meta.url)));
    assert.ok(fs.existsSync(new URL("../packages/core/src/jsx-runtime.d.ts", import.meta.url)));
    assert.ok(fs.existsSync(new URL("../packages/core/src/jsx-dev-runtime.d.ts", import.meta.url)));
  });

  it("keeps runtime metadata markers in source entrypoints", () => {
    const rootSource = fs.readFileSync(new URL("../packages/core/src/index.js", import.meta.url), "utf8");
    const hookMetadataSource = fs.readFileSync(new URL("../packages/core/src/hook-metadata.js", import.meta.url), "utf8");
    const elementsSource = fs.readFileSync(new URL("../packages/core/src/elements/index.js", import.meta.url), "utf8");

    assert.match(rootSource, /from "\.\/hook-metadata\.js"/);
    assert.match(rootSource, /from "\.\/elements\/index\.js"/);
    assert.match(hookMetadataSource, /Symbol\.for\("litsx\.hook"\)/);
    assert.match(elementsSource, /Symbol\.for\("litsx\.component"\)/);
    assert.match(elementsSource, /Symbol\.for\("litsx\.hostTypeId"\)/);
  });

  it("types useEmit as a hook that returns an emit function", () => {
    const declarations = fs.readFileSync(new URL("../packages/core/src/index.d.ts", import.meta.url), "utf8");

    assert.match(declarations, /export declare function useEmit\(\): <T = undefined>\(/);
    assert.doesNotMatch(declarations, /export declare function useEmit<T = undefined>\(/);
  });

  it("publishes transition helpers with accurate return types", () => {
    const declarations = fs.readFileSync(new URL("../packages/core/src/index.d.ts", import.meta.url), "utf8");

    assert.match(declarations, /export declare function useTransition\(\): \[boolean, <T>\(callback: \(\) => T\) => T\];/);
    assert.match(declarations, /export declare function startTransition<T>\(callback: \(\) => T\): T;/);
  });

  it("types built-in boundary components with base element attributes like class and ref", () => {
    const declarations = fs.readFileSync(new URL("../packages/core/src/jsx-runtime.d.ts", import.meta.url), "utf8");

    assert.match(declarations, /Component extends typeof SuspenseList \? LitsxBoundaryElementProps<SuspenseList, SuspenseListProps> :/);
    assert.match(declarations, /Component extends typeof SuspenseBoundary \? LitsxSuspenseBoundaryElementProps :/);
    assert.match(declarations, /Component extends typeof ErrorBoundary \? LitsxErrorBoundaryElementProps :/);
  });
});
