import assert from "assert";
import babelCore from "@babel/core";
import { TraceMap, originalPositionFor } from "@jridgewell/trace-mapping";
import parser, {
  getLitsxVirtualizationMetadata,
} from "./helpers/litsx-parser.js";
import { beforeAll } from 'vitest';
import { interopDefault } from "./helpers/interop-default.js";

const { transformFromAstSync } = babelCore;
let plugin;
let createTaggedTemplate;
let buildTemplate;
let patchLitAttributeSourcemap;

function positionFromIndex(text, index) {
  let line = 1;
  let column = 0;

  for (let cursor = 0; cursor < index; cursor += 1) {
    if (text[cursor] === "\n") {
      line += 1;
      column = 0;
      continue;
    }

    column += 1;
  }

  return { line, column };
}

function findPosition(text, needle) {
  const index = text.indexOf(needle);
  assert.notStrictEqual(index, -1, `expected to find "${needle}"`);
  return positionFromIndex(text, index);
}

beforeAll(async () => {
  const [pluginMod, templateMod] = await Promise.all([
    import("../packages/babel-plugin-transform-jsx-html-template/src/index.js"),
    import("../packages/babel-plugin-transform-jsx-html-template/src/template.js"),
  ]);
  plugin = interopDefault(pluginMod);
  ({ createTaggedTemplate, buildTemplate } = templateMod);
  ({ patchLitAttributeSourcemap } = pluginMod);
});

describe("@litsx/babel-plugin-transform-jsx-html-template", () => {

  it("emits lit-html templates", () => {
    const source = `const view = <button .label={text}>{count}</button>;`;

    const ast = parser.parse(source, { sourceType: "module" });
    const { code } = transformFromAstSync(ast, source, {
      configFile: false,
      babelrc: false,
      plugins: [plugin],
    });

    assert.match(code, /import\s+{\s*html\s*}\s+from\s+['"]lit['"];?/);
    assert.match(code, /const view = html`/);
    assert.match(code, /<button .label=\$\{text\}>/);
    assert.match(code, /\$\{count\}/);
  });

  it("keeps Lit-style listener attributes intact", () => {
    const source = `const view = <button @click={handleClick}></button>;`;

    const ast = parser.parse(source, { sourceType: "module" });
    const { code } = transformFromAstSync(ast, source, {
      configFile: false,
      babelrc: false,
      plugins: [plugin],
    });

    assert.match(code, /import\s+{\s*html\s*}\s+from\s+['"]lit['"];?/);
    assert.match(code, /@click=\$\{handleClick\}/);
  });

  it("keeps later lit-style attributes aligned in sourcemaps", () => {
    const source = `const view = <button @click={save} .value={name} ?disabled={busy}></button>;`;

    const ast = parser.parse(source, {
      sourceType: "module",
      sourceFileName: "/virtual/view.tsx",
    });
    const virtualization = getLitsxVirtualizationMetadata(ast);

    const result = transformFromAstSync(ast, source, {
      configFile: false,
      babelrc: false,
      sourceFileName: "/virtual/view.tsx",
      inputSourceMap: virtualization?.map ?? undefined,
      sourceMaps: true,
      plugins: [plugin],
    });
    const code = result.code;
    const map = patchLitAttributeSourcemap(
      result.code,
      result.map,
      result.metadata?.litsxTemplateAttributeMappings || []
    );

    const traceMap = new TraceMap(map);

    for (const needle of [".value", "?disabled"]) {
      const generated = findPosition(code, needle);
      const expected = findPosition(source, needle);
      const actual = originalPositionFor(traceMap, generated);

      assert.strictEqual(actual.source, "/virtual/view.tsx");
      assert.strictEqual(actual.line, expected.line);
      assert.strictEqual(actual.column, expected.column);
    }
  });

  it("leaves React-style listener syntax untouched", () => {
    const source = `const view = <button onClick={handleClick}></button>;`;

    const ast = parser.parse(source, { sourceType: "module" });
    const { code } = transformFromAstSync(ast, source, {
      configFile: false,
      babelrc: false,
      plugins: [plugin],
    });

    assert.match(code, /onClick=\"\$\{handleClick\}\"/);
  });

  it("handles nested nodes and boolean attributes", () => {
    const source = `
      const view = (
        <section class="dashboard">
          <button ?disabled={isDisabled} .label={label}>
            {greeting}
            {items.map((item) => (
              <span class="item" key={item.id}>
                <strong>{item.label}</strong>
              </span>
            ))}
          </button>
        </section>
      );
    `;

    const ast = parser.parse(source, { sourceType: "module" });
    const { code } = transformFromAstSync(ast, source, {
      configFile: false,
      babelrc: false,
      plugins: [plugin],
    });

    assert.match(code, /import\s+{\s*html\s*}\s+from\s+['"]lit['"];?/);
    assert.match(code, /html`<section class="dashboard">/);
    assert.match(code, /<button \?disabled=\$\{isDisabled\} \.label=\$\{label\}>/);
    assert.match(code, /\$\{items\.map/);
    assert.match(code, /<strong>\$\{item\.label\}<\/strong>/);
  });

  it("renders capitalized components as HTML elements", () => {
    const source = `const view = <FancyButton foo="bar" baz={value} />;`;
    const ast = parser.parse(source, { sourceType: "module" });
    const { code } = transformFromAstSync(ast, source, {
      configFile: false,
      babelrc: false,
      plugins: [plugin],
    });

    assert.match(code, /import\s+{\s*html\s*}\s+from\s+['"]lit['"];?/);
    assert.match(code, /<fancy-button/);
    assert.match(code, /foo="bar"/);
    assert.match(code, /\.baz=\$\{value\}/);
    assert.match(code, /<\/fancy-button>`/);
  });

  it("supports bare boolean attributes without values", () => {
    const source = `const view = <button disabled></button>;`;
    const ast = parser.parse(source, { sourceType: "module" });
    const { code } = transformFromAstSync(ast, source, {
      configFile: false,
      babelrc: false,
      plugins: [plugin],
    });

    assert.match(code, /<button disabled>/);
    assert.doesNotMatch(code, /disabled="\$\{true\}"/);
  });

  it("does not self-close non-void HTML elements", () => {
    const source = `const view = <div class="host" />;`;
    const ast = parser.parse(source, { sourceType: "module" });
    const { code } = transformFromAstSync(ast, source, {
      configFile: false,
      babelrc: false,
      plugins: [plugin],
    });

    assert.match(code, /<div class="host"><\/div>/);
    assert.doesNotMatch(code, /<div class="host" \/>/);
  });

  it("does not self-close iframe elements", () => {
    const source = `const view = <iframe srcdoc={doc} sandbox="allow-scripts" />;`;
    const ast = parser.parse(source, { sourceType: "module" });
    const { code } = transformFromAstSync(ast, source, {
      configFile: false,
      babelrc: false,
      plugins: [plugin],
    });

    assert.match(code, /<iframe srcdoc="\$\{doc\}" sandbox="allow-scripts"><\/iframe>/);
  });

  it("keeps opening and closing tags aligned for kebab-case custom elements with attributes", () => {
    const source = `
      const view = (
        <suspense-boundary fallback={<span>loading</span>}>
          <span>ready</span>
        </suspense-boundary>
      );
    `;

    const ast = parser.parse(source, { sourceType: "module" });
    const { code } = transformFromAstSync(ast, source, {
      configFile: false,
      babelrc: false,
      plugins: [plugin],
    });

    assert.match(
      code,
      /html`<suspense-boundary fallback="\$\{html`<span>loading<\/span>`\}"><span>ready<\/span><\/suspense-boundary>`/
    );
  });

  it("keeps Lit-style prefixed attributes on kebab-case custom elements", () => {
    const source = `
      const view = (
        <suspense-boundary .contentRenderer={() => <span>ready</span>} @resolve={handleResolve} ?pending={isPending}>
          <span>fallback</span>
        </suspense-boundary>
      );
    `;

    const ast = parser.parse(source, { sourceType: "module" });
    const { code } = transformFromAstSync(ast, source, {
      configFile: false,
      babelrc: false,
      plugins: [plugin],
    });

    assert.match(
      code,
      /<suspense-boundary \.contentRenderer=\$\{\(\) => html`<span>ready<\/span>`\} @resolve=\$\{handleResolve\} \?pending=\$\{isPending\}>/
    );
    assert.match(code, /<\/suspense-boundary>`/);
  });

  it("trims whitespace around text nodes in templates", () => {
    const source = `const view = <div>\n      hello\n    </div>;`;
    const ast = parser.parse(source, { sourceType: "module" });
    const { code } = transformFromAstSync(ast, source, {
      configFile: false,
      babelrc: false,
      plugins: [plugin],
    });

    assert.match(code, /<div>hello<\/div>/);
  });

  it("transforms namespaced component tags", () => {
    const source = `const view = <x:custom foo={value} />;`;
    const ast = parser.parse(source, { sourceType: "module" });
    const { code } = transformFromAstSync(ast, source, {
      configFile: false,
      babelrc: false,
      plugins: [plugin],
    });

    assert.match(code, /x\.custom\(/);
    assert.match(code, /foo:\s*value/);
  });

  it("ignores empty JSX expression containers", () => {
    const source = `const view = <div>{}</div>;`;
    const ast = parser.parse(source, { sourceType: "module" });
    const { code } = transformFromAstSync(ast, source, {
      configFile: false,
      babelrc: false,
      plugins: [plugin],
    });

    assert.match(code, /<div><\/div>/);
  });

  it("transforms JSX in nested functions", () => {
    const source = `
      const createFactory = () => {
        const render = () => {
          const inline = () => <span>{value}</span>;
          return inline;
        };
        return render();
      };
    `;

    const ast = parser.parse(source, { sourceType: "module" });
    const { code } = transformFromAstSync(ast, source, {
      configFile: false,
      babelrc: false,
      plugins: [plugin],
    });

    assert.match(code, /import\s+{\s*html\s*}\s+from\s+['"]lit['"];?/);
    assert.match(code, /html`<span>\$\{value\}<\/span>`/);
  });

  it("throws on unsupported spread attributes", () => {
    const source = `const x = <div {...rest}></div>;`;
    const ast = parser.parse(source, { sourceType: "module" });

    assert.throws(() => {
      transformFromAstSync(ast, source, {
        configFile: false,
        babelrc: false,
        plugins: [plugin],
      });
    }, /JSXSpreadAttribute is not supported/);
  });

  it("throws on spread children", () => {
    const source = `const x = <div>{...items}</div>;`;
    const ast = parser.parse(source, { sourceType: "module" });

    assert.throws(() => {
      transformFromAstSync(ast, source, {
        configFile: false,
        babelrc: false,
        plugins: [plugin],
      });
    }, /JSXSpreadChild is not supported/);
  });

  it("handles fragments without wrapping element", () => {
    const source = `const view = <><span>one</span><span>two</span></>;`;
    const ast = parser.parse(source, { sourceType: "module" });
    const { code } = transformFromAstSync(ast, source, {
      configFile: false,
      babelrc: false,
      plugins: [plugin],
    });

    assert.match(code, /import\s+{\s*html\s*}\s+from\s+['"]lit['"];?/);
    assert.ok(code.includes('html`<span>one</span><span>two</span>`'));
  });

  it("creates bare template literals when tag is disabled", () => {
    const { parseExpression } = parser;

    const jsx = parseExpression("<div>Hello</div>", { plugins: ["jsx"] });
    const literal = createTaggedTemplate(jsx, {}, null);

    assert.strictEqual(literal.type, "TemplateLiteral");
  });

  it("creates bare template literals when the plugin tag option is empty", () => {
    const source = `const view = <div>{label}</div>;`;
    const ast = parser.parse(source, { sourceType: "module" });
    const { code } = transformFromAstSync(ast, source, {
      configFile: false,
      babelrc: false,
      plugins: [[plugin, { tag: "" }]],
    });

    assert.doesNotMatch(code, /import\s+{\s*html\s*}\s+from\s+['"]lit['"]/);
    assert.match(code, /const view = `<div>\$\{label\}<\/div>`;/);
  });

  it("adds a custom tagged import next to existing lit imports", () => {
    const source = [
      'import { LitElement } from "lit";',
      'const view = <div>{label}</div>;',
    ].join("\n");

    const ast = parser.parse(source, { sourceType: "module" });
    const { code } = transformFromAstSync(ast, source, {
      configFile: false,
      babelrc: false,
      plugins: [[plugin, { tag: "svg" }]],
    });

    assert.match(code, /import \{ LitElement, svg \} from "lit";/);
    assert.match(code, /const view = svg`<div>\$\{label\}<\/div>`;/);
  });

  it("does not duplicate an existing custom tagged import from lit", () => {
    const source = [
      'import { LitElement, svg } from "lit";',
      'const view = <div>{label}</div>;',
    ].join("\n");

    const ast = parser.parse(source, { sourceType: "module" });
    const { code } = transformFromAstSync(ast, source, {
      configFile: false,
      babelrc: false,
      plugins: [[plugin, { tag: "svg" }]],
    });

    assert.strictEqual((code.match(/import \{ LitElement, svg \} from "lit";/g) || []).length, 1);
    assert.match(code, /const view = svg`<div>\$\{label\}<\/div>`;/);
  });

  it("adds a separate tagged import when lit is imported as a namespace", () => {
    const source = [
      'import * as lit from "lit";',
      'const view = <div>{label}</div>;',
    ].join("\n");

    const ast = parser.parse(source, { sourceType: "module" });
    const { code } = transformFromAstSync(ast, source, {
      configFile: false,
      babelrc: false,
      plugins: [[plugin, { tag: "svg" }]],
    });

    assert.match(code, /import \* as lit from "lit";/);
    assert.match(code, /import \{ svg \} from "lit";/);
    assert.match(code, /const view = svg`<div>\$\{label\}<\/div>`;/);
  });

  it("ignores lit attribute sourcemap metadata whose generated needle is missing", () => {
    const inputMap = {
      version: 3,
      file: "view.js",
      sources: ["/virtual/view.tsx"],
      sourcesContent: ["const view = <button />;"],
      names: [],
      mappings: "AAAA",
    };

    const patched = patchLitAttributeSourcemap("const view = html``;", inputMap, [{
      source: "/virtual/view.tsx",
      line: 1,
      column: 13,
      generatedNeedle: ".value",
      generatedOffset: 0,
    }]);

    assert.deepStrictEqual(patched.sources, inputMap.sources);
    assert.deepStrictEqual(patched.sourcesContent, inputMap.sourcesContent);
    assert.strictEqual(patched.file, inputMap.file);
  });

  it("creates component calls for namespaced components and spread props", () => {
    const expr = parser.parseExpression("<x:button {...props} data-id=\"cta\" disabled />", {
      plugins: ["jsx"],
    });
    const template = buildTemplate(expr, {});

    assert.strictEqual(template.type, "TemplateLiteral");
    assert.strictEqual(template.expressions.length, 1);

    const call = template.expressions[0];
    assert.strictEqual(call.callee.type, "MemberExpression");
    assert.strictEqual(call.callee.object.name, "x");
    assert.strictEqual(call.callee.property.name, "button");

    const [attributes] = call.arguments;
    assert.strictEqual(attributes.type, "ObjectExpression");
    assert.strictEqual(attributes.properties[0].type, "SpreadElement");

    const dataIdProp = attributes.properties.find(
      (prop) => prop.type === "ObjectProperty" && prop.key.value === "data-id"
    );
    assert(dataIdProp, "expected invalid identifiers to become string keys");

    const disabledProp = attributes.properties.find(
      (prop) => prop.type === "ObjectProperty" && prop.key.name === "disabled"
    );
    assert.strictEqual(disabledProp.value.value, true);
  });

});
