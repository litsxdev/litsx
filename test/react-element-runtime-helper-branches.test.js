import assert from "node:assert/strict";
import * as t from "@babel/types";
import { describe, it } from "vitest";
import {
  createAttribute,
  createJsxElement,
  expressionToChild,
  expressionToChildren,
  importedName,
  isUndefined,
  memberToJsxName,
  normalizeProps,
  propertyName,
  typeToJsxName,
} from "../packages/babel-preset-react-compat/src/internal/react-element-runtime.js";

const fakePath = {
  buildCodeFrameError(message) {
    return new TypeError(message);
  },
};

describe("React element runtime helper branches", () => {
  it("normalizes import names and undefined spellings", () => {
    assert.equal(importedName({ type: "ImportDefaultSpecifier" }), "default");
    assert.equal(importedName({ type: "ImportNamespaceSpecifier" }), "*");
    assert.equal(importedName({ type: "ImportSpecifier", imported: t.identifier("jsx") }), "jsx");
    assert.equal(importedName({ type: "ImportSpecifier", imported: t.stringLiteral("jsxs") }), "jsxs");
    assert.equal(importedName({ type: "ImportSpecifier" }), null);
    assert.equal(isUndefined(t.identifier("undefined"), t), true);
    assert.equal(isUndefined(t.unaryExpression("void", t.numericLiteral(0)), t), true);
    assert.equal(isUndefined(t.unaryExpression("void", t.identifier("x")), t), false);
    assert.equal(isUndefined(t.nullLiteral(), t), false);
  });

  it("converts static element names and rejects dynamic ones", () => {
    const member = t.memberExpression(t.identifier("UI"), t.identifier("Card"));
    assert.equal(memberToJsxName(t.identifier("Card"), t).name, "Card");
    assert.equal(memberToJsxName(member, t).object.name, "UI");
    assert.equal(memberToJsxName(t.memberExpression(t.identifier("UI"), t.stringLiteral("Card"), true), t), null);
    assert.equal(memberToJsxName(t.memberExpression(t.callExpression(t.identifier("get"), []), t.identifier("Card")), t), null);
    assert.equal(typeToJsxName(t.stringLiteral("my-element"), t).name, "my-element");
    assert.equal(typeToJsxName(t.stringLiteral("not valid!"), t), null);
    assert.equal(typeToJsxName(member, t).property.name, "Card");
    assert.equal(propertyName(t.identifier("value"), false, t), "value");
    assert.equal(propertyName(t.stringLiteral("value"), false, t), "value");
    assert.equal(propertyName(t.identifier("value"), true, t), null);
    assert.equal(propertyName(t.numericLiteral(1), false, t), null);
  });

  it("converts child expressions and sparse arrays", () => {
    assert.equal(expressionToChild(t.stringLiteral("text"), t).type, "JSXText");
    const element = t.jsxElement(t.jsxOpeningElement(t.jsxIdentifier("x"), [], true), null, [], true);
    assert.strictEqual(expressionToChild(element, t), element);
    assert.equal(expressionToChild(t.jsxFragment(t.jsxOpeningFragment(), t.jsxClosingFragment(), []), t).type, "JSXFragment");
    assert.equal(expressionToChild(t.jsxText("x"), t).type, "JSXText");
    assert.equal(expressionToChild(t.identifier("value"), t).type, "JSXExpressionContainer");
    const sparse = t.arrayExpression([t.stringLiteral("a"), null, t.identifier("b")]);
    assert.equal(expressionToChildren(sparse, t).length, 2);
    assert.equal(expressionToChildren(t.identifier("one"), t).length, 1);
  });

  it("creates boolean, string, and expression attributes", () => {
    assert.equal(createAttribute("ready", t.booleanLiteral(true), t).value, null);
    assert.equal(createAttribute("title", t.stringLiteral("x"), t).value.value, "x");
    assert.equal(createAttribute("value", t.identifier("x"), t).value.type, "JSXExpressionContainer");
  });

  it("normalizes null, spread, object, child, and keyed props", () => {
    assert.deepEqual(normalizeProps(null, null, null, fakePath, t), { attributes: [], children: [] });
    assert.equal(normalizeProps(t.identifier("props"), null, null, fakePath, t).attributes[0].type, "JSXSpreadAttribute");
    const props = t.objectExpression([
      t.spreadElement(t.identifier("base")),
      t.objectProperty(t.identifier("title"), t.stringLiteral("x")),
      t.objectProperty(t.identifier("ready"), t.booleanLiteral(true)),
      t.objectProperty(t.identifier("children"), t.arrayExpression([t.stringLiteral("a"), t.identifier("b")])),
    ]);
    const normalized = normalizeProps(props, null, t.stringLiteral("key"), fakePath, t);
    assert.equal(normalized.attributes.length, 4);
    assert.equal(normalized.children.length, 2);
    const explicit = [t.jsxText("explicit")];
    assert.strictEqual(normalizeProps(props, explicit, null, fakePath, t).children, explicit);
    assert.throws(
      () => normalizeProps(t.objectExpression([t.objectMethod("method", t.identifier("x"), [], t.blockStatement([]))]), null, null, fakePath, t),
      /computed props method/
    );
    assert.throws(
      () => normalizeProps(t.objectExpression([t.objectProperty(t.identifier("x"), t.numericLiteral(1), true)]), null, null, fakePath, t),
      /computed prop name/
    );
  });

  it("creates empty, populated, member, and fragment JSX nodes", () => {
    const fragments = new Set(["Fragment", "React"]);
    const empty = createJsxElement(t.stringLiteral("div"), null, null, null, fragments, fakePath, t);
    assert.equal(empty.openingElement.selfClosing, true);
    const populated = createJsxElement(
      t.memberExpression(t.identifier("UI"), t.identifier("Card")),
      t.objectExpression([t.objectProperty(t.identifier("title"), t.stringLiteral("x"))]),
      [t.jsxText("child")], null, fragments, fakePath, t
    );
    assert.equal(populated.closingElement.name.property.name, "Card");
    const fragment = createJsxElement(t.identifier("Fragment"), null, [t.jsxText("x")], null, fragments, fakePath, t);
    assert.equal(fragment.type, "JSXFragment");
    const namespaceFragment = createJsxElement(
      t.memberExpression(t.identifier("React"), t.identifier("Fragment")), null, [], null, fragments, fakePath, t
    );
    assert.equal(namespaceFragment.type, "JSXFragment");
    assert.throws(
      () => createJsxElement(t.identifier("Fragment"), null, [], t.stringLiteral("key"), fragments, fakePath, t),
      /keyed or attributed/
    );
    assert.throws(
      () => createJsxElement(t.callExpression(t.identifier("get"), []), null, [], null, fragments, fakePath, t),
      /dynamic element type/
    );
  });
});
