import assert from "assert";
import { describe, it } from "vitest";

import {
  createVirtualLitsxJsxSourceMap,
  createVirtualLitsxJsxSource,
  decodeVirtualAttributeName,
  looksLikeLitsxJsx,
  mapOriginalPositionToVirtual,
  mapVirtualPositionToOriginal,
  remapVirtualText,
  remapTextSpanToOriginal,
} from "../packages/jsx-authoring/src/index.js";

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
        ^properties({ active: { reflect: true } });
        ^styles(\`:host { display: block; }\`);
        return <button @click={handleClick}>ready</button>;
      }
    `;

    const result = createVirtualLitsxJsxSource(source, {
      strategy: "editor",
    });

    assert.match(result.code, /\$properties\(/);
    assert.match(result.code, /\$styles\(`/);
    assert.match(result.code, /eclick/);
    assert.strictEqual(result.code.length, source.length);
  });

  it("does not virtualize removed authored mixin syntax", () => {
    const source = `
      mixin Selectable() {
        ^styles(\`:host { display: block; }\`);
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

  it("virtualizes static macros after comments and preserves ^mixins", () => {
    const source = `
      export function Card() {
        // comment before macro
        ^properties({ active: { reflect: true } });
        /*
         * block comment before macro
         */
        ^styles(\`:host { display: block; }\`);
        ^mixins(Selectable);
        return <div />;
      }
    `;

    const result = createVirtualLitsxJsxSource(source, {
      strategy: "editor",
    });

    assert.match(result.code, /\$properties\(/);
    assert.match(result.code, /\$styles\(/);
    assert.match(result.code, /\^mixins\(Selectable\)/);
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

  it("detects Litsx-authored JSX before virtualization", () => {
    assert.strictEqual(looksLikeLitsxJsx(`<button @click={handleClick}></button>`), true);
    assert.strictEqual(looksLikeLitsxJsx(`const view = <button class="cta"></button>;`), false);
    assert.strictEqual(looksLikeLitsxJsx(`^styles(\`:host { display: block; }\`);`), true);
    assert.strictEqual(looksLikeLitsxJsx(`function Card(){ return null; }\n^properties({});`), true);
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
