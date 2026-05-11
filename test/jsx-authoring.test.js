import assert from "assert";
import { describe, it } from "vitest";

import {
  applyVirtualAttributeReplacements,
  createVirtualLitsxJsxSourceMap,
  createVirtualLitsxJsxSource,
  encodeVirtualAttributeName,
  decodeVirtualAttributeName,
  decodeVirtualStaticHoistName,
  looksLikeLitsxJsx,
  mapOriginalPositionToVirtual,
  mapVirtualPositionToOriginal,
  remapVirtualText,
  remapTextSpanToOriginal,
} from "../packages/jsx-authoring/src/index.js";
import {
  getLitsxVirtualizationMetadata,
  parseWithLitsxVirtualization,
} from "../packages/jsx-authoring/src/parser.js";

describe("@litsx/jsx-authoring", () => {
  it("virtualizes lit-flavoured jsx attribute prefixes into ts-safe names", () => {
    const source = `
      const view = (
        <button .value={state.value} @click={handleClick} ?disabled={busy}></button>
      );
    `;

    const result = createVirtualLitsxJsxSource(source);

    assert.match(result.code, /__litsx_prop_value/);
    assert.match(result.code, /__litsx_event_click/);
    assert.match(result.code, /__litsx_bool_disabled/);
    assert.deepStrictEqual(
      result.replacements.map((entry) => entry.originalName),
      [".value", "@click", "?disabled"],
    );
  });

  it("supports tsx sources through the litsx parser", () => {
    const source = `
      const view = <input .value={value as string} @input={handleInput} ?disabled={locked} />;
    `;

    const result = createVirtualLitsxJsxSource(source, {
      plugins: ["typescript"],
    });

    assert.match(result.code, /__litsx_prop_value/);
    assert.match(result.code, /__litsx_event_input/);
    assert.match(result.code, /__litsx_bool_disabled/);
  });

  it("virtualizes lit-flavoured attributes inside nested JSX returned from attribute expressions", () => {
    const source = `
      const view = (
        <Boundary
          .fallbackRenderer={() => (
            <button @click={handleClick} .value={value} ?disabled={busy}></button>
          )}
        />
      );
    `;

    const result = createVirtualLitsxJsxSource(source);

    assert.match(result.code, /__litsx_prop_fallbackRenderer/);
    assert.match(result.code, /__litsx_event_click/);
    assert.match(result.code, /__litsx_prop_value/);
    assert.match(result.code, /__litsx_bool_disabled/);
  });

  it("virtualizes mixed authored attributes across single-line and multi-line tags without touching standard attrs", () => {
    const source = `
      const view = (
        <section class="shell" data-kind="demo">
          <input .value={value} placeholder="Search" @input={handleInput} ?disabled={locked} />
          <button
            id="primary-action"
            class="cta"
            aria-label="Save item"
            .title={title}
            @click={() => save(value)}
            ?disabled={busy}
          >
            Save
          </button>
        </section>
      );
    `;

    const result = createVirtualLitsxJsxSource(source);

    assert.match(result.code, /class="shell"/);
    assert.match(result.code, /data-kind="demo"/);
    assert.match(result.code, /placeholder="Search"/);
    assert.match(result.code, /aria-label="Save item"/);
    assert.match(result.code, /__litsx_prop_value=\{value\}/);
    assert.match(result.code, /__litsx_event_input=\{handleInput\}/);
    assert.match(result.code, /__litsx_bool_disabled=\{locked\}/);
    assert.match(result.code, /__litsx_prop_title=\{title\}/);
    assert.match(result.code, /__litsx_event_click=\{\(\) => save\(value\)\}/);
    assert.match(result.code, /__litsx_bool_disabled=\{busy\}/);
    assert.deepStrictEqual(
      result.replacements.map((entry) => entry.originalName),
      [".value", "@input", "?disabled", ".title", "@click", "?disabled"],
    );
  });

  it("virtualizes authored attrs on sibling JSX tags that appear after text nodes", () => {
    const source = `
      const view = (
        <div class="stack">
          Public change event
          <button
            @click={() => {
              setCount((value) => value + 1);
            }}
            class="trigger"
          >
            Increment
          </button>
          <span .title={tooltip}>{label}</span>
        </div>
      );
    `;

    const result = createVirtualLitsxJsxSource(source, {
      strategy: "editor",
    });

    assert.match(result.code, /<button[\s\S]*eclick=\{\(\) => \{/);
    assert.match(result.code, /class="trigger"/);
    assert.match(result.code, /<span ptitle=\{tooltip\}>\{label\}<\/span>/);
    assert.strictEqual(result.code.length, source.length);
  });

  it("supports an editor-oriented virtualization strategy for JSX parsing", () => {
    const source = `
      const view = <input .value={value} @input={handleInput} ?disabled={locked} />;
    `;

    const result = createVirtualLitsxJsxSource(source, {
      strategy: "editor",
    });

    assert.match(result.code, /pvalue/);
    assert.match(result.code, /einput/);
    assert.match(result.code, /bdisabled/);
    assert.strictEqual(result.code.length, source.length);
    assert.deepStrictEqual(
      result.replacements.map((entry) => entry.originalName),
      [".value", "@input", "?disabled"],
    );
  });

  it("keeps editor-oriented static hoists length-stable for source parsing", () => {
    const source = `
      export function Card() {
        static properties = { active: { reflect: true } };
        static styles = \`:host { display: block; }\`;
        return <button @click={handleClick}>ready</button>;
      }
    `;

    const result = createVirtualLitsxJsxSource(source, {
      strategy: "editor",
    });

    assert.match(result.code, /const \$properties = \{/);
    assert.match(result.code, /const \$styles = `/);
    assert.match(result.code, /eclick/);
    assert.strictEqual(result.code.length, source.length);
  });

  it("virtualizes static hoist assignments into internal compiler calls", () => {
    const source = `
      export function Card() {
        static properties = { active: { reflect: true } };
        static styles = \`:host { display: block; }\`;
        return <div />;
      }
    `;

    const result = createVirtualLitsxJsxSource(source, {
      plugins: ["typescript"],
    });

    assert.match(result.code, /__litsx_static_properties\(\{ active: \{ reflect: true \} \}\);/);
    assert.match(result.code, /__litsx_static_styles\(`:host \{ display: block; \}`\);/);
  });

  it("does not rewrite valid class static fields while still virtualizing authored function hoists", () => {
    const source = `
      class ExistingElement extends LitElement {
        static properties = { active: { type: Boolean } };
        static styles = css\`:host { display: block; }\`;
        static analyticsTag = "existing";
      }

      export function Card() {
        static properties = { open: { reflect: true } };
        static styles = \`:host { color: red; }\`;
        static analyticsTag = "card";
        return <div />;
      }
    `;

    const result = createVirtualLitsxJsxSource(source, {
      plugins: ["typescript"],
    });

    assert.match(result.code, /class ExistingElement extends LitElement \{/);
    assert.match(result.code, /static properties = \{\s*active: \{\s*type: Boolean\s*\}\s*\};/);
    assert.match(result.code, /static styles = css`:host \{ display: block; \}`;/);
    assert.match(result.code, /static analyticsTag = "existing";/);
    assert.match(result.code, /__litsx_static_properties\(\{ open: \{ reflect: true \} \}\);/);
    assert.match(result.code, /__litsx_static_styles\(`:host \{ color: red; \}`\);/);
    assert.match(result.code, /__litsx_static_analyticsTag\("card"\);/);
  });

  it("keeps class static fields untouched in editor mode", () => {
    const source = `
      class ExistingElement extends LitElement {
        static properties = { active: { type: Boolean } };
        static styles = css\`:host { display: block; }\`;
        static customThing = buildThing();
      }
    `;

    const result = createVirtualLitsxJsxSource(source, {
      strategy: "editor",
      plugins: ["typescript"],
    });

    assert.equal(result.code, source);
    assert.deepStrictEqual(result.replacements, []);
  });

  it("does not virtualize removed authored mixin syntax", () => {
    const source = `
      mixin Selectable() {
        static styles = \`:host { display: block; }\`;
        return <div />;
      }
    `;

    const result = createVirtualLitsxJsxSource(source, {
      plugins: ["typescript"],
    });

    assert.match(result.code, /\bmixin Selectable\(\)/);
    assert.doesNotMatch(result.code, /__litsx_mixin/);
    assert.match(result.code, /__litsx_static_styles/);
  });

  it("virtualizes hoist-only authored sources that use the current static syntax", () => {
    const source = `
      export function Card() {
        static properties = { active: { reflect: true } };
        static styles = \`:host { display: block; }\`;
      }
    `;

    const result = createVirtualLitsxJsxSource(source, {
      plugins: ["typescript"],
    });

    assert.match(result.code, /__litsx_static_properties\(\{ active: \{ reflect: true \} \}\);/);
    assert.match(result.code, /__litsx_static_styles\(`:host \{ display: block; \}`\);/);
  });

  it("does not rewrite lit-like string keys inside spread expressions", () => {
    const source = `
      const view = <button {...{ "@click": handleClick, ".value": value, "?disabled": busy }} />;
    `;

    const result = createVirtualLitsxJsxSource(source, {
      plugins: ["typescript"],
    });

    assert.doesNotMatch(result.code, /__litsx_event_click/);
    assert.doesNotMatch(result.code, /__litsx_prop_value/);
    assert.doesNotMatch(result.code, /__litsx_bool_disabled/);
    assert.match(result.code, /"@click": handleClick/);
  });

  it("scans balanced authored expressions with strings, templates, and comments inside braces", () => {
    const source = `
      const view = (
        <button
          @click={{
            run: () => {
              const a = 'single quote';
              const b = "double quote";
              const c = \`template \${value}\`;
              // line comment
              /* block comment */
              return { a, b, c };
            },
          }}
        />
      );
    `;

    const result = createVirtualLitsxJsxSource(source, {
      plugins: ["typescript"],
    });

    assert.match(result.code, /__litsx_event_click/);
    assert.match(result.code, /single quote/);
    assert.match(result.code, /double quote/);
    assert.match(result.code, /template/);
  });

  it("marks compiler collisions when source already contains reserved virtual names", () => {
    const source = `const view = <button __litsx_event_click={handler} />;`;
    const result = createVirtualLitsxJsxSource(source);

    assert.equal(result.code, source);
    assert.equal(result.collision, true);
    assert.deepStrictEqual(result.replacements, []);
  });

  it("generates source maps and remaps virtual positions through multiple replacements", () => {
    const source = `
      const view = <button @click={handleClick} .value={value} ?disabled={busy}></button>;
    `;
    const result = createVirtualLitsxJsxSource(source, {
      sourceMap: true,
      sourceFileName: "/virtual/example.tsx",
    });
    const virtualValueStart = result.code.indexOf("__litsx_prop_value");

    assert.ok(result.map);
    assert.equal(result.map.sources[0], "/virtual/example.tsx");
    assert.equal(
      mapVirtualPositionToOriginal(virtualValueStart, result.replacements),
      source.indexOf(".value"),
    );
  });

  it("handles empty and unchanged sources without producing replacements", () => {
    assert.deepStrictEqual(createVirtualLitsxJsxSource(null), {
      code: null,
      map: null,
      replacements: [],
    });

    const plainSource = `const view = <button class="cta">Save</button>;`;
    const unchanged = createVirtualLitsxJsxSource(plainSource);
    assert.equal(unchanged.code, plainSource);
    assert.deepStrictEqual(unchanged.replacements, []);
  });

  it("survives malformed authored snippets and still remaps exported helpers sensibly", () => {
    const source = `
      const broken = <button @click={(() => {
        const text = \`unterminated \${value}\`;
        /* comment without closing tag handling */
    `;

    const result = createVirtualLitsxJsxSource(source, {
      strategy: "editor",
      sourceMap: true,
    });

    assert.match(result.code, /eclick/);
    assert.equal(typeof result.map?.toString, "function");
    assert.equal(mapOriginalPositionToVirtual(3, []), 3);
    assert.deepStrictEqual(remapTextSpanToOriginal({ start: 1, length: 2 }, []), { start: 1, length: 2 });
  });

  it("covers decode and remap helpers on non-virtual names and overlapping spans", () => {
    const source = `<button @click={handleClick} .value={value} />`;
    const result = createVirtualLitsxJsxSource(source);
    const replacements = result.replacements;
    const clickVirtualStart = result.code.indexOf("__litsx_event_click");

    assert.equal(decodeVirtualAttributeName("not_virtual"), null);
    assert.equal(decodeVirtualStaticHoistName("styles"), null);
    assert.equal(remapVirtualText(42), 42);
    assert.equal(decodeVirtualStaticHoistName("__litsx_static_styles"), "static styles");

    assert.equal(mapOriginalPositionToVirtual(source.indexOf("@click") + 2, replacements), source.indexOf("@click"));
    assert.deepStrictEqual(
      remapTextSpanToOriginal({ start: clickVirtualStart + 1, length: 4 }, replacements),
      { start: source.indexOf("@click"), length: "@click".length },
    );
    assert.deepStrictEqual(
      remapTextSpanToOriginal(
        { start: result.code.indexOf("/>"), length: 2 },
        replacements,
      ),
      { start: source.indexOf("/>"), length: 2 },
    );

    const editable = {
      writes: [],
      overwrite(start, end, text) {
        this.writes.push({ start, end, text });
      },
    };
    applyVirtualAttributeReplacements(editable, replacements);
    assert.equal(editable.writes.length, replacements.length);
  });

  it("covers remap helpers before the first replacement and after earlier virtual spans", () => {
    const replacements = [
      { start: 10, end: 16, replacement: "evt" },
      { start: 30, end: 36, replacement: "prop" },
    ];

    assert.equal(mapOriginalPositionToVirtual(5, replacements), 5);
    assert.deepStrictEqual(
      remapTextSpanToOriginal({ start: 20, length: 2 }, replacements),
      { start: 23, length: 2 },
    );
  });

  it("scans authored attributes with quoted and bare values without breaking virtualization", () => {
    const source = `
      const view = <button @click="handleClick" .value='text' ?disabled=busy data-kind=plain />;
    `;

    const result = createVirtualLitsxJsxSource(source, {
      strategy: "editor",
    });

    assert.match(result.code, /eclick="handleClick"/);
    assert.match(result.code, /pvalue='text'/);
    assert.match(result.code, /bdisabled=busy/);
    assert.match(result.code, /data-kind=plain/);
  });

  it("survives malformed closing tags and stray less-than comparisons around authored JSX", () => {
    const source = `
      const comparison = count < limit ? (
        <section>
          <button @click={handleClick}></button
        </section>
      ) : null;
    `;

    const result = createVirtualLitsxJsxSource(source);

    assert.match(result.code, /count < limit/);
    assert.match(result.code, /__litsx_event_click/);
  });

  it("parses with virtualization metadata and restores authored JSX attribute names", () => {
    const parsed = parseWithLitsxVirtualization(
      (virtualCode) => ({
        type: "File",
        program: {
          type: "Program",
          body: [
            {
              type: "ExpressionStatement",
              start: virtualCode.indexOf("__litsx_event_click"),
              end: virtualCode.indexOf("__litsx_event_click") + "__litsx_event_click".length,
              loc: {
                start: {
                  line: 1,
                  column: virtualCode.indexOf("__litsx_event_click"),
                  index: virtualCode.indexOf("__litsx_event_click"),
                },
                end: {
                  line: 1,
                  column: virtualCode.indexOf("__litsx_event_click") + "__litsx_event_click".length,
                  index: virtualCode.indexOf("__litsx_event_click") + "__litsx_event_click".length,
                },
              },
              expression: {
                type: "JSXAttribute",
                start: virtualCode.indexOf("__litsx_event_click"),
                end: virtualCode.indexOf("__litsx_event_click") + "__litsx_event_click".length,
                loc: {
                  start: {
                    line: 1,
                    column: virtualCode.indexOf("__litsx_event_click"),
                    index: virtualCode.indexOf("__litsx_event_click"),
                  },
                  end: {
                    line: 1,
                    column: virtualCode.indexOf("__litsx_event_click") + "__litsx_event_click".length,
                    index: virtualCode.indexOf("__litsx_event_click") + "__litsx_event_click".length,
                  },
                },
                name: {
                  type: "JSXIdentifier",
                  name: "__litsx_event_click",
                },
              },
            },
          ],
        },
      }),
      `const view = <button @click={handleClick} />;`,
      { sourceFilename: "/virtual/example.tsx", plugins: ["typescript"] },
    );

    const metadata = getLitsxVirtualizationMetadata(parsed);
    assert.ok(metadata);
    assert.match(metadata.code, /__litsx_event_click/);
    assert.equal(parsed.program.body[0].expression.name.name, "@click");
    assert.equal(parsed.program.body[0].start, `const view = <button `.length);
  });

  it("handles parser virtualization fallbacks when no metadata or remapping is needed", () => {
    const ast = parseWithLitsxVirtualization(
      () => ({
        type: "File",
        program: { type: "Program", body: [] },
      }),
      `const value = 1;`,
      { litsxSourceMap: false },
    );

    assert.equal(getLitsxVirtualizationMetadata(null), null);
    assert.equal(getLitsxVirtualizationMetadata(ast).map, null);
    assert.deepStrictEqual(ast.program.body, []);
  });

  it("preserves explicit jsx parser plugins and sourceFileName options in parser virtualization", () => {
    let receivedOptions = null;
    const ast = parseWithLitsxVirtualization(
      (_virtualCode, parserOptions) => {
        receivedOptions = parserOptions;
        return {
          type: "File",
          program: { type: "Program", body: [] },
        };
      },
      `const view = <button @click={handleClick} />;`,
      {
        plugins: [["jsx", { runtime: "automatic" }], "typescript"],
        sourceFileName: "/virtual/explicit.tsx",
      },
    );

    assert.deepStrictEqual(receivedOptions.plugins, [["jsx", { runtime: "automatic" }], "typescript"]);
    assert.equal(getLitsxVirtualizationMetadata(ast).map.sources[0], "/virtual/explicit.tsx");
  });

  it("preserves string jsx plugins and sourceFilename aliases in parser virtualization", () => {
    let receivedOptions = null;
    const ast = parseWithLitsxVirtualization(
      (_virtualCode, parserOptions) => {
        receivedOptions = parserOptions;
        return {
          type: "File",
          program: { type: "Program", body: [] },
        };
      },
      `const view = <button @click={handleClick} />;`,
      {
        plugins: ["jsx", "typescript"],
        sourceFilename: "/virtual/alias.tsx",
      },
    );

    assert.deepStrictEqual(receivedOptions.plugins, ["jsx", "typescript"]);
    assert.equal(getLitsxVirtualizationMetadata(ast).map.sources[0], "/virtual/alias.tsx");
  });

  it("gracefully returns null when the underlying parser returns no AST", () => {
    const ast = parseWithLitsxVirtualization(
      () => null,
      `const view = <button @click={handleClick} />;`,
      { plugins: ["jsx"] },
    );

    assert.equal(ast, null);
  });

  it("virtualizes static hoist assignments after comments and leaves unrelated carets untouched", () => {
    const source = `
      export function Card() {
        // comment before macro
        static properties = { active: { reflect: true } };
        /*
         * block comment before macro
         */
        static styles = \`:host { display: block; }\`;
        const next = count ^ scale;
        return <div />;
      }
    `;

    const result = createVirtualLitsxJsxSource(source, {
      strategy: "editor",
    });

    assert.match(result.code, /const \$properties = \{/);
    assert.match(result.code, /const \$styles = `/);
    assert.match(result.code, /count \^ scale/);
  });

  it("covers helper exports and top-level macro detection edge cases", () => {
    assert.equal(encodeVirtualAttributeName("@click"), "__litsx_event_click");
    assert.equal(encodeVirtualAttributeName(".value"), "__litsx_prop_value");
    assert.equal(encodeVirtualAttributeName("?disabled"), "__litsx_bool_disabled");
    assert.equal(encodeVirtualAttributeName("class"), "class");
    assert.equal(
      remapVirtualText("__litsx_static_styles __litsx_event_click"),
      "static styles @click",
    );

    assert.equal(looksLikeLitsxJsx("  static styles = `:host {}`;"), true);
    assert.equal(looksLikeLitsxJsx("value ^ styles"), false);
  });

  it("virtualizes authored attributes nested inside comments, templates, and closures in JSX expressions", () => {
    const source = `
      const view = (
        <Boundary
          .render={() => {
            /* nested template and jsx */
            const template = \`prefix \${value}\`;
            return (
              <button
                @click={() => log(template)}
                ?disabled={busy}
                .title={template}
              />
            );
          }}
        />
      );
    `;

    const result = createVirtualLitsxJsxSource(source, {
      plugins: ["typescript"],
    });

    assert.match(result.code, /__litsx_prop_render/);
    assert.match(result.code, /__litsx_event_click/);
    assert.match(result.code, /__litsx_bool_disabled/);
    assert.match(result.code, /__litsx_prop_title/);
  });

  it("virtualizes attributes on member and namespaced JSX tag names", () => {
    const source = `
      const view = (
        <section>
          <UI.Button @click={handleClick} .value={value} />
          <svg:foreignObject ?hidden={busy} />
        </section>
      );
    `;

    const result = createVirtualLitsxJsxSource(source, {
      plugins: ["typescript"],
    });

    assert.match(result.code, /<UI\.Button __litsx_event_click=\{handleClick\} __litsx_prop_value=\{value\} \/>/);
    assert.match(result.code, /<svg:foreignObject __litsx_bool_hidden=\{busy\} \/>/);
  });

  it("sanitizes editor virtual names with punctuation-heavy authored attribute names", () => {
    const source = `
      const view = <demo-card @my:event={notify} .aria-label={label} ?data-ready={ready} />;
    `;

    const result = createVirtualLitsxJsxSource(source, {
      strategy: "editor",
    });

    assert.match(result.code, /emy_event=\{notify\}/);
    assert.match(result.code, /paria_label=\{label\}/);
    assert.match(result.code, /bdata_ready=\{ready\}/);
    assert.strictEqual(result.code.length, source.length);
  });

  it("ignores JSX-like markers that only appear inside strings, templates, and comments", () => {
    const source = `
      const template = "<button @click={noop}></button>";
      const nested = \`<input .value=\${value} />\`;
      // <dialog ?open={true}></dialog>
      /* <span .title={tooltip}></span> */
      const view = <button class="cta">Save</button>;
    `;

    const result = createVirtualLitsxJsxSource(source, {
      plugins: ["typescript"],
    });

    assert.equal(result.replacements.length, 0);
    assert.equal(result.code, source);
  });

  it("detects LitSX-authored JSX before virtualization", () => {
    assert.strictEqual(looksLikeLitsxJsx(`<button @click={handleClick}></button>`), true);
    assert.strictEqual(looksLikeLitsxJsx(`const view = <button class="cta"></button>;`), false);
    assert.strictEqual(looksLikeLitsxJsx(`function Card(){\n  static styles = \`:host { display: block; }\`;\n}`), true);
    assert.strictEqual(looksLikeLitsxJsx(`function Card(){\n  static properties = {};\n  return null;\n}`), true);
  });

  it("decodes virtual attribute names back to authored syntax", () => {
    assert.strictEqual(decodeVirtualAttributeName("__litsx_event_click"), "@click");
    assert.strictEqual(decodeVirtualAttributeName("__litsx_prop_value"), ".value");
    assert.strictEqual(decodeVirtualAttributeName("__litsx_bool_disabled"), "?disabled");
    assert.strictEqual(decodeVirtualAttributeName("class"), null);
  });

  it("remaps authored attribute names in virtualized text", () => {
    const text = "type Props = { __litsx_event_click: () => void; __litsx_prop_value: string; };";
    assert.strictEqual(
      remapVirtualText(text),
      "type Props = { @click: () => void; .value: string; };",
    );
    assert.strictEqual(remapVirtualText(null), null);
  });

  it("returns non-string and non-authored sources unchanged", () => {
    assert.deepStrictEqual(
      createVirtualLitsxJsxSource(null),
      { code: null, map: null, replacements: [] },
    );
    assert.deepStrictEqual(
      createVirtualLitsxJsxSource("const value = 1;"),
      { code: "const value = 1;", map: null, replacements: [] },
    );
  });

  it("virtualizes bare boolean attributes and nested JSX after comments inside expressions", () => {
    const source = `
      const view = (
        <dialog ?open>
          <button
            @click={() => {
              // nested JSX after a line comment
              /* and after a block comment */
              return <span ?hidden={busy} />;
            }}
          />
        </dialog>
      );
    `;

    const result = createVirtualLitsxJsxSource(source, {
      plugins: ["typescript"],
    });

    assert.match(result.code, /<dialog __litsx_bool_open>/);
    assert.match(result.code, /__litsx_event_click/);
    assert.match(result.code, /<span __litsx_bool_hidden=\{busy\} \/>/);
  });

  it("maps original positions into virtualized replacements", () => {
    const source = `const view = <button @click={handleClick}></button>;`;
    const result = createVirtualLitsxJsxSource(source);
    const originalEventStart = source.indexOf("@click");
    const virtualEventStart = result.code.indexOf("__litsx_event_click");

    assert.strictEqual(
      mapOriginalPositionToVirtual(originalEventStart, result.replacements),
      virtualEventStart,
    );
  });

  it("remaps virtual spans back to authored source spans", () => {
    const source = `const view = <button @click={handleClick}></button>;`;
    const result = createVirtualLitsxJsxSource(source);
    const virtualEventStart = result.code.indexOf("__litsx_event_click");

    assert.deepStrictEqual(
      remapTextSpanToOriginal(
        { start: virtualEventStart, length: "__litsx_event_click".length },
        result.replacements,
      ),
      { start: source.indexOf("@click"), length: "@click".length },
    );
  });

  it("maps positions and spans correctly when replacements are absent or partially overlapped", () => {
    const replacements = [
      {
        start: 10,
        end: 16,
        replacement: "X",
      },
    ];

    assert.strictEqual(mapOriginalPositionToVirtual(4, []), 4);
    assert.strictEqual(mapOriginalPositionToVirtual(12, replacements), 10);
    assert.strictEqual(mapOriginalPositionToVirtual(20, replacements), 15);
    assert.strictEqual(remapTextSpanToOriginal(null, replacements), null);
    assert.deepStrictEqual(
      remapTextSpanToOriginal({ start: 12, length: 2 }, replacements),
      { start: 17, length: 2 },
    );
  });

  it("remaps positions that start inside a virtualized replacement back to the authored token", () => {
    const source = `const view = <button @click={handleClick}></button>;`;
    const result = createVirtualLitsxJsxSource(source);
    const insideVirtualAttribute = result.code.indexOf("__litsx_event_click") + 3;

    assert.strictEqual(
      mapVirtualPositionToOriginal(insideVirtualAttribute, result.replacements),
      source.indexOf("@click"),
    );
    assert.deepStrictEqual(
      remapTextSpanToOriginal(
        { start: insideVirtualAttribute, length: 2 },
        result.replacements,
      ),
      { start: source.indexOf("@click"), length: "@click".length },
    );
  });

  it("remaps spans to the correct authored attribute when multiple replacements share a tag", () => {
    const source = `
      const view = (
        <>
          <input .valuee={count} @focus={() => {}} />
          <button @blur={() => {}} @clcik={() => setCount((v) => v + 1)} />
          <button ?disbled={count > 3} />
        </>
      );
    `;
    const result = createVirtualLitsxJsxSource(source);
    const targets = [".valuee", "@focus", "@clcik", "?disbled"];

    for (const target of targets) {
      const replacement = result.replacements.find((entry) => entry.originalName === target);
      assert.ok(replacement, `Missing replacement for ${target}`);

      const virtualStart = mapOriginalPositionToVirtual(replacement.start, result.replacements);
      const remappedSpan = remapTextSpanToOriginal(
        { start: virtualStart, length: replacement.replacement.length },
        result.replacements,
      );

      assert.deepStrictEqual(
        remappedSpan,
        { start: replacement.start, length: replacement.end - replacement.start },
      );
    }
  });
});
