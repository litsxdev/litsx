import { describe, expect, it } from "vitest";
import * as parser from "@babel/parser";
import ts from "typescript";
import {
  collectAuthoredRenderSourcemapMappings,
  collectAuthoredTemplateAttributeMappings,
  componentNameFromFunctionNode,
  componentNameFromVariableNode,
  createCompilerCaches,
  createStandaloneTsCompilerOptions,
  getSessionFeatureCacheKey,
  getSourceFeaturesCacheKey,
  isChildrenExpression,
  jsxTagName,
  mergeTemplateLoweringMetadata,
  normalizeFinalSourceMap,
  normalizePluginList,
  profilePhase,
  remapTemplateAttributeMappings,
  reparseTemplateLoweringAst,
  shouldStripTypescriptSyntax,
} from "../packages/compiler/src/index.js";

describe("compiler helper branch matrix", () => {
  it("normalizes options, feature keys, plugins, and filenames", () => {
    expect(createStandaloneTsCompilerOptions(ts)).toMatchObject({ allowJs: true, strict: false, types: [] });
    expect(getSourceFeaturesCacheKey(null)).toBe("all");
    expect(getSourceFeaturesCacheKey({ hooks: true, domRefs: false, scopedElements: true })).toBe("101");
    expect(normalizePluginList(null)).toEqual([]);
    expect(normalizePluginList(["x"])).toEqual(["x"]);
    expect(shouldStripTypescriptSyntax()).toBe(false);
    expect(shouldStripTypescriptSyntax("a.ts")).toBe(true);
    expect(shouldStripTypescriptSyntax("a.tsx")).toBe(true);
    expect(shouldStripTypescriptSyntax("a.mts?import")).toBe(true);
    expect(shouldStripTypescriptSyntax("a.ctsx?v=1")).toBe(true);
    expect(shouldStripTypescriptSyntax("a.js")).toBe(false);
    expect(profilePhase("x", () => 4)).toBe(4);
    expect(getSessionFeatureCacheKey("code")).toBe(":jsx:code");
    expect(getSessionFeatureCacheKey("code", { filename: "a.tsx" })).toBe("a.tsx:jsx:code");
    expect(getSessionFeatureCacheKey("code", { filename: "a.ts" })).toBe("a.ts:no-jsx:code");
    expect(createCompilerCaches()).toMatchObject({ sourceFeatures: expect.any(Map), presetPluginsByOptions: { default: expect.any(Map), byOptions: expect.any(WeakMap) } });
  });

  it("classifies authored JSX and component AST shapes", () => {
    expect(jsxTagName(null)).toBeNull();
    expect(jsxTagName({ type: "JSXMemberExpression" })).toBeNull();
    expect(jsxTagName({ type: "JSXIdentifier", name: "section" })).toBe("section");
    expect(jsxTagName({ type: "JSXIdentifier", name: "MyCard" })).toBe("my-card");
    expect(isChildrenExpression(null)).toBe(false);
    expect(isChildrenExpression({ type: "MemberExpression", computed: true })).toBe(false);
    expect(isChildrenExpression({ type: "MemberExpression", computed: false, property: { type: "Identifier", name: "children" } })).toBe(true);
    expect(componentNameFromFunctionNode(null)).toBeNull();
    expect(componentNameFromFunctionNode({ type: "FunctionDeclaration", id: { type: "Identifier", name: "small" } })).toBeNull();
    expect(componentNameFromFunctionNode({ type: "FunctionDeclaration", id: { type: "Identifier", name: "Card" } })).toBe("Card");
    expect(componentNameFromVariableNode(null)).toBeNull();
    expect(componentNameFromVariableNode({ type: "VariableDeclarator", id: { type: "Identifier", name: "Card" }, init: { type: "Literal" } })).toBeNull();
    expect(componentNameFromVariableNode({ type: "VariableDeclarator", id: { type: "Identifier", name: "Card" }, init: { type: "ArrowFunctionExpression" } })).toBe("Card");
  });

  it("collects attribute and render mappings through arrays and scalar visitor keys", () => {
    const source = `
      function Card(props) { return <MyPanel plain active on:click={fn} {...props}>{props.children}<span /></MyPanel>; }
      const Other = () => <section title="x" />;
      function helper() { return <lower />; }
    `;
    const ast = parser.parse(source, { sourceType: "module", plugins: ["jsx"] });
    const attributes = collectAuthoredTemplateAttributeMappings(ast, [], { sourceFileName: "source.tsx" });
    expect(attributes.some((entry) => entry.generatedNeedle === " plain")).toBe(true);
    expect(attributes.some((entry) => entry.generatedNeedle === " active")).toBe(true);
    expect(attributes.length).toBeGreaterThanOrEqual(4);
    expect(collectAuthoredTemplateAttributeMappings(null)).toEqual([]);
    expect(collectAuthoredTemplateAttributeMappings({ type: "Unknown" })).toEqual([]);

    const mappings = collectAuthoredRenderSourcemapMappings(ast, [], { sourceFileName: "source.tsx" });
    expect(mappings.some((entry) => entry.generatedNeedle === "class Card")).toBe(true);
    expect(mappings.some((entry) => entry.generatedNeedle === "class Other")).toBe(true);
    expect(mappings.some((entry) => entry.generatedNeedle === "render()" && entry.componentName == null)).toBe(true);
    expect(mappings.some((entry) => entry.generatedNeedle === "<my-panel")).toBe(true);
    expect(mappings.some((entry) => entry.generatedNeedle === "<slot")).toBe(true);
    expect(collectAuthoredRenderSourcemapMappings(null)).toEqual([]);
    expect(collectAuthoredRenderSourcemapMappings({ type: "Unknown" })).toEqual([]);
  });

  it("collects mappings from sparse synthetic JSX nodes", () => {
    const sparseElement = {
      type: "JSXElement",
      openingElement: {
        type: "JSXOpeningElement",
        name: { type: "JSXIdentifier", name: "div" },
        attributes: [
          null,
          { type: "JSXSpreadAttribute" },
          { type: "JSXAttribute", name: { type: "JSXIdentifier", name: ".value" }, value: { type: "StringLiteral", value: "x" } },
          { type: "JSXAttribute", name: { type: "JSXIdentifier", name: "@event" }, value: null },
          { type: "JSXAttribute", name: { type: "JSXIdentifier", name: "?flag" }, value: null },
          { type: "JSXAttribute", name: { type: "JSXIdentifier", name: "plain" }, value: null, loc: { start: { line: 4, column: 2 }, filename: "node.tsx" } },
        ],
        selfClosing: true,
      },
      closingElement: null,
      children: [],
    };
    const attributes = collectAuthoredTemplateAttributeMappings(sparseElement, [], {});
    expect(attributes.map((entry) => entry.generatedNeedle)).toEqual([" .value=", " @event", " ?flag", " plain"]);
    expect(attributes[0]).toMatchObject({ source: null, line: null, column: null });
    expect(attributes[3]).toMatchObject({ source: "node.tsx", line: 4, column: 2 });

    const sparseReturn = {
      type: "ReturnStatement",
      argument: sparseElement,
      loc: null,
    };
    const mappings = collectAuthoredRenderSourcemapMappings(sparseReturn, [], {}, { componentRender: true });
    expect(mappings.some((entry) => entry.generatedNeedle === "render()")).toBe(true);
    expect(mappings.every((entry) => entry.source == null)).toBe(true);
  });

  it("reparses TSX with default and explicit parser inputs", () => {
    expect(reparseTemplateLoweringAst("const View = () => <div />", { filename: "view.jsx" }).type).toBe("File");
    expect(reparseTemplateLoweringAst("const value: number = 1", { filename: "view.ts", parserPlugins: ["typescript"] }).type).toBe("File");
  });

  it("guards sourcemap remapping and metadata merging", () => {
    const one = [{ generatedNeedle: " x", source: "a.tsx", line: 1, column: 0 }];
    expect(remapTemplateAttributeMappings()).toEqual([]);
    expect(remapTemplateAttributeMappings("bad", {})).toBe("bad");
    expect(remapTemplateAttributeMappings(one, null)).toBe(one);
    const unmapped = remapTemplateAttributeMappings([
      null,
      { generatedNeedle: " x", source: null, line: null, column: null },
      ...one,
    ], { version: 3, sources: ["a.tsx"], names: [], mappings: "", sourcesContent: [""] });
    expect(unmapped).toHaveLength(3);

    expect(mergeTemplateLoweringMetadata()).toEqual({});
    expect(mergeTemplateLoweringMetadata({ a: 1 }, { b: 2, litsxTemplateAttributeMappings: one }, null, [
      { generatedNeedle: " authored", generatedOffset: 0 },
      { generatedNeedle: " extra", generatedOffset: 0 },
    ])).toMatchObject({ a: 1, b: 2, litsxTemplateAttributeMappings: [
      expect.objectContaining({ generatedNeedle: " x" }),
      expect.objectContaining({ generatedNeedle: " extra" }),
    ] });
    expect(mergeTemplateLoweringMetadata({}, { litsxTemplateAttributeMappings: one })).toMatchObject({ litsxTemplateAttributeMappings: one });
  });

  it("normalizes final sourcemaps across invalid, matched, unmatched, and unchanged inputs", () => {
    expect(normalizeFinalSourceMap(null, "x")).toBeNull();
    expect(normalizeFinalSourceMap("bad", "x")).toBe("bad");
    const map = { version: 3, sources: [], sourcesContent: [] };
    expect(normalizeFinalSourceMap(map, "x", { filename: "a.ts" })).toBe(map);
    expect(normalizeFinalSourceMap(map, "x", {})).toBe(map);
    expect(normalizeFinalSourceMap({ version: 3, sources: ["a.ts"], sourcesContent: ["x"] }, "x", { filename: "a.ts" })).toEqual({ version: 3, sources: ["a.ts"], sourcesContent: ["x"] });
    expect(normalizeFinalSourceMap({ version: 3, sources: ["other.ts"] }, "x", { filename: "a.ts" })).toMatchObject({ sources: ["a.ts"], sourcesContent: ["x"] });
    expect(normalizeFinalSourceMap({ version: 3, sources: ["a.ts", "b.ts"], sourcesContent: ["old", null] }, "x", { filename: "a.ts" })).toMatchObject({ sourcesContent: ["x", null] });
    const unmatched = { version: 3, sources: ["a.ts", "b.ts"] };
    expect(normalizeFinalSourceMap(unmatched, "x", { filename: "c.ts" })).toBe(unmatched);
    expect(normalizeFinalSourceMap({ version: 3, sources: ["a.ts"] }, 4, { filename: "a.ts" })).toEqual({ version: 3, sources: ["a.ts"] });
  });
});
