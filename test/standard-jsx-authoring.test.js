import assert from "node:assert";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach } from "vitest";
import { describe, it } from "vitest";
import { transformLitsxSync } from "../packages/compiler/src/index.js";

const tempDirs = [];

afterEach(() => {
  while (tempDirs.length > 0) {
    fs.rmSync(tempDirs.pop(), { recursive: true, force: true });
  }
});

describe("standard JSX authoring", () => {
  it("infers Lit bindings from a typed component API", () => {
    const source = `
      type ChildProps = {
        active: boolean;
        label: string;
        count: number;
        items: string[];
        onSelect: (value: string) => void;
        payload: unknown;
      };

      function Child({ active, label, count, items, onSelect, payload }: ChildProps) {
        return <button>{label}:{count}:{items.length}:{String(active)}:{String(payload)}</button>;
      }

      function Parent(props: ChildProps) {
        return <Child
          active={props.active}
          label={props.label}
          count={props.count}
          items={props.items}
          onSelect={props.onSelect}
          payload={props.payload}
        />;
      }
    `;

    const { code } = transformLitsxSync(source, {
      filename: "/tmp/litsx-standard-bindings.tsx",
    });

    assert.match(code, /<child[^>]*\?active=\$\{this\.active\}/);
    assert.match(code, /<child[^>]*label="\$\{this\.label\}"/);
    assert.match(code, /<child[^>]*count="\$\{this\.count\}"/);
    assert.match(code, /<child[^>]*\.items=\$\{this\.items\}/);
    assert.match(code, /<child[^>]*\.onSelect=\$\{this\.onSelect\}/);
    assert.match(code, /<child[^>]*\.payload=\$\{this\.payload\}/);
  });

  it("infers native DOM listeners, aliases, live values, and booleans", () => {
    const source = `
      function Form({ value, disabled, onChange, onClick }) {
        return <section>
          <label className="field" htmlFor="query">Query</label>
          <input id="query" value={value} disabled={disabled} onChange={onChange} />
          <button onClick={onClick}>Save</button>
        </section>;
      }
    `;

    const { code } = transformLitsxSync(source, {
      filename: "/tmp/litsx-standard-dom.jsx",
    });

    assert.match(code, /<label class="field" for="query">/);
    assert.match(code, /<input id="query" \.value=\$\{this\.value\} \?disabled=\$\{this\.disabled\} @input=\$\{this\.onChange\}>/);
    assert.match(code, /<button @click=\$\{this\.onClick\}>Save<\/button>/);
  });

  it("infers bindings from imported component types", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "litsx-standard-import-"));
    const childFile = path.join(root, "child.tsx");
    const parentFile = path.join(root, "parent.tsx");
    tempDirs.push(root);

    fs.writeFileSync(childFile, `
      export interface ChildProps {
        enabled: boolean;
        name: string;
        config: { mode: string };
        onCommit: (value: string) => void;
      }
      export function Child(props: ChildProps) {
        return <div>{props.name}</div>;
      }
    `);

    const source = `
      import { Child } from "./child.tsx";
      export function Parent({ enabled, name, config, onCommit }) {
        return <Child
          enabled={enabled}
          name={name}
          config={config}
          onCommit={onCommit}
        />;
      }
    `;
    fs.writeFileSync(parentFile, source);

    const { code } = transformLitsxSync(source, { filename: parentFile });

    assert.match(code, /<child[^>]*\?enabled=\$\{this\.enabled\}/);
    assert.match(code, /<child[^>]*name="\$\{this\.name\}"/);
    assert.match(code, /<child[^>]*\.config=\$\{this\.config\}/);
    assert.match(code, /<child[^>]*\.onCommit=\$\{this\.onCommit\}/);
  });

  it("uses published intrinsic custom-element props without runtime metadata", () => {
    const source = `
      export {};
      type ThirdPartyWidgetProps = {
        active: boolean;
        label: string;
        payload: { id: string };
        onCommit: (id: string) => void;
      };
      declare global {
        namespace JSX {
          interface IntrinsicElements {
            "third-party-widget": ThirdPartyWidgetProps;
          }
        }
      }

      function Screen({ active, label, payload, onCommit }: ThirdPartyWidgetProps) {
        return <third-party-widget
          active={active}
          label={label}
          payload={payload}
          onCommit={onCommit}
        />;
      }
    `;

    const { code } = transformLitsxSync(source, {
      filename: "/tmp/litsx-standard-custom-intrinsic.tsx",
    });

    assert.match(code, /<third-party-widget[^>]*\.active=\$\{this\.active\}/);
    assert.match(code, /label="\$\{this\.label\}"/);
    assert.match(code, /\.payload=\$\{this\.payload\}/);
    assert.match(code, /\.onCommit=\$\{this\.onCommit\}/);
    assert.doesNotMatch(code, /@commit=/);
  });

  it("uses a published HTMLElementTagNameMap custom-element API", () => {
    const source = `
      export {};
      class ThirdPartySwitch extends HTMLElement {
        active = false;
        label = "";
        payload: { id: string } | null = null;
      }
      declare global {
        interface HTMLElementTagNameMap {
          "third-party-switch": ThirdPartySwitch;
        }
      }

      function Screen({ active, label, payload }: {
        active: boolean;
        label: string;
        payload: { id: string };
      }) {
        return <third-party-switch active={active} label={label} payload={payload} />;
      }
    `;

    const { code } = transformLitsxSync(source, {
      filename: "/tmp/litsx-standard-custom-element-map.tsx",
    });

    assert.match(code, /<third-party-switch[^>]*\.active=\$\{this\.active\}/);
    assert.match(code, /label="\$\{this\.label\}"/);
    assert.match(code, /\.payload=\$\{this\.payload\}/);
  });

  it("infers and registers namespace component elements across .litsx modules", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "litsx-standard-namespace-"));
    const childFile = path.join(root, "controls.litsx");
    const parentFile = path.join(root, "screen.litsx");
    tempDirs.push(root);

    fs.writeFileSync(childFile, `
      export type ToggleProps = {
        enabled?: boolean;
        tone: "quiet" | "loud";
        model: { id: string } | null;
      };
      export function Toggle(props: ToggleProps) {
        return <button>{props.tone}</button>;
      }
      export function OtherComponent({ label }: { label: string }) {
        return <span>{label}</span>;
      }
    `);

    const source = `
      import * as Controls from "./controls.litsx";
      export function Screen({ enabled, tone, model }) {
        return <>
          <Controls.Toggle
            enabled={enabled}
            tone={tone}
            model={model}
            data-state="ready"
          />
          <Controls.OtherComponent label={tone} />
        </>;
      }
    `;
    fs.writeFileSync(parentFile, source);

    const { code } = transformLitsxSync(source, { filename: parentFile });

    assert.match(code, /static elements = \{[\s\S]*"controls-toggle": Controls\.Toggle/);
    assert.match(code, /"controls-other-component": Controls\.OtherComponent/);
    assert.match(code, /<controls-toggle[^>]*\?enabled=\$\{this\.enabled\}/);
    assert.match(code, /tone="\$\{this\.tone\}"/);
    assert.match(code, /\.model=\$\{this\.model\}/);
    assert.match(code, /data-state="ready"/);
    assert.match(code, /<controls-other-component label="\$\{this\.tone\}"><\/controls-other-component>/);
    assert.doesNotMatch(code, /Controls\.Toggle\(\{/);
  });

  it("distinguishes HTML boolean attributes from boolean-valued enumerated attributes", () => {
    const source = `
      type SurfaceProps = {
        style: Partial<CSSStyleDeclaration>;
        onPointerDown: (event: PointerEvent) => void;
        editable: boolean;
        draggable: boolean;
        hidden: boolean;
        spellCheck: boolean;
        readOnly: boolean;
      };
      function Surface({ style, onPointerDown, editable, draggable, hidden, spellCheck, readOnly }: SurfaceProps) {
        return <section>
          <div
            style={style}
            contentEditable={editable}
            draggable={draggable}
            hidden={hidden}
            onPointerDownCapture={onPointerDown}
            aria-live="polite"
          />
          <textarea spellCheck={spellCheck} readOnly={readOnly} />
          <div draggable spellCheck contentEditable hidden="until-found" />
        </section>;
      }
    `;

    const { code } = transformLitsxSync(source, {
      filename: "/tmp/litsx-standard-dom-advanced.tsx",
    });

    assert.match(code, /\.style=\$\{this\.style\}/);
    assert.match(code, /contenteditable="\$\{this\.editable\}"/);
    assert.match(code, /draggable="\$\{this\.draggable\}"/);
    assert.match(code, /\?hidden=\$\{this\.hidden\}/);
    assert.match(code, /spellcheck="\$\{this\.spellCheck\}"/);
    assert.match(code, /\?readonly=\$\{this\.readOnly\}/);
    assert.match(code, /draggable="\$\{true\}" spellcheck="\$\{true\}" contenteditable="\$\{true\}" hidden="until-found"/);
    assert.doesNotMatch(code, /[?.](?:draggable|spellcheck)=/);
    assert.match(code, /@pointerdown=\$\{\{[\s\S]*handleEvent: this\.onPointerDown,[\s\S]*capture: true/);
    assert.match(code, /aria-live="polite"/);
  });

  it("accepts component static configuration through standard assignments", () => {
    const source = `
      import { css } from "lit";

      function Card({ title, payload }) {
        return <article>{title}:{String(payload)}</article>;
      }
      Card.properties = {
        title: { reflect: true },
        payload: { type: Object, attribute: false },
      };
      Card.styles = css\`:host { display: block; }\`;
      Card.shadowRootOptions = { mode: "open", delegatesFocus: true };

      function Plain({ label }) {
        return <p>{label}</p>;
      }
      Plain.lightDom = true;
    `;

    const { code } = transformLitsxSync(source, {
      filename: "/tmp/litsx-standard-statics.jsx",
    });

    assert.match(code, /class Card extends LitsxStaticHoistsMixin\(LitElement\)/);
    assert.match(code, /static get properties\(\)/);
    assert.match(code, /title: \{[\s\S]*type: String[\s\S]*reflect: true/);
    assert.match(code, /payload: \{[\s\S]*type: Object,[\s\S]*attribute: false/);
    assert.match(code, /static get styles\(\)/);
    assert.match(code, /static get shadowRootOptions\(\)/);
    assert.match(code, /class Plain extends LightDomMixin\(LitElement\)/);
    assert.doesNotMatch(code, /Card\.properties\s*=/);
    assert.doesNotMatch(code, /Plain\.lightDom\s*=/);
  });

  it("leaves React propTypes assignments outside LitSX static configuration", () => {
    const source = `
      import PropTypes from "prop-types";
      function Card({ title }) {
        return <article>{title}</article>;
      }
      Card.propTypes = { title: PropTypes.string };
    `;

    const { code } = transformLitsxSync(source, {
      filename: "/tmp/litsx-standard-proptypes.jsx",
      jsxTemplate: false,
    });

    assert.match(code, /Card\.propTypes = \{/);
    assert.doesNotMatch(code, /static get propTypes/);
  });
});
