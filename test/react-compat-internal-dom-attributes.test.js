import assert from "assert";
import babelCore from "@babel/core";
import parser from "../packages/babel-parser-litsx/src/index.mjs";
import { beforeAll } from "vitest";
import { interopDefault } from "./helpers/interop-default.js";

const { transformFromAstSync } = babelCore;
let plugin;
let templatePlugin;

beforeAll(async () => {
  const [domAttributesMod, templateMod] = await Promise.all([
    import("../packages/babel-preset-react-compat/src/internal/react-dom-attributes.js"),
    import("../packages/babel-plugin-transform-jsx-html-template/src/index.js"),
  ]);
  plugin = interopDefault(domAttributesMod);
  templatePlugin = interopDefault(templateMod);
});

describe("react compat internal dom attributes", () => {
  it("rewrites htmlFor, controlled value, and text-input onChange in JSX", () => {
    const source = `
      const view = (
        <label htmlFor="search">
          <input id="search" value={query} onChange={handleQueryChange} />
        </label>
      );
    `;
    const ast = parser.parse(source, { sourceType: "module" });

    const { code } = transformFromAstSync(ast, source, {
      configFile: false,
      babelrc: false,
      plugins: [plugin],
    });

    assert.match(code, /for="search"/);
    assert.match(code, /\.value=\{query\}/);
    assert.match(code, /onInput=\{handleQueryChange\}/);
    assert.doesNotMatch(code, /htmlFor=/);
    assert.doesNotMatch(code, /(^|[^.])value=\{query\}/);
  });

  it("rewrites checked, selected, and default value semantics in JSX", () => {
    const source = `
      const view = (
        <>
          <input type="checkbox" checked={enabled} onChange={handleToggle} />
          <select defaultValue={selectedId} onChange={handlePick}>
            <option value="a">A</option>
            <option value="b" selected={selectedId === "b"}>B</option>
          </select>
        </>
      );
    `;
    const ast = parser.parse(source, { sourceType: "module" });

    const { code } = transformFromAstSync(ast, source, {
      configFile: false,
      babelrc: false,
      plugins: [plugin],
    });

    assert.match(code, /\?checked=\{enabled\}/);
    assert.match(code, /onChange=\{handleToggle\}/);
    assert.match(code, /\.value=\{selectedId\}/);
    assert.match(code, /\?selected=\{selectedId === "b"\}/);
    assert.doesNotMatch(code, /(^|[^?])checked=\{enabled\}/);
    assert.doesNotMatch(code, /defaultValue=/);
    assert.doesNotMatch(code, /(^|[^?])selected=\{/);
  });

  it("drops uncontrolled defaults when controlled counterparts are present", () => {
    const source = `
      const view = (
        <>
          <input value={value} defaultValue="fallback" />
          <input checked={checked} defaultChecked />
        </>
      );
    `;
    const ast = parser.parse(source, { sourceType: "module" });

    const { code } = transformFromAstSync(ast, source, {
      configFile: false,
      babelrc: false,
      plugins: [plugin],
    });

    assert.match(code, /\.value=\{value\}/);
    assert.match(code, /\?checked=\{checked\}/);
    assert.doesNotMatch(code, /defaultValue/);
    assert.doesNotMatch(code, /defaultChecked/);
  });

  it("rewrites template literals produced by the JSX-to-template transform", () => {
    const source = `
      const view = (
        <label htmlFor="search">
          <input id="search" value={query} onChange={handleQueryChange} />
        </label>
      );
    `;
    const ast = parser.parse(source, { sourceType: "module" });

    const { code } = transformFromAstSync(ast, source, {
      configFile: false,
      babelrc: false,
      plugins: [templatePlugin, plugin],
    });

    assert.match(code, /for="search"/);
    assert.match(code, /\.value=\$\{query\}/);
    assert.match(code, /onInput="\$\{handleQueryChange\}"/);
  });

  it("preserves custom/component tags and only rewrites supported native inputs", () => {
    const source = `
      const view = (
        <>
          <Panel htmlFor="search" onChange={handlePanelChange} value={query} />
          <input type={"checkbox"} onChange={handleToggle} />
          <textarea onChange={handleEdit} />
        </>
      );
    `;
    const ast = parser.parse(source, { sourceType: "module" });

    const { code } = transformFromAstSync(ast, source, {
      configFile: false,
      babelrc: false,
      plugins: [plugin],
    });

    assert.match(code, /<Panel htmlFor="search" onChange=\{handlePanelChange\} value=\{query\} \/>/);
    assert.match(code, /<input type=\{"checkbox"\} onChange=\{handleToggle\} \/>/);
    assert.match(code, /<textarea onInput=\{handleEdit\} \/>/);
  });

  it("leaves member and namespaced tags untouched while still rewriting native siblings", () => {
    const source = `
      const view = (
        <>
          <UI.Input htmlFor="search" onChange={handlePanelChange} value={query} />
          <svg:foreignObject htmlFor="shape" />
          <input type={"radio"} onChange={handleToggle} />
        </>
      );
    `;
    const ast = parser.parse(source, { sourceType: "module", plugins: ["jsx"] });

    const { code } = transformFromAstSync(ast, source, {
      configFile: false,
      babelrc: false,
      plugins: [plugin],
    });

    assert.match(code, /<UI\.Input htmlFor="search" onChange=\{handlePanelChange\} value=\{query\} \/>/);
    assert.match(code, /<svg:foreignObject htmlFor="shape" \/>/);
    assert.match(code, /<input type=\{"radio"\} onChange=\{handleToggle\} \/>/);
    assert.doesNotMatch(code, /onInput=\{handleToggle\}/);
  });

  it("covers default value and checked edge cases in JSX", () => {
    const source = `
      const view = (
        <>
          <input defaultValue={fallback} />
          <textarea defaultValue={content} />
          <select value={selectedId} defaultValue={fallbackId} />
          <input ?checked={checked} defaultChecked={initiallyChecked} />
        </>
      );
    `;
    const ast = parser.parse(source, { sourceType: "module", plugins: ["jsx"] });

    const { code } = transformFromAstSync(ast, source, {
      configFile: false,
      babelrc: false,
      plugins: [plugin],
    });

    assert.match(code, /<input value=\{fallback\} \/>/);
    assert.match(code, /<textarea value=\{content\} \/>/);
    assert.match(code, /<select \.value=\{selectedId\} \/>/);
    assert.doesNotMatch(code, /defaultValue=\{fallbackId\}/);
    assert.doesNotMatch(code, /defaultChecked=\{initiallyChecked\}/);
  });

  it("keeps change handlers on checked inputs and unsupported defaultValue targets", () => {
    const source = `
      const view = (
        <>
          <input defaultChecked={initiallyChecked} onChange={handleToggle} />
          <input ?checked={checked} onChange={handleCheckedToggle} />
          <input type="FILE" onChange={handleUpload} />
          <section defaultValue={fallback} />
        </>
      );
    `;
    const ast = parser.parse(source, { sourceType: "module", plugins: ["jsx"] });

    const { code } = transformFromAstSync(ast, source, {
      configFile: false,
      babelrc: false,
      plugins: [plugin],
    });

    assert.match(code, /\?checked=\{initiallyChecked\} onChange=\{handleToggle\}/);
    assert.match(code, /<input \?checked=\{checked\} onChange=\{handleCheckedToggle\} \/>/);
    assert.match(code, /<input type="FILE" onChange=\{handleUpload\} \/>/);
    assert.match(code, /<section defaultValue=\{fallback\} \/>/);
    assert.doesNotMatch(code, /onInput=\{handleToggle\}/);
    assert.doesNotMatch(code, /onInput=\{handleCheckedToggle\}/);
    assert.doesNotMatch(code, /onInput=\{handleUpload\}/);
  });

  it("rewrites template literals for additional native DOM semantics", () => {
    const source = `
      const views = [
        <textarea defaultValue={content} onChange={handleEdit} />,
        <input type={"checkbox"} defaultChecked={checked} onChange={handleToggle} />,
        <option selected={active}>A</option>,
        <input defaultValue={fallback} />
      ];
    `;
    const ast = parser.parse(source, { sourceType: "module" });

    const { code } = transformFromAstSync(ast, source, {
      configFile: false,
      babelrc: false,
      plugins: [templatePlugin, plugin],
    });

    assert.match(code, /<textarea \.value="\$\{content\}" onInput="\$\{handleEdit\}"><\/textarea>/);
    assert.match(code, /<input type="\$\{"checkbox"\}" \?checked=\$\{checked\} onChange="\$\{handleToggle\}">/);
    assert.match(code, /<option \?selected=\$\{active\}>A<\/option>/);
    assert.match(code, /<input \.value="\$\{fallback\}">/);
  });

  it("handles template literals with pre-closed tags and unsupported checked/defaultValue targets", () => {
    const source = `
      const views = [
        html\`<div></div>\${suffix}\`,
        <section defaultValue={fallback} />,
        <div checked={value}></div>
      ];
    `;
    const ast = parser.parse(source, { sourceType: "module" });

    const { code } = transformFromAstSync(ast, source, {
      configFile: false,
      babelrc: false,
      plugins: [templatePlugin, plugin],
    });

    assert.match(code, /<div><\/div>\$\{suffix\}/);
    assert.match(code, /<section defaultValue="\$\{fallback\}"><\/section>/);
    assert.match(code, /<div checked="\$\{value\}"><\/div>/);
  });

  it("keeps template onChange handlers for checked and file inputs", () => {
    const source = `
      const views = [
        <input defaultChecked={checked} onChange={handleToggle} />,
        <input type={"file"} onChange={handleUpload} />
      ];
    `;
    const ast = parser.parse(source, { sourceType: "module" });

    const { code } = transformFromAstSync(ast, source, {
      configFile: false,
      babelrc: false,
      plugins: [templatePlugin, plugin],
    });

    assert.match(code, /<input \?checked=\$\{checked\} onChange="\$\{handleToggle\}">/);
    assert.match(code, /<input type="\$\{"file"\}" onInput="\$\{handleUpload\}">/);
    assert.doesNotMatch(code, /onInput="\$\{handleToggle\}"/);
  });
});
