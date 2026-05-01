import assert from "assert";
import { describe, it } from "vitest";
import * as prettier from "prettier";

import plugin from "../packages/prettier-plugin-litsx/src/index.js";

async function formatWith(parser, source) {
  return prettier.format(source, {
    parser,
    plugins: [plugin],
    semi: true,
    singleQuote: false,
    trailingComma: "all",
    tabWidth: 2,
  });
}

async function formatWithOptions(parser, source, extraOptions = {}) {
  return prettier.format(source, {
    parser,
    plugins: [plugin],
    semi: true,
    singleQuote: false,
    trailingComma: "all",
    tabWidth: 2,
    ...extraOptions,
  });
}

describe("prettier-plugin-litsx", () => {
  it("formats .litsx authored bindings and static hoists without virtual names", async () => {
    const source = `export const App=({title}:{title:string})=>{^properties({open:{type:Boolean}});return <button class="cta" @click={()=>{}} .value={title} ?disabled={false}>{title}</button>;};`;

    const formatted = await formatWith("litsx", source);

    assert.match(formatted, /export const App = \(\{ title \}: \{ title: string \}\) => \{/);
    assert.match(formatted, /\^properties\(\{ open: \{ type: Boolean \} \}\);/);
    assert.match(formatted, /@click=\{\(\) => \{\}\}/);
    assert.match(formatted, /\.value=\{title\}/);
    assert.match(formatted, /\?disabled=\{false\}/);
    assert.doesNotMatch(formatted, /__litsx_/);
  });

  it("formats ^styles static templates as CSS in .litsx files", async () => {
    const source = `export const App=()=>{^styles(\`:host{display:block;color:red;}button,.cta{margin:0 auto;padding:12px 18px;}\`);return <button class="cta" />;};`;

    const formatted = await formatWith("litsx", source);

    assert.match(formatted, /\^styles\(`\n/);
    assert.match(formatted, /display: block;/);
    assert.match(formatted, /color: red;/);
    assert.match(formatted, /margin: 0 auto;/);
    assert.match(formatted, /padding: 12px 18px;/);
  });

  it("formats empty and multiline ^styles templates with tab indentation when requested", async () => {
    const source = `export const App = () => {
\t^styles(\`
.card{display:block;}

button{padding:4px;}
\t\`);
\t^styles(\`\`);
\treturn <button />;
};
`;

    const formatted = await formatWithOptions("litsx", source, {
      useTabs: true,
    });

    assert.match(formatted, /\^styles\(`\n\t\t\.card \{/);
    assert.match(formatted, /\n\t\tbutton \{/);
    assert.match(formatted, /\n\t\t\}\n\t`\);/);
    assert.match(formatted, /\^styles\(``\);/);
  });

  it("preserves interpolated ^styles templates without crashing", async () => {
    const source = `export const App=({color}:{color:string})=>{^styles(\`:host{color:\${color};display:block;}\`);return <button />;};`;

    const formatted = await formatWith("litsx", source);

    assert.match(formatted, /\^styles\(`:host\{color:\$\{color\};display:block;\}`\);/);
    assert.match(formatted, /\$\{color\}/);
  });

  it("formats .litsx.jsx sources without TypeScript syntax", async () => {
    const source = `export const App=({title})=>{return <button @click={()=>{}} .value={title} ?disabled={false}>{title}</button>;};`;

    const formatted = await formatWith("litsx-jsx", source);

    assert.match(formatted, /export const App = \(\{ title \}\) => \{/);
    assert.match(formatted, /@click=\{\(\) => \{\}\}/);
    assert.doesNotMatch(formatted, /: string/);
  });

  it("is idempotent for already formatted authored source", async () => {
    const source = `export const App = ({ title }: { title: string }) => {\n  ^styles(\`\n    :host {\n      display: block;\n    }\n  \`);\n  return <button @click={() => {}} .value={title}>{title}</button>;\n};\n`;

    const once = await formatWith("litsx", source);
    const twice = await formatWith("litsx", once);

    assert.strictEqual(once, twice);
  });

  it("surfaces parser errors clearly", async () => {
    await assert.rejects(
      () => formatWith("litsx", `export const App = () => <button @click={() => } />;`),
      /Unexpected token|Unexpected/,
    );
  });

  it("exposes an async root embed printer for LitSX documents", async () => {
    const parserInstance = plugin.parsers.litsx;
    const printer = plugin.printers[parserInstance.astFormat];
    const ast = parserInstance.parse(
      "export const App=()=>{^styles(`:host{display:block;}`);return <button />;};",
      { filepath: "/virtual/App.litsx" },
    );
    const embed = printer.embed({ node: ast }, {
      parser: "litsx",
      plugins: [plugin],
      semi: true,
      tabWidth: 2,
      useTabs: false,
    });

    assert.strictEqual(typeof embed, "function");
    const formatted = await embed();
    assert.match(formatted, /export const App = \(\) => \{/);
    assert.match(formatted, /display: block;/);
  });

  it("exposes a single root parser and printer for the authored ast surface", () => {
    const parserInstance = plugin.parsers.litsx;
    const printer = plugin.printers[parserInstance.astFormat];
    const ast = parserInstance.parse("export const App = () => <button />;", {
      filepath: "/virtual/App.litsx",
    });

    assert.strictEqual(ast.type, "LitsxDocument");
    assert.strictEqual(parserInstance.locStart(ast), 0);
    assert.strictEqual(parserInstance.locEnd(ast), ast.end);
    assert.deepStrictEqual(printer.getVisitorKeys(ast), []);
    assert.strictEqual(printer.getVisitorKeys({ type: "OtherNode" }), undefined);
    assert.strictEqual(printer.canAttachComment(ast), false);
    assert.strictEqual(printer.embed({ node: { type: "OtherNode" } }, {}), null);
  });

  it("does not claim plain tsx or jsx file extensions", () => {
    const extensions = plugin.languages.flatMap((language) => language.extensions ?? []);

    assert.ok(extensions.includes(".litsx"));
    assert.ok(extensions.includes(".litsx.jsx"));
    assert.ok(!extensions.includes(".tsx"));
    assert.ok(!extensions.includes(".jsx"));
  });
});
