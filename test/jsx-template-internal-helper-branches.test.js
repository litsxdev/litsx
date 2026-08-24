import assert from "assert";
import { parse, parseExpression } from "@babel/parser";
import * as babelTypes from "@babel/types";
import { describe, it } from "vitest";
import {
  collectGeneratedAnchorRanges,
  containsJsxRefAttribute,
  containsJsxSpreadAttribute,
  containsRoutedComponentProps,
  findInRanges,
  indexToPosition,
  isExternalRoutableImport,
  isRestPropsMetadataKey,
  isTaggedTemplate,
  resolvePatchedIndex,
  setJsxTemplateBabelTypes,
} from "../packages/babel-plugin-transform-jsx-html-template/src/index.js";
import {
  addString,
  buildTemplate,
  collectLitAttributeSourcemapMetadata,
  copySourceLocation,
  createComponentCallee,
  createJsxReplacement,
  getAttributeValue,
  lowerEmbeddedJsx,
  materializeChildExpression,
  setTemplateTypes,
  shouldLowerAuthoredComponentAttributeAsProperty,
  stringifyJsxName,
  trimString,
} from "../packages/babel-plugin-transform-jsx-html-template/src/template.js";

setJsxTemplateBabelTypes(babelTypes);
setTemplateTypes(babelTypes);

function expression(source) {
  return parseExpression(source, { plugins: ["jsx"] });
}

describe("jsx template internal helper branches", () => {
  it("finds spread, ref, and routed props recursively", () => {
    const spread = expression("<><div><x-box {...props} /></div></>");
    const ref = expression("<><div><x-box ref={value} /></div></>");
    const routed = expression("<><div><Widget value={1} /></div></>");
    routed.children[0].children[0].openingElement.__litsxRouteRestProps = true;

    assert.strictEqual(containsJsxSpreadAttribute(null), false);
    assert.strictEqual(containsJsxSpreadAttribute(spread), true);
    assert.strictEqual(containsJsxSpreadAttribute(ref), false);
    assert.strictEqual(containsJsxRefAttribute(null), false);
    assert.strictEqual(containsJsxRefAttribute(ref), true);
    assert.strictEqual(containsJsxRefAttribute(spread), false);
    assert.strictEqual(containsRoutedComponentProps(null), false);
    assert.strictEqual(containsRoutedComponentProps(routed), true);
    assert.strictEqual(containsRoutedComponentProps(expression("<Widget />")), false);
  });

  it("recognizes metadata and external import binding shapes defensively", () => {
    assert.strictEqual(isRestPropsMetadataKey(expression("Symbol.for('litsx.restProps')")), true);
    assert.strictEqual(isRestPropsMetadataKey(expression("Symbol.other('litsx.restProps')")), false);
    assert.strictEqual(isExternalRoutableImport(null), false);
    const binding = (source, kind = "named") => ({
      path: {
        isImportSpecifier: () => kind === "named",
        isImportDefaultSpecifier: () => kind === "default",
        isImportNamespaceSpecifier: () => kind === "namespace",
        parentPath: { node: { source: { value: source } } },
      },
    });
    assert.strictEqual(isExternalRoutableImport(binding("pkg")), true);
    assert.strictEqual(isExternalRoutableImport(binding("react")), false);
    assert.strictEqual(isExternalRoutableImport(binding("react/jsx-runtime", "default")), false);
    assert.strictEqual(isExternalRoutableImport(binding("@litsx/core/extra", "namespace")), false);
  });

  it("indexes positions, anchors, ranges, and all patched-index scopes", () => {
    assert.deepStrictEqual(indexToPosition("a\nbc", 4), { line: 2, column: 2 });
    assert.strictEqual(isTaggedTemplate(expression("html`x`"), "html"), true);
    assert.strictEqual(isTaggedTemplate(expression("other`x`"), "html"), false);

    const code = "class View { render() { return html`a${value}b`; } }";
    const anchors = collectGeneratedAnchorRanges(code);
    assert.strictEqual(anchors.classes.has("View"), true);
    assert.strictEqual(anchors.renders.length, 1);
    assert.strictEqual(anchors.renderReturns.length, 1);
    assert.strictEqual(anchors.htmlTemplates.length, 2);
    assert.strictEqual(findInRanges(code, "a", anchors.htmlTemplates), anchors.htmlTemplates[0].start);
    assert.strictEqual(findInRanges(code, "missing", anchors.htmlTemplates, 0), -1);

    const cursors = new Map();
    assert.strictEqual(resolvePatchedIndex(code, { generatedScope: "class", componentName: "View" }, anchors, cursors), 0);
    assert.strictEqual(resolvePatchedIndex(code, { generatedScope: "class", componentName: "Missing" }, anchors, cursors), -1);
    assert.strictEqual(resolvePatchedIndex(code, { generatedScope: "render" }, anchors, cursors), anchors.renders[0]);
    assert.strictEqual(resolvePatchedIndex(code, { generatedScope: "render" }, anchors, cursors), -1);
    assert.strictEqual(resolvePatchedIndex(code, { generatedScope: "render-return" }, anchors, cursors), anchors.renderReturns[0]);
    assert.notStrictEqual(resolvePatchedIndex(code, { generatedScope: "html-template", generatedNeedle: "a" }, anchors, cursors), -1);
    assert.strictEqual(resolvePatchedIndex(code, { generatedScope: "html-template", generatedNeedle: "z" }, anchors, cursors), -1);
    assert.notStrictEqual(resolvePatchedIndex(code, { generatedNeedle: "class" }, anchors, cursors), -1);
    assert.strictEqual(resolvePatchedIndex(code, { generatedNeedle: "absent" }, anchors, cursors), -1);
  });

  it("covers template construction defaults and unusual JSX node shapes", () => {
    assert.deepStrictEqual(collectLitAttributeSourcemapMetadata(null), []);
    assert.strictEqual(trimString("\n  "), "");
    assert.strictEqual(trimString("a\n b"), "a b");
    const strings = [{ value: { raw: "a", cooked: null } }];
    addString(strings, [], "b");
    assert.strictEqual(strings[0].value.cooked, "b");
    const target = {};
    assert.strictEqual(copySourceLocation(target, {}), target);

    const jsx = expression("<x-box />");
    assert.strictEqual(createJsxReplacement(jsx, undefined).type, "TaggedTemplateExpression");
    assert.strictEqual(createJsxReplacement(jsx, { tag: null }).type, "TemplateLiteral");
    assert.strictEqual(lowerEmbeddedJsx(null), null);
    const opaque = { type: "UnknownNode" };
    assert.strictEqual(lowerEmbeddedJsx(opaque), opaque);

    const emptyArrow = expression("() => <x-box />");
    assert.strictEqual(materializeChildExpression(emptyArrow, {}).type, "CallExpression");
    const asyncArrow = expression("async () => <x-box />");
    assert.strictEqual(materializeChildExpression(asyncArrow, {}).type, "ArrowFunctionExpression");

    const namespaced = babelTypes.jsxNamespacedName(
      babelTypes.jsxIdentifier("svg"),
      babelTypes.jsxIdentifier("path"),
    );
    assert.strictEqual(stringifyJsxName(namespaced), "svg:path");
    assert.strictEqual(createComponentCallee(namespaced).type, "MemberExpression");
    assert.strictEqual(stringifyJsxName({ type: "Unknown" }), "unknown");

    const bare = babelTypes.jsxAttribute(babelTypes.jsxIdentifier("disabled"), null);
    const string = babelTypes.jsxAttribute(babelTypes.jsxIdentifier("title"), babelTypes.stringLiteral("hello"));
    assert.strictEqual(getAttributeValue(bare, {}).value, true);
    assert.strictEqual(getAttributeValue(string, {}).value, "hello");
    assert.strictEqual(shouldLowerAuthoredComponentAttributeAsProperty(bare, "disabled", {}), true);
    assert.strictEqual(shouldLowerAuthoredComponentAttributeAsProperty(string, "data-id", {}), false);

    const refString = expression('<x-box ref="named" />');
    const refBare = expression("<x-box ref />");
    const style = expression("<x-box style={styles} />");
    assert.strictEqual(buildTemplate(refString, {}).type, "TemplateLiteral");
    assert.strictEqual(buildTemplate(refBare, { reactCompatRefs: true }).type, "TemplateLiteral");
    assert.strictEqual(buildTemplate(style, {}).type, "TemplateLiteral");
  });
});
