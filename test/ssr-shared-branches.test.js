import assert from "node:assert/strict";
import babelTraverse from "@babel/traverse";
import * as t from "@babel/types";
import { describe, it } from "vitest";
import parser from "./helpers/litsx-parser.js";
import {
  buildAvailableMap,
  buildServerComponentPropsObject,
  collectScopedEntries,
  createSsrElementRegistryValue,
  ensureNamedImport,
  setSsrSharedBabelTypes,
  toKebab,
} from "../packages/babel-preset-litsx/src/internal/transform-litsx-ssr-shared.js";

const traverse = babelTraverse.default || babelTraverse;
setSsrSharedBabelTypes(t);

function paths(source) {
  const ast = parser.parse(source, { sourceType: "module", plugins: ["jsx", "typescript"] });
  const found = { ast, program: null, functions: [], openings: [] };
  traverse(ast, {
    Program(path) { found.program = path; },
    Function(path) { found.functions.push(path); },
    JSXOpeningElement(path) { found.openings.push(path); },
  });
  return found;
}

describe("SSR shared transform branch behavior", () => {
  it("indexes all supported top-level declarations and rewrites scoped JSX", () => {
    const context = paths(`
      import DefaultPanel, { NamedPanel as AliasPanel } from "pkg";
      import * as Namespace from "pkg-two";
      import RelativePanel from "./missing";
      class LocalPanel {}
      function HelperPanel() { return <><DefaultPanel/><AliasPanel></AliasPanel><Namespace.Panel/><UnknownPanel/></>; }
      const VariablePanel = () => null, IgnoredPanel = () => null;
      const { DestructuredPanel } = source;
      export function ExportedPanel() {}
      export const ExportedArrow = () => null;
    `);
    const available = buildAvailableMap(context.program, { filename: "/virtual/root.tsx" });
    assert.equal(available.get("DefaultPanel").moduleId, "pkg");
    assert.equal(available.get("RelativePanel").moduleId, "./missing");
    assert.equal(available.get("LocalPanel").local, true);
    assert.equal(available.get("VariablePanel").local, true);
    assert.equal(available.has("IgnoredPanel"), false);
    assert.equal(available.has("Namespace"), false);
    assert.equal(available.has("DestructuredPanel"), false);
    assert.equal(available.get("ExportedPanel").local, true);
    assert.equal(available.get("ExportedArrow").local, true);

    const entries = collectScopedEntries(context.functions[0], available);
    assert.deepEqual(entries.map((entry) => entry.tagName).sort(), ["alias-panel", "default-panel"]);
    assert.equal(toKebab("XMLHttpPanel"), "xml-http-panel");
  });

  it("adds, extends, and deduplicates runtime imports", () => {
    const existing = paths(`import { first } from "runtime"; const value = 1;`);
    ensureNamedImport(existing.program, "runtime", "first");
    ensureNamedImport(existing.program, "runtime", "second");
    assert.equal(existing.program.node.body[0].specifiers.length, 2);

    const fresh = paths(`const value = 1;`);
    ensureNamedImport(fresh.program, "runtime", "only");
    assert.equal(fresh.program.node.body[0].type, "ImportDeclaration");
  });

  it("creates plain and annotated registry expressions", () => {
    const context = paths(`const value = 1;`);
    const plain = createSsrElementRegistryValue(context.program, { originalName: "LocalPanel" });
    assert.equal(plain.name, "LocalPanel");
    const expression = t.memberExpression(t.identifier("module"), t.identifier("Panel"));
    const annotated = createSsrElementRegistryValue(context.program, {
      originalName: "Ignored",
      expression,
      tagName: "remote-panel",
      moduleId: "/remote.js",
    });
    assert.equal(annotated.callee.name, "annotateHydratableCustomElement");
    assert.equal(context.program.node.body[0].source.value, "@litsx/core/elements");
  });

  it("collects only property-style server component attributes", () => {
    const context = paths(`
      const view = <RemotePanel
        .bare
        .text="ready"
        .value={answer}
        ordinary="ignored"
        {...spread}
      />;
    `);
    const object = buildServerComponentPropsObject(context.openings[0]);
    assert.deepEqual(object.properties.map((property) => property.key.name), ["bare", "text", "value"]);
    assert.equal(object.properties[0].value.value, true);
    assert.equal(object.properties[1].value.value, "ready");
    assert.equal(object.properties[2].value.name, "answer");
  });
});
