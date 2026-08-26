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

      function TestChild({ active, label, count, items, onSelect, payload }: ChildProps) {
        return <button>{label}:{count}:{items.length}:{String(active)}:{String(payload)}</button>;
      }

      function TestParent(props: ChildProps) {
        return <TestChild
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

    assert.match(code, /<test-child[^>]*\.active=\$\{this\.active\}/);
    assert.match(code, /<test-child[^>]*label="\$\{this\.label\}"/);
    assert.match(code, /<test-child[^>]*count="\$\{this\.count\}"/);
    assert.match(code, /<test-child[^>]*\.items=\$\{this\.items\}/);
    assert.match(code, /<test-child[^>]*\.onSelect=\$\{this\.onSelect\}/);
    assert.match(code, /<test-child[^>]*\.payload=\$\{this\.payload\}/);
  });

  it("uses explicit native DOM listeners with live values and booleans", () => {
    const source = `
      function TestForm({ value, disabled, onChange, onClick, onAnimationEnd }) {
        return <section>
          <label className="field" htmlFor="query">Query</label>
          <input id="query" value={value} disabled={disabled} on:input={onChange} />
          <button on:click={onClick} on:animationend={onAnimationEnd}>Save</button>
          <button onclick={onClick}>Native property</button>
        </section>;
      }
    `;

    const { code } = transformLitsxSync(source, {
      filename: "/tmp/litsx-standard-dom.jsx",
    });

    assert.match(code, /<label class="field" for="query">/);
    assert.match(code, /<input id="query" \.value=\$\{this\.value\} \?disabled=\$\{this\.disabled\} @input=\$\{this\.onChange\}>/);
    assert.match(code, /<button @click=\$\{this\.onClick\} @animationend=\$\{this\.onAnimationEnd\}>Save<\/button>/);
    assert.match(code, /<button \.onclick=\$\{this\.onClick\}>Native property<\/button>/);
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
      export function TestChild(props: ChildProps) {
        return <div>{props.name}</div>;
      }
    `);

    const source = `
      import { TestChild } from "./child.tsx";
      export function TestParent({ enabled, name, config, onCommit }) {
        return <TestChild
          enabled={enabled}
          name={name}
          config={config}
          onCommit={onCommit}
        />;
      }
    `;
    fs.writeFileSync(parentFile, source);

    const { code } = transformLitsxSync(source, { filename: parentFile });

    assert.match(code, /<test-child[^>]*\.enabled=\$\{this\.enabled\}/);
    assert.match(code, /<test-child[^>]*name="\$\{this\.name\}"/);
    assert.match(code, /<test-child[^>]*\.config=\$\{this\.config\}/);
    assert.match(code, /<test-child[^>]*\.onCommit=\$\{this\.onCommit\}/);
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

      function TestScreen({ active, label, payload, onCommit }: ThirdPartyWidgetProps) {
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

  it("keeps onX callbacks as properties and uses on:event for custom events", () => {
    const source = `
      type ActionProps = {
        onCallback: (value: string) => void;
      };
      function TestAction(props: ActionProps) {
        return <button>{String(props.onCallback)}</button>;
      }
      function TestScreen({ onCallback, onPrimaryAction, onURLChange, onAnimationEnd }) {
        return <section>
          <TestAction
            onCallback={onCallback}
            onPrimaryAction={onPrimaryAction}
            onURLChange={onURLChange}
            onAnimationEnd={onAnimationEnd}
            on:primary-action={onPrimaryAction}
            on:url-change={{ handleEvent: onURLChange, capture: true }}
            on:animationend={onAnimationEnd}
          />
          <third-party-action
            onclick={onCallback}
            on:primary-action={onPrimaryAction}
            on:url-change={onURLChange}
            on:animationend={onAnimationEnd}
          />
          <third-party-action
            on:primary-action-capture={onPrimaryAction}
            on:menu-open={onURLChange}
          />
        </section>;
      }
    `;

    const { code } = transformLitsxSync(source, {
      filename: "/tmp/litsx-standard-custom-events.tsx",
    });

    assert.match(code, /<test-action[^>]*\.onCallback=\$\{this\.onCallback\}/);
    assert.match(code, /<test-action[^>]*\.onPrimaryAction=\$\{this\.onPrimaryAction\}/);
    assert.match(code, /<test-action[^>]*\.onURLChange=\$\{this\.onURLChange\}/);
    assert.match(code, /<test-action[^>]*\.onAnimationEnd=\$\{this\.onAnimationEnd\}/);
    assert.match(code, /@primary-action=\$\{this\.onPrimaryAction\}/);
    assert.match(code, /@url-change=\$\{\{[\s\S]*handleEvent: this\.onURLChange,[\s\S]*capture: true/);
    assert.match(code, /<test-action[^>]*@animationend=\$\{this\.onAnimationEnd\}/);
    assert.match(code, /<third-party-action[^>]*\.onclick=\$\{this\.onCallback\}/);
    assert.match(code, /<third-party-action[^>]*@primary-action=\$\{this\.onPrimaryAction\}/);
    assert.match(code, /<third-party-action[^>]*@url-change=\$\{this\.onURLChange\}/);
    assert.match(code, /<third-party-action[^>]*@animationend=\$\{this\.onAnimationEnd\}/);
    assert.match(code, /@primary-action-capture=\$\{this\.onPrimaryAction\}/);
    assert.match(code, /@menu-open=\$\{this\.onURLChange\}/);

    assert.throws(
      () => transformLitsxSync(
        "function TestInvalid({ handler }) { return <div on:menuOpen={handler} />; }",
        { filename: "/tmp/litsx-invalid-event-name.jsx" },
      ),
      /must use lowercase kebab-case/,
    );
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

      function TestScreen({ active, label, payload }: {
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

  it("infers and registers namespace component elements across .tsx modules", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "litsx-standard-namespace-"));
    const childFile = path.join(root, "controls.tsx");
    const parentFile = path.join(root, "screen.tsx");
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
      import * as Controls from "./controls.tsx";
      export function TestScreen({ enabled, tone, model }) {
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
    assert.match(code, /<controls-toggle[^>]*\.enabled=\$\{this\.enabled\}/);
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
      function TestSurface({ style, onPointerDown, editable, draggable, hidden, spellCheck, readOnly }: SurfaceProps) {
        return <section>
          <div
            style={style}
            contentEditable={editable}
            draggable={draggable}
            hidden={hidden}
            on:pointerdown={{ handleEvent: onPointerDown, capture: true }}
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

    assert.match(code, /import \{[^}]*resolveStyle[^}]*\} from "@litsx\/core"/);
    assert.match(code, /style=\$\{resolveStyle\(this\.style\)\}/);
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
      import { css } from "@litsx/core";

      function TestCard({ title, payload }) {
        return <article>{title}:{String(payload)}</article>;
      }
      TestCard.properties = {
        title: { reflect: true },
        payload: { type: Object, attribute: false },
      };
      TestCard.styles = css\`:host { display: block; }\`;
      TestCard.shadowRootOptions = { mode: "open", delegatesFocus: true };

      function TestPlain({ label }) {
        return <p>{label}</p>;
      }
      TestPlain.lightDom = true;
    `;

    const { code } = transformLitsxSync(source, {
      filename: "/tmp/litsx-standard-statics.jsx",
    });

    assert.match(code, /class TestCard extends LitElement/);
    assert.match(code, /static properties = \{/);
    assert.match(code, /title: \{[\s\S]*type: String[\s\S]*reflect: true/);
    assert.match(code, /payload: \{[\s\S]*type: Object,[\s\S]*attribute: false/);
    assert.match(code, /static styles = \[super\.styles \?\? \[\], css`/);
    assert.match(code, /css`:host \{ display: block; \}`/);
    assert.match(code, /import \{[^}]*css[^}]*\} from "@litsx\/core"/);
    assert.doesNotMatch(code, /import \{[^}]*css[^}]*\} from "lit"/);
    assert.match(code, /static shadowRootOptions = \{/);
    assert.match(code, /class TestPlain extends LightDomMixin\(LitElement\)/);
    assert.doesNotMatch(code, /TestCard\.properties\s*=/);
    assert.doesNotMatch(code, /TestPlain\.lightDom\s*=/);
  });

  it("preserves Lit CSSResultGroup assignments and rejects plain style strings", () => {
    const source = `
      import { css } from "lit";
      const sharedStyles = css\`:host { box-sizing: border-box; }\`;

      function TestCard() {
        return <article />;
      }
      TestCard.styles = [sharedStyles, css\`article { display: block; }\`];
    `;

    const { code } = transformLitsxSync(source, {
      filename: "/tmp/litsx-standard-css-results.tsx",
    });

    assert.match(code, /\[super\.styles \?\? \[\], sharedStyles, css`article \{ display: block; \}`\]/);
    assert.doesNotMatch(code, /unsafeCSS\(sharedStyles\)/);

    assert.throws(
      () => transformLitsxSync(`
        function InvalidStyles() { return <div />; }
        InvalidStyles.styles = \`:host { display: block; }\`;
      `, { filename: "/tmp/litsx-invalid-standard-styles.tsx" }),
      /must be a Lit CSSResultGroup[\s\S]*css`\.\.\.`/,
    );
  });

  it("composes inherited styles by default and supports an explicit replacement", () => {
    const source = `
      import { css, defineHook, replaceStyles } from "@litsx/core";
      const StyledMixin = Base => class extends Base {
        static properties = { mixed: { type: Boolean } };
        static styles = [super.styles ?? [], css\`:host { color: red; }\`];
      };
      const useStyled = defineHook({ mixin: StyledMixin, use: () => null });
      const OwnChild = class extends HTMLElement {};

      function TestComposed() { useStyled(); return <div />; }
      TestComposed.properties = { label: { type: String } };
      TestComposed.styles = css\`:host { display: block; }\`;
      TestComposed.elements = { "own-child": OwnChild };

      function TestIsolated() { useStyled(); return <div />; }
      TestIsolated.styles = replaceStyles(css\`:host { all: initial; }\`);
    `;

    const { code } = transformLitsxSync(source, {
      filename: "/tmp/litsx-inherited-styles.tsx",
      jsxTemplate: false,
    });

    assert.match(code, /class TestComposed extends applyStructuralHooks[\s\S]*?static styles = \[super\.styles \?\? \[\], css`:host \{ display: block; \}`\]/);
    assert.match(code, /class TestComposed extends applyStructuralHooks[\s\S]*?static properties = \{[\s\S]*?label: \{[\s\S]*?type: String/);
    assert.doesNotMatch(code, /super\.properties/);
    assert.match(code, /static elements = \{\s*\.\.\.\(super\.elements \?\? \{\}\),\s*"own-child": OwnChild/);
    assert.match(code, /class TestIsolated extends applyStructuralHooks[\s\S]*?static styles = css`:host \{ all: initial; \}`/);
    assert.doesNotMatch(code, /replaceStyles\(/);
    assert.doesNotMatch(code, /LitsxStaticHoistsMixin|__litsxStatic|litsx\.static\.styles/);
  });

  it("composes inherited, detected, and explicitly authored elements in precedence order", () => {
    const source = `
      import DetectedChild from "./DetectedChild.js";
      const OwnChild = class extends HTMLElement {};

      function ElementMatrix() {
        return <DetectedChild />;
      }
      ElementMatrix.elements = { "own-child": OwnChild };
    `;

    const { code } = transformLitsxSync(source, {
      filename: "/tmp/litsx-element-composition.tsx",
      jsxTemplate: false,
    });

    assert.match(
      code,
      /static elements = \{\s*\.\.\.\(super\.elements \?\? \{\}\),\s*"detected-child": DetectedChild,\s*"own-child": OwnChild\s*\}/,
    );
  });

  it("recognizes aliased and namespace replaceStyles imports", () => {
    const source = `
      import { css, replaceStyles as resetStyles } from "@litsx/core";
      import * as litsx from "@litsx/core";
      function AliasCard() { return <div />; }
      AliasCard.styles = resetStyles(css\`:host { color: red; }\`);
      function NamespaceCard() { return <div />; }
      NamespaceCard.styles = litsx.replaceStyles(css\`:host { color: blue; }\`);
    `;
    const { code } = transformLitsxSync(source, {
      filename: "/tmp/litsx-replace-style-imports.tsx",
      jsxTemplate: false,
    });

    assert.match(code, /class AliasCard[\s\S]*?static styles = css`:host \{ color: red; \}`/);
    assert.match(code, /class NamespaceCard[\s\S]*?static styles = css`:host \{ color: blue; \}`/);
    assert.doesNotMatch(code, /super\.styles/);
  });

  it("uses the final top-level styles and properties assignments", () => {
    const source = `
      import { css } from "@litsx/core";
      function TestCard({ active }) { return <div>{active}</div>; }
      TestCard.styles = css\`:host { color: red; }\`;
      TestCard.properties = { active: { reflect: false } };
      TestCard.styles = css\`:host { color: blue; }\`;
      TestCard.properties = { active: { reflect: true } };
    `;
    const { code } = transformLitsxSync(source, {
      filename: "/tmp/litsx-final-static-assignment.tsx",
      jsxTemplate: false,
    });

    assert.match(code, /static styles = \[super\.styles \?\? \[\], css`:host \{ color: blue; \}`\]/);
    assert.doesNotMatch(code, /color: red/);
    assert.match(code, /active: \{\s*type: String,\s*reflect: true\s*\}/s);
    assert.doesNotMatch(code, /reflect: false/);
  });

  it("leaves React propTypes assignments outside LitSX static configuration", () => {
    const source = `
      import PropTypes from "prop-types";
      function TestCard({ title }) {
        return <article>{title}</article>;
      }
      TestCard.propTypes = { title: PropTypes.string };
    `;

    const { code } = transformLitsxSync(source, {
      filename: "/tmp/litsx-standard-proptypes.jsx",
      jsxTemplate: false,
    });

    assert.match(code, /TestCard\.propTypes = \{/);
    assert.doesNotMatch(code, /static get propTypes/);
  });

  it("does not enable React key reconciliation in the native pipeline", () => {
    const source = `
      function TestRow({ item }) { return <li>{item.label}</li>; }
      function TestList({ items }) {
        return <ul>{items.map(item => <TestRow key={item.id} item={item} />)}</ul>;
      }
    `;

    const { code } = transformLitsxSync(source, {
      filename: "/tmp/litsx-native-key.tsx",
    });

    assert.doesNotMatch(code, /lit\/directives\/(?:repeat|keyed)\.js/);
    assert.match(code, /<test-row \.key=\$\{item\.id\}/);
  });
});
