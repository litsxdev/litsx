import assert from "node:assert/strict";
import { transformSync, types as t } from "@babel/core";
import { describe, it } from "vitest";
import { extractUseStateInfo } from "../packages/babel-plugin-shared-hooks/src/use-state-analysis.js";
import reactHookExportAliases from "../packages/babel-preset-react-compat/src/internal/react-hook-export-aliases.js";
import reactPolymorphicElements from "../packages/babel-preset-react-compat/src/internal/react-polymorphic-elements.js";
import {
  attachStaticIr,
  collectStaticIr,
  consumeStaticIr,
  createEmptyStaticIr,
  ensureStaticIr,
  getStaticIr,
  normalizeStaticIr,
  setStaticIrBabelTypes,
  setStaticIrInferredProperties,
} from "../packages/babel-preset-litsx/src/internal/transform-litsx-static-ir.js";
import {
  buildStableIdentitySeed,
  createStableIdentity,
  hashStableIdentity,
  normalizeStableIdentityPath,
} from "../packages/babel-preset-litsx/src/internal/stable-identity.js";

describe("shared hook state analysis branches", () => {
  it("derives unique state keys from identifiers, setters, gaps, and collisions", () => {
    const call = (...args) => t.callExpression(t.identifier("useState"), args);
    assert.equal(extractUseStateInfo({ id: t.identifier("x"), init: t.numericLiteral(1) }, new Set(), t), null);
    assert.equal(extractUseStateInfo({ id: t.identifier("x"), init: t.callExpression(t.identifier("other"), []) }, new Set(), t), null);
    assert.equal(extractUseStateInfo({ id: t.objectPattern([]), init: call() }, new Set(), t), null);

    const used = new Set(["count", "count1", "state1", "value"]);
    const direct = extractUseStateInfo({ id: t.identifier("count"), init: call(t.numericLiteral(0)) }, used, t);
    assert.equal(direct.stateKeyName, "count2");
    assert.equal(direct.initArg.value, 0);

    const setter = extractUseStateInfo({
      id: t.arrayPattern([null, t.identifier("setValue")]),
      init: call(),
    }, used, t);
    assert.equal(setter.valueBindingName, null);
    assert.equal(setter.setterBindingName, "setValue");
    assert.equal(setter.stateKeyName, "value1");
    assert.equal(setter.initArg, null);

    const oddSetter = extractUseStateInfo({
      id: t.arrayPattern([null, t.identifier("update")]),
      init: call(),
    }, used, t);
    assert.equal(oddSetter.stateKeyName, "updateState");

    const anonymous = extractUseStateInfo({ id: t.arrayPattern([]), init: call() }, used, t);
    assert.equal(anonymous.stateKeyName, "state2");
  });
});

describe("static IR and stable identity branches", () => {
  it("normalizes, collects, attaches, and consumes sparse static IR", () => {
    setStaticIrBabelTypes(t);
    const empty = createEmptyStaticIr();
    assert.deepEqual(normalizeStaticIr(), empty);
    assert.deepEqual(ensureStaticIr(null), empty);
    assert.equal(attachStaticIr(null, empty), null);
    assert.equal(getStaticIr(null), null);
    assert.equal(consumeStaticIr(null), null);
    assert.equal(setStaticIrInferredProperties(null, []), null);

    const functionPath = {
      node: {
        body: {
          body: [
            t.expressionStatement(t.callExpression(t.identifier("__litsx_static_properties"), [t.objectExpression([])])),
            t.expressionStatement(t.callExpression(t.identifier("__litsx_static_properties"), [])),
            t.expressionStatement(t.callExpression(t.identifier("__litsx_static_lightDom"), [])),
            t.expressionStatement(t.callExpression(t.identifier("__litsx_static_lightDom"), [t.booleanLiteral(true)])),
            t.expressionStatement(t.callExpression(t.identifier("__litsx_static_lightDom"), [t.booleanLiteral(false)])),
            t.returnStatement(null),
          ],
        },
      },
    };
    const ir = collectStaticIr({
      functionPath,
      elementCandidates: ["local-card"],
      importedElementCandidates: [null, { tagName: "remote-card" }],
    });
    assert.equal(ir.properties.authored.length, 1);
    assert.deepEqual(ir.elements.localCandidates, ["local-card"]);
    assert.deepEqual(ir.elements.importedCandidates, [null, { tagName: "remote-card" }]);
    assert.equal(ir.lightDom, true);

    setStaticIrInferredProperties(ir, [t.stringLiteral("title")]);
    const node = {};
    attachStaticIr(node, ir);
    assert.equal(getStaticIr(node).properties.inferred[0].expression.value, "title");
    assert.ok(consumeStaticIr(node));
    assert.equal(getStaticIr(node), null);
    assert.deepEqual(collectStaticIr({ functionPath: null, elementCandidates: new Set(["x-card"]) }).elements.localCandidates, ["x-card"]);
  });

  it("builds stable identities from every filename and location fallback", () => {
    assert.equal(normalizeStableIdentityPath("C:\\src\\Card.tsx"), "C:/src/Card.tsx");
    assert.equal(normalizeStableIdentityPath(null), "");
    assert.equal(hashStableIdentity("same"), hashStableIdentity("same"));
    assert.notEqual(hashStableIdentity("same"), hashStableIdentity("other"));
    const pathLike = { node: { start: 7, loc: { start: { line: 2, column: 4 } } } };
    assert.equal(buildStableIdentitySeed(pathLike, { file: { opts: { sourceFileName: "C:\\src\\Card.tsx", filename: "ignored" } } }), "C:/src/Card.tsx:2:4:7");
    assert.equal(buildStableIdentitySeed({ node: {} }, { file: { opts: { filename: "/src/Fallback.tsx" } } }), "/src/Fallback.tsx:0:0:0");
    assert.equal(buildStableIdentitySeed({ node: {} }, { filename: "/src/State.tsx" }), "/src/State.tsx:0:0:0");
    assert.match(createStableIdentity("host-", pathLike, { filename: "/src/Card.tsx" }), /^host-[a-z0-9]+$/);
  });
});

describe("React compatibility branch plugins", () => {
  const transform = (source, plugin) => transformSync(source, {
    configFile: false,
    babelrc: false,
    parserOpts: { sourceType: "module", plugins: ["jsx"] },
    plugins: [plugin],
  }).code;

  it("promotes minified hook and component aliases across function and split variable declarations", () => {
    const code = transform(`
      function a() { return 1; }
      const before = 0, b = () => null, after = 2;
      export { a as useRemoteHook, b as PublicPanel };
    `, reactHookExportAliases);
    assert.match(code, /export function useRemoteHook/);
    assert.match(code, /export const PublicPanel/);
    assert.match(code, /const before = 0/);
    assert.match(code, /const after = 2/);
    assert.doesNotMatch(code, /export \{/);
  });

  it("promotes standalone and already-exported aliases while preserving sibling specifiers", () => {
    const standalone = transform(`
      const a = () => null;
      const untouched = 1;
      export { a as PublicPanel, untouched as ordinary };
    `, reactHookExportAliases);
    assert.match(standalone, /export const PublicPanel/);
    assert.match(standalone, /untouched as ordinary/);

    const alreadyExported = transform(`
      export function a() { return null; }
      export { a as PublicPanel };
    `, reactHookExportAliases);
    assert.match(alreadyExported, /function PublicPanel/);
    assert.match(alreadyExported, /export \{ PublicPanel as a \}/);
  });

  it("leaves irrelevant, sourced, already-exported, and unsupported aliases stable", () => {
    const code = transform(`
      export function useReady() {}
      const value = 1;
      export { value as ordinary };
      export { remote as useRemote } from "./remote.js";
    `, reactHookExportAliases);
    assert.match(code, /export function useReady/);
    assert.match(code, /value as ordinary/);
    assert.match(code, /from "\.\/remote\.js"/);
  });

  it("rejects alias promotion collisions", () => {
    assert.throws(
      () => transform(`const a = () => null; const PublicPanel = 1; export { a as PublicPanel };`, reactHookExportAliases),
      /collides with another declaration/,
    );
  });

  it("lowers polymorphic string, identifier, member, and Radix Slot branches", () => {
    const code = transform(`
      import { Slot } from "@radix-ui/react-slot";
      const ButtonTag = asLink ? "a" : "button";
      const PanelTag = compact ? UI.SmallPanel : UI.LargePanel;
      const SlotTag = passthrough ? Slot : "div";
      export const View = () => <><ButtonTag id="a" /><PanelTag></PanelTag><SlotTag /></>;
    `, reactPolymorphicElements);
    assert.match(code, /asLink \? <a id="a" \/> : <button id="a" \/>/);
    assert.match(code, /compact \? <UI\.SmallPanel><\/UI\.SmallPanel> : <UI\.LargePanel><\/UI\.LargePanel>/);
    assert.match(code, /passthrough \? <slot \/> : <div \/>/);
  });

  it("ignores unsupported polymorphic declarations and JSX names", () => {
    const source = `
      const BadTag = flag ? "not valid!" : lookup[key];
      const NotConditional = "div";
      export const View = () => <><BadTag /><NotConditional /><UI.Member /></>;
    `;
    const code = transform(source, reactPolymorphicElements);
    assert.match(code, /<BadTag \/>/);
    assert.match(code, /<NotConditional \/>/);
  });
});
