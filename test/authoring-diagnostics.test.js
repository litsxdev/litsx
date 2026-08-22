import assert from "node:assert";
import * as babelParser from "@babel/parser";
import { describe, it } from "vitest";
import {
  collectComponentNameDiagnostics,
  collectHookDiagnostics,
  componentNameToTagName,
  isValidCustomElementName,
} from "../packages/authoring/src/index.js";

function parse(source) {
  return babelParser.parse(source, {
    sourceType: "module",
    plugins: ["jsx", "typescript"],
  });
}

describe("shared LitSX authoring diagnostics", () => {
  it("maps valid component and namespace names without inventing a prefix", () => {
    assert.strictEqual(componentNameToTagName("ActionButton"), "action-button");
    assert.strictEqual(
      componentNameToTagName(["Controls", "Toggle"]),
      "controls-toggle",
    );
    assert.strictEqual(isValidCustomElementName("action-button"), true);
    assert.strictEqual(isValidCustomElementName("button"), false);
  });

  it("rejects short and reserved custom-element names with one stable code", () => {
    for (const name of ["Switch", "App", "AnnotationXml"]) {
      assert.throws(
        () => componentNameToTagName(name),
        (error) => error?.code === "LITSX_INVALID_COMPONENT_NAME",
      );
    }

    const diagnostics = collectComponentNameDiagnostics(parse(`
      function Switch() { return <button />; }
      import { App } from "./app.js";
      const view = <><App /><App /></>;
    `));
    assert.deepStrictEqual(
      diagnostics.map(({ code, componentName }) => [code, componentName]),
      [
        ["LITSX_INVALID_COMPONENT_NAME", "Switch"],
        ["LITSX_INVALID_COMPONENT_NAME", "App"],
      ],
    );
  });

  it("accepts React control primitives without treating them as components", () => {
    const diagnostics = collectComponentNameDiagnostics(parse(`
      import React, { Suspense as LoadingBoundary } from "react";
      const view = <React.Fragment><LoadingBoundary /></React.Fragment>;
    `));
    assert.deepStrictEqual(diagnostics, []);
  });

  it("reports unstable hook order and scope from one shared analyzer", () => {
    const diagnostics = collectHookDiagnostics(parse(`
      import { useAsyncState, useHost, useState } from "@litsx/core";
      function useNestedDefinition() {
        function useNested() { useHost(); }
        return useNested;
      }
      function ActionButton({ active }) {
        if (active) useState(0);
        for (const item of []) useHost();
        useAsyncState(0, async () => useHost());
        const handler = () => useState(1);
        return <button on:click={handler} />;
      }
    `));
    const codes = diagnostics.map(({ code }) => code);
    assert.ok(codes.includes("LITSX_NESTED_HOOK_DEFINITION"));
    assert.ok(codes.includes("LITSX_HOOK_CONDITIONAL"));
    assert.ok(codes.includes("LITSX_HOOK_LOOP"));
    assert.ok(codes.includes("LITSX_HOOK_DEFERRED_ACTION"));
    assert.ok(codes.includes("LITSX_HOOK_INVALID_SCOPE"));
  });

  it("reports hooks after a conditional early return", () => {
    const diagnostics = collectHookDiagnostics(parse(`
      import { useState } from "@litsx/core";
      function CounterButton({ hidden }) {
        if (hidden) return null;
        const state = useState(0);
        return <button>{state[0]}</button>;
      }
    `));
    assert.deepStrictEqual(
      diagnostics.map(({ code }) => code),
      ["LITSX_HOOK_AFTER_EARLY_RETURN"],
    );
  });

  it("allows synchronous hooks in components, custom hooks, render, and defineHook use", () => {
    const diagnostics = collectHookDiagnostics(parse(`
      import { defineHook, useHost, useState } from "@litsx/core";
      const useCapability = defineHook({ use: () => useHost().capability });
      function useCounter() { return useState(0); }
      function CounterButton() { useCapability(); useCounter(); return <button />; }
      class ExistingElement { render() { useCounter(); return null; } }
    `));
    assert.deepStrictEqual(diagnostics, []);
  });
});
