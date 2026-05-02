import assert from "assert";
import * as babelCore from "@babel/core";
import parser from "../packages/babel-parser-litsx/src/index.mjs";
import { beforeAll } from "vitest";
import { interopDefault } from "./helpers/interop-default.js";

const { transformFromAstSync } = babelCore;
let plugin;
let templatePlugin;
let reactEventsPlugin;

beforeAll(async () => {
  const [attributesMod, templateMod, reactEventsMod] = await Promise.all([
    import("../packages/babel-preset-react-compat/src/internal/react-attributes.js"),
    import("../packages/babel-plugin-transform-jsx-html-template/src/index.js"),
    import("../packages/babel-preset-react-compat/src/internal/react-events.js"),
  ]);
  plugin = interopDefault(attributesMod);
  templatePlugin = interopDefault(templateMod);
  reactEventsPlugin = interopDefault(reactEventsMod);
});

describe("react compat internal attributes", () => {
  it("converts React className into class in JSX", () => {
    const source = `const view = <button className="cta"></button>;`;
    const ast = parser.parse(source, { sourceType: "module" });

    const { code } = transformFromAstSync(ast, source, {
      configFile: false,
      babelrc: false,
      plugins: [plugin],
    });

    assert.match(code, /class="cta"/);
    assert.doesNotMatch(code, /className=/);
  });

  it("converts template literals produced by the JSX-to-Lit transform", () => {
    const source = `const view = <button className="cta"></button>;`;
    const ast = parser.parse(source, { sourceType: "module" });

    const { code } = transformFromAstSync(ast, source, {
      configFile: false,
      babelrc: false,
      plugins: [templatePlugin, plugin],
    });

    assert.match(code, /html`<button class="cta"><\/button>`/);
    assert.doesNotMatch(code, /className=/);
  });

  it("coexists with React event rewriting in the same pipeline", () => {
    const source = `const view = <button className="cta" onClick={handleClick}></button>;`;
    const ast = parser.parse(source, { sourceType: "module" });

    const { code } = transformFromAstSync(ast, source, {
      configFile: false,
      babelrc: false,
      plugins: [plugin, reactEventsPlugin, templatePlugin],
    });

    assert.match(code, /html`<button class="cta" @click=\$\{handleClick\}><\/button>`/);
    assert.doesNotMatch(code, /className=/);
  });

  it("handles bare className attributes in JSX", () => {
    const source = `const view = <button className></button>;`;
    const ast = parser.parse(source, { sourceType: "module" });

    const { code } = transformFromAstSync(ast, source, {
      configFile: false,
      babelrc: false,
      plugins: [plugin],
    });

    assert.match(code, /<button class><\/button>/);
    assert.doesNotMatch(code, /className/);
  });

  it("only rewrites className tokens that are actual HTML attributes in templates", () => {
    const source = [
      "import { html } from 'lit';",
      "const view = html`<button className=\"cta\" data-label=\"className=keep\" className =\"secondary\"></button>`;",
    ].join("\n");
    const ast = parser.parse(source, { sourceType: "module" });

    const { code } = transformFromAstSync(ast, source, {
      configFile: false,
      babelrc: false,
      plugins: [plugin],
    });

    assert.match(code, /class="cta"/);
    assert.match(code, /class ="secondary"/);
    assert.match(code, /data-label="className=keep"/);
    assert.doesNotMatch(code, /className="/);
  });
});
