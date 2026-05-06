import assert from "assert";
import babelCore from "@babel/core";
import parser from "../packages/babel-parser-litsx/src/index.mjs";
import { beforeAll } from 'vitest';
import { interopDefault } from "./helpers/interop-default.js";

const { transformFromAstSync } = babelCore;
let plugin;
let templatePlugin;

beforeAll(async () => {
  const [reactEventsMod, templateMod] = await Promise.all([
    import("../packages/babel-preset-react-compat/src/internal/react-events.js"),
    import("../packages/babel-plugin-transform-jsx-html-template/src/index.js"),
  ]);
  plugin = interopDefault(reactEventsMod);
  templatePlugin = interopDefault(templateMod);
});

describe("react compat internal events", () => {
  it("converts React onClick into @click", () => {
    const source = `const view = <button onClick={handleClick}></button>;`;
    const ast = parser.parse(source, { sourceType: "module" });

    const { code } = transformFromAstSync(ast, source, {
      configFile: false,
      babelrc: false,
      plugins: [plugin],
    });

    assert.match(code, /@click=\{handleClick\}/);
  });

  it("wraps capture listeners with capture metadata", () => {
    const source = `const view = <button onPointerDownCapture={handlePointer}></button>;`;
    const ast = parser.parse(source, { sourceType: "module" });

    const { code } = transformFromAstSync(ast, source, {
      configFile: false,
      babelrc: false,
      plugins: [plugin],
    });

    assert.match(
      code,
      /@pointerdown=\{\{\s*handleEvent: handlePointer,\s*capture: true\s*\}\}/
    );
  });

  it("respects lowercaseEventNames option", () => {
    const source = `const view = <button onPointerDown={handler}></button>;`;
    const ast = parser.parse(source, { sourceType: "module" });

    const { code } = transformFromAstSync(ast, source, {
      configFile: false,
      babelrc: false,
      plugins: [[plugin, { lowercaseEventNames: false }]],
    });

    assert.match(code, /@PointerDown=\{handler\}/);
  });

  it("converts boolean React event attributes without values", () => {
    const source = `const view = <button onClick></button>`;
    const ast = parser.parse(source, { sourceType: "module" });

    const { code } = transformFromAstSync(ast, source, {
      configFile: false,
      babelrc: false,
      plugins: [plugin],
    });

    assert.match(code, /@click=\{true\}/);
  });

  it("treats empty JSX event expressions as boolean true", () => {
    const source = `const view = <button onClick={value}></button>`;
    const ast = parser.parse(source, { sourceType: "module" });
    const attrValue = ast.program.body[0].declarations[0].init.openingElement.attributes[0].value;
    attrValue.expression = { type: "JSXEmptyExpression" };

    const { code } = transformFromAstSync(ast, source, {
      configFile: false,
      babelrc: false,
      plugins: [plugin],
    });

    assert.match(code, /@click=\{true\}/);
  });

  it("rewrites aliased DOM event names that need compatibility remapping", () => {
    const source = `const view = <button onDoubleClick={onDbl} onBlur={onBlur}></button>;`;
    const ast = parser.parse(source, { sourceType: "module" });

    const { code } = transformFromAstSync(ast, source, {
      configFile: false,
      babelrc: false,
      plugins: [plugin],
    });

    assert.match(code, /@dblclick=\{onDbl\}/);
    assert.match(
      code,
      /@focusout=\{\{\s*handleEvent: onBlur,\s*capture: true\s*\}\}/
    );
  });

  it("applies alias capture metadata even without an authored Capture suffix", () => {
    const source = `const view = <input onFocus={onFocus}></input>;`;
    const ast = parser.parse(source, { sourceType: "module" });

    const { code } = transformFromAstSync(ast, source, {
      configFile: false,
      babelrc: false,
      plugins: [plugin],
    });

    assert.match(
      code,
      /@focusin=\{\{\s*handleEvent: onFocus,\s*capture: true\s*\}\}/
    );
  });

  it("throws when React-style event attributes have no target name", () => {
    const source = `const view = <button onCapture={handler}></button>`;
    const ast = parser.parse(source, { sourceType: "module" });

    assert.throws(() => {
      transformFromAstSync(ast, source, {
        configFile: false,
        babelrc: false,
        plugins: [plugin],
      });
    }, /React-style event attribute "onCapture" is missing a target name/);
  });

  it("converts template literals produced by the JSX-to-Lit transform", () => {
    const source = `const view = <button onClick={handleClick}></button>;`;
    const ast = parser.parse(source, { sourceType: "module" });

    const { code } = transformFromAstSync(ast, source, {
      configFile: false,
      babelrc: false,
      plugins: [templatePlugin, plugin],
    });

    assert.match(code, /@click=\$\{handleClick\}/);
  });

  it("updates capture metadata when the listener is already an object", () => {
    const source = `const view = <button onFocusCapture={{ handleEvent: handleFocus, capture: false }}></button>;`;
    const ast = parser.parse(source, { sourceType: "module" });

    const { code } = transformFromAstSync(ast, source, {
      configFile: false,
      babelrc: false,
      plugins: [plugin],
    });

    assert.match(code, /@focusin=\{\{\s*handleEvent: handleFocus,\s*capture: true\s*\}\}/);
  });

  it("supports string literal values", () => {
    const stringSource = `const text = <button onClick="tap"></button>;`;
    const stringAst = parser.parse(stringSource, { sourceType: "module" });
    const { code: stringCode } = transformFromAstSync(stringAst, stringSource, {
      configFile: false,
      babelrc: false,
      plugins: [plugin],
    });

    assert.match(stringCode, /@click=\{"tap"\}/);
  });

  it("leaves lowercase DOM-style listener attributes untouched", () => {
    const source = `const view = <button onclick={handleClick}></button>;`;
    const ast = parser.parse(source, { sourceType: "module" });

    const { code } = transformFromAstSync(ast, source, {
      configFile: false,
      babelrc: false,
      plugins: [plugin],
    });

    assert.match(code, /onclick=\{handleClick\}/);
    assert.doesNotMatch(code, /@click/);
  });

  it("keeps alias candidates untouched when lowercase normalization is disabled", () => {
    const source = `const view = <button onDoubleClick={handler}></button>;`;
    const ast = parser.parse(source, { sourceType: "module" });

    const { code } = transformFromAstSync(ast, source, {
      configFile: false,
      babelrc: false,
      plugins: [[plugin, { lowercaseEventNames: false }]],
    });

    assert.match(code, /@DoubleClick=\{handler\}/);
    assert.doesNotMatch(code, /@dblclick/);
  });

  it("rewrites capture listeners inside tagged templates", () => {
    const source = `const view = <button onFocusCapture={handleFocus}></button>;`;
    const ast = parser.parse(source, { sourceType: "module" });

    const { code } = transformFromAstSync(ast, source, {
      configFile: false,
      babelrc: false,
      plugins: [templatePlugin, plugin],
    });

    assert.match(
      code,
      /@focusin=\$\{\{\s*handleEvent: handleFocus,\s*capture: true\s*\}\}/
    );
  });

  it("rewrites aliased event names inside tagged templates", () => {
    const source = `const view = <button onDoubleClick={onDbl} onBlur={onBlur}></button>;`;
    const ast = parser.parse(source, { sourceType: "module" });

    const { code } = transformFromAstSync(ast, source, {
      configFile: false,
      babelrc: false,
      plugins: [templatePlugin, plugin],
    });

    assert.match(code, /@dblclick=\$\{onDbl\}/);
    assert.match(
      code,
      /@focusout=\$\{\{\s*handleEvent: onBlur,\s*capture: true\s*\}\}/
    );
  });

  it("leaves non-React template event names untouched", () => {
    const source = "const view = html`<button onclick=${handleClick}></button>`;";
    const ast = parser.parse(source, { sourceType: "module" });

    const { code } = transformFromAstSync(ast, source, {
      configFile: false,
      babelrc: false,
      plugins: [plugin],
    });

    assert.match(code, /onclick=\$\{handleClick\}/);
    assert.doesNotMatch(code, /@click/);
  });

  it("leaves namespaced JSX attributes untouched", () => {
    const source = `const view = <button svg:onClick={handler}></button>;`;
    const ast = parser.parse(source, { sourceType: "module", plugins: ["jsx"] });

    const { code } = transformFromAstSync(ast, source, {
      configFile: false,
      babelrc: false,
      plugins: [plugin],
    });

    assert.match(code, /svg:onClick=\{handler\}/);
    assert.doesNotMatch(code, /@click/);
  });

  it("preserves existing object listeners when adding capture metadata", () => {
    const source = `const view = <button onBlurCapture={{ handleEvent: handler, passive: true }}></button>;`;
    const ast = parser.parse(source, { sourceType: "module" });

    const { code } = transformFromAstSync(ast, source, {
      configFile: false,
      babelrc: false,
      plugins: [plugin],
    });

    assert.match(
      code,
      /@focusout=\{\{\s*handleEvent: handler,\s*passive: true,\s*capture: true\s*\}\}/
    );
  });

  it("ignores JSX spread attributes and malformed template tails", () => {
    const spreadSource = `const view = <button {...props} onClick={handler}></button>;`;
    const spreadAst = parser.parse(spreadSource, { sourceType: "module" });

    const { code: spreadCode } = transformFromAstSync(spreadAst, spreadSource, {
      configFile: false,
      babelrc: false,
      plugins: [plugin],
    });

    assert.match(spreadCode, /\{\.\.\.props\}/);
    assert.match(spreadCode, /@click=\{handler\}/);

    const templateSource = "const view = html`<button onClick=${handleClick}`;";
    const templateAst = parser.parse(templateSource, { sourceType: "module" });
    const quasi = templateAst.program.body[0].declarations[0].init.quasi;
    quasi.quasis.pop();

    const { code: templateCode } = transformFromAstSync(templateAst, templateSource, {
      configFile: false,
      babelrc: false,
      plugins: [plugin],
    });

    assert.match(templateCode, /onClick=/);
    assert.doesNotMatch(templateCode, /@click/);
  });
});
