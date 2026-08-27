import assert from "node:assert/strict";
import { describe, it } from "vitest";
import {
  collectElementsIncludingShadowRoots,
  collectHydratableModuleExports,
  createResourceSnapshotBridge,
  ensureHydratableElementSupport,
  findHydrationRootIdForElement,
  findLitElementConstructor,
  findNextElementSibling,
  getChildNodes,
  getForwardedRef,
  getForwardedRefs,
  isCommentNode,
  isElementNode,
  isThenable,
  normalizeClientImports,
  normalizeHydrationPayload,
  normalizeHydrationRoots,
  parseJsonScript,
  parseRootMarker,
  prepareForwardedRefs,
  queryHydrationRoot,
  readClientImports,
  readHydrationData,
  readHydrationPayload,
  readScriptText,
  resolveHydrationRoot,
  resolveHydrationRoots,
  resolveDocument,
  applyHydrationPayload,
  walkNodes,
} from "../packages/ssr/src/hydration.js";

function link(nodes) {
  nodes.forEach((node, index) => {
    node.previousSibling = nodes[index - 1] ?? null;
    node.nextSibling = nodes[index + 1] ?? null;
  });
  return nodes;
}

const element = (attributes = {}) => ({
  nodeType: 1,
  children: [],
  childNodes: [],
  getAttribute: (name) => attributes[name] ?? null,
});

describe("hydration helper branch behavior", () => {
  it("finds LitElement-like constructors and installs support once", () => {
    class Reactive {}
    Reactive.prototype.performUpdate = function () {};
    class LitLike extends Reactive {}
    LitLike.prototype.createRenderRoot = function () {};
    LitLike.prototype.update = function () {};
    LitLike.prototype.render = function () {};
    class Component extends LitLike {}
    assert.equal(findLitElementConstructor(Component), LitLike);
    assert.equal(findLitElementConstructor(null), null);
    assert.equal(findLitElementConstructor(class Plain {}), null);

    const previousSupport = globalThis.litElementHydrateSupport;
    let calls = 0;
    try {
      globalThis.litElementHydrateSupport = ({ LitElement }) => { calls += 1; assert.equal(LitElement, LitLike); };
      ensureHydratableElementSupport(Component);
      ensureHydratableElementSupport(Component);
      assert.equal(calls, 1);
      ensureHydratableElementSupport(class Plain {});

      class Already extends Reactive {}
      Already.prototype.createRenderRoot = function () {};
      Already.prototype.update = function () {};
      Already.prototype.render = function () {};
      Object.defineProperty(Already, "observedAttributes", { value: [] });
      ensureHydratableElementSupport(Already);
      assert.equal(calls, 1);
    } finally {
      globalThis.litElementHydrateSupport = previousSupport;
    }
  });

  it("prepares and deduplicates opaque resource snapshots", () => {
    const bridge = createResourceSnapshotBridge();
    const restored = [];
    bridge.restore("missing", (value) => restored.push(value));
    bridge.prepare({ key: { value: 1 } });
    bridge.restore("key", (value) => restored.push(value));
    bridge.restore("key", (value) => restored.push(value));
    bridge.prepare({ key: { value: 2 } });
    bridge.restore("key", (value) => restored.push(value));
    assert.deepEqual(restored, [{ value: 1 }, { value: 2 }]);
  });

  it("normalizes client import values and stable forwarded refs", () => {
    assert.deepEqual(normalizeClientImports(null), []);
    assert.deepEqual(normalizeClientImports("one"), ["one"]);
    assert.deepEqual(normalizeClientImports(["one", "", 1, "one", "two"]), ["one", "two"]);
    const documentRef = {};
    const firstMap = getForwardedRefs(documentRef);
    assert.equal(getForwardedRefs(documentRef), firstMap);
    const first = getForwardedRef(documentRef, "id");
    assert.equal(getForwardedRef(documentRef, "id"), first);
    assert.deepEqual(first, { current: null });
  });

  it("collects elements across documents, ordinary children, childNodes, and shadow roots", () => {
    const shadowChild = element();
    const nested = element();
    const rootElement = element();
    rootElement.children = [nested];
    rootElement.childNodes = [nested];
    nested.shadowRoot = { childNodes: [shadowChild] };
    const documentRef = { nodeType: 9, documentElement: rootElement };
    assert.deepEqual(collectElementsIncludingShadowRoots(documentRef), [rootElement, nested, shadowChild]);
    rootElement.childNodes.push({ nodeType: 3 });
    assert.deepEqual(collectElementsIncludingShadowRoots(documentRef), [rootElement, nested, shadowChild]);
    assert.deepEqual(collectElementsIncludingShadowRoots(null), []);
  });

  it("recognizes promises, documents, scripts, and malformed JSON", () => {
    assert.equal(isThenable(Promise.resolve()), true);
    assert.equal(isThenable({ then() {} }), true);
    assert.equal(isThenable(null), false);
    assert.equal(isThenable({ then: 1 }), false);

    const scripts = new Map([
      ["good", { textContent: '{"ok":true}' }],
      ["empty", { textContent: "  " }],
      ["bad", { textContent: "{" }],
      ["number", { textContent: 1 }],
    ]);
    const documentRef = { getElementById: (id) => scripts.get(id) };
    assert.equal(resolveDocument(documentRef), documentRef);
    assert.equal(resolveDocument({ ownerDocument: documentRef }), documentRef);
    assert.equal(resolveDocument({}), null);
    assert.equal(readScriptText(null, "good"), null);
    assert.equal(readScriptText(documentRef, ""), null);
    assert.equal(readScriptText(documentRef, "number"), null);
    assert.equal(readScriptText(documentRef, "good"), '{"ok":true}');
    assert.deepEqual(parseJsonScript(documentRef, "good"), { ok: true });
    assert.equal(parseJsonScript(documentRef, "empty"), null);
    assert.equal(parseJsonScript(documentRef, "missing"), null);
    assert.throws(() => parseJsonScript(documentRef, "bad"), /Failed to parse/);
  });

  it("normalizes roots and validates hydration payload shapes", () => {
    assert.deepEqual(normalizeHydrationRoots(null), []);
    assert.deepEqual(normalizeHydrationRoots({ roots: {} }), []);
    assert.deepEqual(normalizeHydrationRoots({ roots: [null, {}, { id: "" }, { id: "one" }, { id: "two", extra: true }] }), [{ id: "one" }, { id: "two", extra: true }]);
    assert.deepEqual(normalizeHydrationPayload(null), { roots: {}, instances: {} });
    assert.deepEqual(normalizeHydrationPayload({ payload: null }), { roots: {}, instances: {} });
    const valid = { roots: {}, instances: {}, resources: {} };
    assert.equal(normalizeHydrationPayload({ payload: valid }), valid);
    for (const payload of [1, [], {}, { roots: [], instances: {} }, { roots: {}, instances: [] }]) {
      assert.throws(() => normalizeHydrationPayload({ payload }), /Invalid LitSX SSR hydration payload/);
    }
    for (const resources of [1, []]) {
      assert.throws(() => normalizeHydrationPayload({ payload: { roots: {}, instances: {}, resources } }), /payload resources/);
    }
  });

  it("parses root markers with flags, tags, missing ids, and non-marker text", () => {
    assert.equal(parseRootMarker(null), null);
    assert.equal(parseRootMarker("other id=one"), null);
    assert.equal(parseRootMarker("litsx-root"), null);
    assert.deepEqual(parseRootMarker(" litsx-root id=one tag=x-box flag "), { id: "one", tagName: "x-box" });
    assert.deepEqual(parseRootMarker("litsx-root id=two"), { id: "two", tagName: null });
  });

  it("walks node trees and resolves attribute or comment-marked hydration roots", () => {
    const target = element({ "data-litsx-root": "direct" });
    const other = element();
    const comment = { nodeType: 8, data: "litsx-root id=commented" };
    link([comment, { nodeType: 3 }, other]);
    const blocker = element();
    const blockedTarget = element();
    link([{ nodeType: 8, data: "litsx-root id=blocked" }, blocker, blockedTarget]);
    assert.equal(getChildNodes(null).length, 0);
    assert.deepEqual(getChildNodes({ childNodes: [target] }), [target]);
    assert.deepEqual(getChildNodes({}), []);
    assert.equal(isCommentNode(comment), true);
    assert.equal(isCommentNode({ constructor: { name: "Comment" } }), true);
    assert.equal(isCommentNode(target), false);
    assert.equal(isElementNode(target), true);
    assert.equal(isElementNode({ tagName: "DIV" }), true);
    assert.equal(isElementNode(comment), false);
    assert.equal(findNextElementSibling(comment), other);
    assert.equal(findNextElementSibling({ nextSibling: { nodeType: 3 } }), null);
    assert.equal(findNextElementSibling(other), null);
    assert.equal(findHydrationRootIdForElement(target), "direct");
    assert.equal(findHydrationRootIdForElement(other), "commented");
    const nodeValueMarker = { nodeType: 8, nodeValue: "litsx-root id=node-value" };
    const nodeValueTarget = element();
    link([nodeValueMarker, nodeValueTarget]);
    assert.equal(findHydrationRootIdForElement(nodeValueTarget), "node-value");
    assert.equal(findHydrationRootIdForElement(blockedTarget), null);
    assert.equal(findHydrationRootIdForElement(null), null);

    const shadowTarget = element({ "data-litsx-root": "shadow" });
    const tree = { childNodes: [target, { nodeType: 1, childNodes: [], shadowRoot: { childNodes: [shadowTarget] } }] };
    const visited = [];
    assert.equal(walkNodes(tree, (node) => { visited.push(node); return true; }), true);
    assert.ok(visited.includes(shadowTarget));
    assert.equal(walkNodes(tree, () => false), false);
    assert.equal(walkNodes({ childNodes: [{ nodeType: 1, childNodes: [target] }] }, (node) => node !== target), false);
    assert.equal(queryHydrationRoot(tree, "direct"), target);
    assert.equal(queryHydrationRoot(tree, "shadow"), shadowTarget);
    assert.equal(queryHydrationRoot({ childNodes: [comment, other] }, "commented"), other);
    assert.equal(queryHydrationRoot({ childNodes: [nodeValueMarker, nodeValueTarget] }, "node-value"), nodeValueTarget);
    assert.equal(queryHydrationRoot({ childNodes: [{ nodeType: 8, data: "litsx-root id=other" }] }, "wanted"), null);
    assert.equal(queryHydrationRoot(tree, "missing"), null);
    assert.equal(queryHydrationRoot(null, "id"), null);
    assert.equal(queryHydrationRoot(tree, ""), null);
  });

  it("returns no registrable exports for malformed module namespaces", () => {
    assert.deepEqual(collectHydratableModuleExports(null), []);
    assert.deepEqual(collectHydratableModuleExports("module"), []);
    assert.deepEqual(collectHydratableModuleExports({ value: 1, other: {} }), []);
  });

  it("prepares forwarded target and property refs while rejecting malformed bindings", () => {
    const target = element({ "data-litsx-forwarded-ref-target": "target" });
    const props = element({ "data-litsx-forwarded-ref-props": '{"focusRef":"target","":"bad","bad":1}' });
    const malformed = element({ "data-litsx-forwarded-ref-props": "{" });
    const array = element({ "data-litsx-forwarded-ref-props": "[]" });
    const documentRef = { nodeType: 9, documentElement: element(), getElementById() { return null; } };
    documentRef.documentElement.children = [target, props, malformed, array];
    documentRef.documentElement.childNodes = documentRef.documentElement.children;
    target.ownerDocument = props.ownerDocument = malformed.ownerDocument = array.ownerDocument = documentRef;
    const stale = getForwardedRef(documentRef, "stale");
    stale.current = {};
    prepareForwardedRefs(documentRef);
    assert.equal(getForwardedRef(documentRef, "target").current, target);
    assert.equal(props.focusRef, getForwardedRef(documentRef, "target"));
    assert.equal(stale.current, null);
    prepareForwardedRefs(null);
  });

  it("reads explicit and scripted hydration metadata and client imports", () => {
    const scripts = new Map([
      ["imports", { textContent: '["a.js"]' }],
      ["hydration", { textContent: '{"roots":[],"payload":{"roots":{},"instances":{}},"clientImports":["fallback.js"]}' }],
    ]);
    const documentRef = { nodeType: 9, getElementById: (id) => scripts.get(id), childNodes: [] };
    assert.deepEqual(readClientImports(documentRef, { clientImports: "explicit.js" }), ["explicit.js"]);
    assert.deepEqual(readClientImports(documentRef, { imports: ["alias.js"] }), ["alias.js"]);
    assert.deepEqual(readClientImports(documentRef, { scriptId: "imports" }), ["a.js"]);
    assert.deepEqual(readClientImports(documentRef, { scriptId: "missing", hydrationData: { clientImports: ["fallback.js"] } }), ["fallback.js"]);
    assert.deepEqual(readHydrationData(documentRef, { hydrationData: { roots: [] } }), { roots: [] });
    assert.deepEqual(readHydrationData(documentRef, { scriptId: "hydration" }).roots, []);
    assert.deepEqual(readHydrationPayload(documentRef, { scriptId: "hydration" }), { roots: {}, instances: {} });
  });

  it("resolves roots, validates tags, and applies payloads once", () => {
    const root = element({ "data-litsx-root": "one" });
    root.tagName = "X-ONE";
    const tree = { childNodes: [root] };
    const hydrationData = {
      roots: [{ id: "one", tagName: "x-one" }],
      payload: { roots: { one: { props: { value: 2 } } }, instances: {} },
    };
    const resolved = resolveHydrationRoots(tree, { hydrationData });
    assert.equal(resolved[0].element, root);
    assert.equal(resolveHydrationRoot(tree, "one", { hydrationData }).element, root);
    assert.throws(() => resolveHydrationRoot(tree, "", { hydrationData }), /non-empty root id/);
    assert.throws(() => resolveHydrationRoot(tree, "missing", { hydrationData }), /did not include/);
    assert.throws(() => resolveHydrationRoots(tree, { hydrationData: { roots: [{ id: "missing" }] } }), /Failed to find/);
    assert.throws(() => resolveHydrationRoots(tree, { hydrationData: { roots: [{ id: "one", tagName: "x-other" }] } }), /expected/);
    assert.equal(resolveHydrationRoots(tree, { hydrationData: { roots: [{ id: "one", tagName: "" }] } })[0].element, root);
    const tagless = element({ "data-litsx-root": "tagless" });
    assert.equal(resolveHydrationRoots({ childNodes: [tagless] }, { hydrationData: { roots: [{ id: "tagless", tagName: "x-tagless" }] } })[0].element, tagless);
    assert.equal(applyHydrationPayload(resolved, hydrationData), resolved);
    assert.equal(root.value, 2);
    assert.equal(applyHydrationPayload(resolved, hydrationData), resolved);
    assert.throws(() => applyHydrationPayload(resolved, { payload: { roots: { one: { props: { value: 3 } } }, instances: {} } }), /already been applied/);
    assert.equal(applyHydrationPayload([{ id: "missing", element: root }], { payload: { roots: {}, instances: {} } }).length, 1);
    for (const props of [null, [], "invalid"]) {
      const target = element();
      applyHydrationPayload([{ id: "negative", element: target }], {
        payload: { roots: { negative: { props } }, instances: {} },
      });
      assert.equal(target.value, undefined);
    }
  });

  it("honors the ambient document defaults without requiring explicit roots", () => {
    const previousDocument = globalThis.document;
    const documentRef = {
      nodeType: 9,
      documentElement: element(),
      getElementById() { return null; },
    };
    try {
      globalThis.document = documentRef;
      assert.equal(resolveDocument(), documentRef);
      assert.deepEqual(readClientImports(), []);
      assert.deepEqual(readHydrationData(), null);
      assert.deepEqual(readHydrationPayload(), { roots: {}, instances: {} });
      prepareForwardedRefs();
    } finally {
      globalThis.document = previousDocument;
    }
  });
});
