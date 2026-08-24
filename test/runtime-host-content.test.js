import assert from "assert";
import {
  createHostContentSnapshot,
  isReactiveControllerHostLike,
  isSameHostContentSnapshot,
} from "../packages/core/src/runtime-host-content.js";

describe("runtime host content", () => {
  it("detects reactive controller hosts", () => {
    assert.strictEqual(isReactiveControllerHostLike(null), false);
    assert.strictEqual(isReactiveControllerHostLike({}), false);
    assert.strictEqual(
      isReactiveControllerHostLike({ addController() {} }),
      true
    );
  });

  it("creates content snapshots from slot props, slot attributes, and iterable childNodes", () => {
    const textNode = { nodeType: 3, textContent: "  hello  " };
    const namedNode = { slot: "aside", textContent: "A" };
    const attrNode = {
      textContent: "B",
      getAttribute(name) {
        return name === "slot" ? "footer" : null;
      },
    };
    const host = {
      childNodes: new Set([textNode, namedNode, attrNode, null]),
    };

    const snapshot = createHostContentSnapshot(host, { trim: true });

    assert.strictEqual(snapshot.text, "hello  AB");
    assert.strictEqual(snapshot.hasContent, true);
    assert.deepStrictEqual(snapshot.slots.default, [textNode, null]);
    assert.deepStrictEqual(snapshot.slots.aside, [namedNode]);
    assert.deepStrictEqual(snapshot.slots.footer, [attrNode]);
  });

  it("treats whitespace-only text content as empty and compares snapshots by slots and nodes", () => {
    const whitespace = { nodeType: 3, textContent: "   " };
    const host = {
      textContent: "   ",
      childNodes: [whitespace],
    };
    const empty = createHostContentSnapshot(host, { trim: true });
    const same = createHostContentSnapshot(host, { trim: true });
    const differentSlot = {
      ...same,
      slots: { named: [whitespace] },
    };
    const differentNodes = {
      ...same,
      nodes: [{ nodeType: 3, textContent: "x" }],
    };

    assert.strictEqual(empty.hasContent, false);
    assert.strictEqual(isSameHostContentSnapshot(empty, empty), true);
    assert.strictEqual(isSameHostContentSnapshot(empty, null), false);
    assert.strictEqual(isSameHostContentSnapshot(empty, same), true);
    assert.strictEqual(isSameHostContentSnapshot(empty, differentSlot), false);
    assert.strictEqual(isSameHostContentSnapshot(empty, differentNodes), false);
  });

  it("covers empty slot metadata, array children, and every snapshot mismatch", () => {
    const text = { nodeType: 3, textContent: null, slot: "", getAttribute: () => "" };
    const element = { textContent: "element" };
    const snapshot = createHostContentSnapshot({ childNodes: [text, element] });
    assert.strictEqual(snapshot.text, "element");
    assert.strictEqual(snapshot.hasContent, true);
    assert.deepStrictEqual(snapshot.slots.default, [text, element]);
    assert.deepStrictEqual(createHostContentSnapshot(null), {
      text: "",
      nodes: [],
      hasContent: false,
      slots: { default: [] },
    });
    assert.strictEqual(createHostContentSnapshot({ childNodes: ["text"] }).hasContent, false);

    const base = { text: "x", hasContent: true, nodes: [text], slots: { default: [text] } };
    assert.strictEqual(isSameHostContentSnapshot(base, { ...base, text: "y" }), false);
    assert.strictEqual(isSameHostContentSnapshot(base, { ...base, hasContent: false }), false);
    assert.strictEqual(isSameHostContentSnapshot(base, { ...base, nodes: [] }), false);
    assert.strictEqual(isSameHostContentSnapshot(base, { ...base, slots: { default: [text], extra: [] } }), false);
    assert.strictEqual(isSameHostContentSnapshot(base, { ...base, slots: { default: [] } }), false);
    assert.strictEqual(
      isSameHostContentSnapshot(base, { ...base, slots: { default: [{}] } }),
      false,
    );
  });
});
