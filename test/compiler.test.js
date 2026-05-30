import assert from "assert";
import babelCore from "@babel/core";
import fs from "fs";
import { TraceMap, originalPositionFor } from "@jridgewell/trace-mapping";
import os from "os";
import path from "path";
import { describe, it, vi } from "vitest";
import * as jsxTemplateModule from "../packages/babel-plugin-transform-jsx-html-template/src/index.js";
import * as presetModule from "../packages/babel-preset-litsx/src/index.js";
import { createLitsxTypecheckSession } from "../packages/typescript/src/typecheck.js";

import {
  createLitsxCompilationSession,
  transformLitsx,
  transformLitsxSync,
} from "../packages/compiler/src/index.js";

const { types: t } = babelCore;

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

describe("@litsx/compiler", () => {
  it("compiles authored LitSX source and returns metadata", () => {
    const source = [
      "export const Counter = ({ label = 'Save' }) => {",
      "  return <button class=\"cta\" @click={save}>{label}</button>;",
      "};",
    ].join("\n");

    const result = transformLitsxSync(source, {
      filename: "/virtual/Counter.jsx",
    });

    assert.match(result.code, /html`/);
    assert.match(result.code, /@click=\$\{save\}/);
    assert.strictEqual(result.map, null);
    assert.ok(result.metadata);
    assert.ok(Array.isArray(result.metadata.litsxTemplateAttributeMappings));
  }, 20000);

  it("compiles .litsx source with TypeScript syntax by default", () => {
    const source = [
      "export const Counter = ({ label }: { label: string }) => {",
      "  return <button class=\"cta\" @click={save}>{label}</button>;",
      "};",
    ].join("\n");

    const result = transformLitsxSync(source, {
      filename: "/virtual/Counter.litsx",
    });

    assert.match(result.code, /html`/);
    assert.match(result.code, /@click=\$\{save\}/);
    assert.doesNotMatch(result.code, /label: string/);
    assert.doesNotMatch(result.code, /type\s+[A-Za-z0-9_]+/);
  }, 20000);

  it("strips top-level TypeScript declarations from compiled .litsx output", () => {
    const source = [
      "interface ButtonProps {",
      "  label?: string;",
      "}",
      "type ButtonVariant = \"primary\" | \"secondary\";",
      "const buttonDefaults = { variant: \"primary\" } as const;",
      "export const Counter = ({ label = buttonDefaults.variant }: ButtonProps) => {",
      "  const values = [label] as string[];",
      "  return <button>{values[0]}</button>;",
      "};",
    ].join("\n");

    const result = transformLitsxSync(source, {
      filename: "/virtual/Counter.litsx",
    });

    assert.match(result.code, /html`/);
    assert.doesNotMatch(result.code, /interface ButtonProps/);
    assert.doesNotMatch(result.code, /type ButtonVariant/);
    assert.doesNotMatch(result.code, / as const/);
    assert.doesNotMatch(result.code, / as string\[\]/);
  }, 20000);

  it("strips TypeScript syntax from jsxTemplate=false output", () => {
    const source = [
      "type CounterProps = {",
      "  label: string;",
      "};",
      "export const Counter = ({ label }: CounterProps) => {",
      "  return <button>{label}</button>;",
      "};",
    ].join("\n");

    const result = transformLitsxSync(source, {
      filename: "/virtual/Counter.litsx",
      jsxTemplate: false,
    });

    assert.match(result.code, /class Counter extends LitElement/);
    assert.doesNotMatch(result.code, /type CounterProps/);
    assert.doesNotMatch(result.code, /label: string/);
  }, 20000);

  it("strips generic TypeScript syntax from compiled .litsx output", () => {
    const source = [
      "function identity<T>(value: T): T {",
      "  return value;",
      "}",
      "export const Counter = () => {",
      "  const label = identity<string>(\"Save\");",
      "  return <button>{label}</button>;",
      "};",
    ].join("\n");

    const result = transformLitsxSync(source, {
      filename: "/virtual/Counter.litsx",
    });

    assert.match(result.code, /html`/);
    assert.doesNotMatch(result.code, /<T>/);
    assert.doesNotMatch(result.code, /: T\b/);
    assert.doesNotMatch(result.code, /identity<string>/);
    assert.match(result.code, /identity\("Save"\)/);
  }, 20000);

  it("lowers direct children expressions to slots for implicit projection", () => {
    const source = [
      "export function Frame({ children }) {",
      "  return <section>{children}</section>;",
      "}",
      "export function Shell(props) {",
      "  return <Frame>{props.children}</Frame>;",
      "}",
      "export function Demo() {",
      "  return <Shell><p>Alpha</p></Shell>;",
      "}",
    ].join("\n");

    const result = transformLitsxSync(source, {
      filename: "/virtual/Children.litsx",
    });

    assert.match(result.code, /return html`<section><slot><\/slot><\/section>`;/);
    assert.match(result.code, /return html`<frame><slot><\/slot><\/frame>`;/);
    assert.match(result.code, /return html`<shell><p>Alpha<\/p><\/shell>`;/);
  }, 20000);

  it("lowers authored JSX inside suspense content renderers", () => {
    const source = [
      'import { SuspenseBoundary } from "@litsx/core";',
      'import { GuideCard } from "./guide-card.litsx";',
      "export const Demo = () => {",
      "  return (",
      "    <SuspenseBoundary",
      "      .fallbackRenderer={() => null}",
      '      .contentRenderer={() => <GuideCard .eyebrow={"x"} .titleRenderer={() => "y"} .contentRenderer={() => <p>z</p>} />}',
      "    />",
      "  );",
      "};",
    ].join("\n");

    const result = transformLitsxSync(source, {
      filename: "/virtual/Demo.litsx",
      jsxTemplate: false,
    });

    assert.doesNotMatch(result.code, /<GuideCard/);
    assert.match(result.code, /<guide-card/);
    assert.match(result.code, /"guide-card": GuideCard/);
    assert.match(result.code, /bindRendererContext/);
    assert.doesNotMatch(result.code, /\.titleRenderer=\{bindRendererContext\(typeof this === "undefined" \? null : this,\s*\(\) => "y"\)\}/);
    assert.doesNotMatch(result.code, /\.contentRenderer=\{bindRendererContext\(typeof this === "undefined" \? null : this,\s*\(\) => <p>z<\/p>\)\}/);
    assert.match(result.code, /\.contentRenderer=\{bindRendererContext\(typeof this === "undefined" \? null : this,\s*\(\) => <guide-card[\s\S]*\/>,\s*\{\s*projected: true\s*\}\)\}/);
  }, 20000);

  it("binds only function props whose returned JSX needs component context", () => {
    const source = [
      'import { SuspenseBoundary } from "@litsx/core";',
      'import { GuideCard } from "./guide-card.litsx";',
      "const renderHeader = () => <p>plain</p>;",
      "const renderPanel = () => <fancy-panel />;",
      "export const Demo = () => {",
      "  return (",
      "    <>",
      '      <SuspenseBoundary .contentRenderer={renderHeader} />',
      '      <guide-card .header={renderPanel} />',
      '      <GuideCard .title={renderHeader} />',
      '      <button .onclick={renderHeader}></button>',
      "    </>",
      "  );",
      "};",
    ].join("\n");

    const result = transformLitsxSync(source, {
      filename: "/virtual/Demo.litsx",
      jsxTemplate: false,
    });

    assert.doesNotMatch(result.code, /\.contentRenderer=\{bindRendererContext\(typeof this === "undefined" \? null : this,\s*renderHeader\)\}/);
    assert.match(result.code, /\.header=\{bindRendererContext\(typeof this === "undefined" \? null : this,\s*renderPanel,\s*\{\s*projected: true\s*\}\)\}/);
    assert.doesNotMatch(result.code, /\.title=\{bindRendererContext\(typeof this === "undefined" \? null : this,\s*renderHeader\)\}/);
    assert.doesNotMatch(result.code, /\.onclick=\{bindRendererContext\(/);
  }, 20000);

  it("binds local helper references only when they transitively return component JSX", () => {
    const source = [
      "import { GuideCard } from './guide-card.litsx';",
      "const renderPlain = () => <p>plain</p>;",
      "const renderCard = () => <GuideCard />;",
      "const wrapPlain = () => renderPlain();",
      "const wrapCard = () => renderCard();",
      "export const Demo = () => {",
      "  return (",
      "    <guide-card",
      "      .plain={wrapPlain}",
      "      .card={wrapCard}",
      "    />",
      "  );",
      "};",
    ].join("\n");

    const result = transformLitsxSync(source, {
      filename: "/virtual/Demo.litsx",
      jsxTemplate: false,
    });

    assert.doesNotMatch(result.code, /\.plain=\{bindRendererContext\(/);
    assert.match(result.code, /\.card=\{bindRendererContext\(typeof this === "undefined" \? null : this,\s*wrapCard,\s*\{\s*projected: true\s*\}\)\}/);
  }, 20000);

  it("binds imported helper references when they transitively return component JSX from another file", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "litsx-imported-renderer-"));

    try {
      const rootFile = path.join(tempDir, "demo.litsx");
      const helperFile = path.join(tempDir, "renderers.js");
      const buttonFile = path.join(tempDir, "litsx-button.litsx");

      fs.writeFileSync(
        helperFile,
        [
          "import { LitsxButton } from './litsx-button.litsx';",
          "export function renderHeader() {",
          "  return <LitsxButton label='Save' />;",
          "}",
        ].join("\n")
      );

      fs.writeFileSync(
        buttonFile,
        [
          "export const LitsxButton = ({ label = '' }) => {",
          "  return <button>{label}</button>;",
          "};",
        ].join("\n")
      );

      const source = [
        "import { renderHeader } from './renderers.js';",
        "export const Demo = () => {",
        "  return <guide-card .header={renderHeader} />;",
        "};",
      ].join("\n");

      const result = transformLitsxSync(source, {
        filename: rootFile,
        jsxTemplate: false,
      });

      assert.match(result.code, /import \{ renderHeader \} from ['"]\.\/renderers\.js['"]/);
      assert.match(result.code, /import \{ LitsxButton(?: as __litsxImportedLitsxButton1)? \} from ['"]\.\/litsx-button\.litsx['"]/);
      assert.match(result.code, /\.header=\{bindRendererContext\(typeof this === "undefined" \? null : this,\s*renderHeader,\s*\{\s*projected: true\s*\}\)\}/);
      assert.match(result.code, /static elements\s*=\s*\{[\s\S]*"litsx-button": (?:LitsxButton|__litsxImportedLitsxButton1)[\s\S]*\}/);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }, 20000);

  it("follows imported helper chains across multiple files for renderer analysis", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "litsx-imported-renderer-chain-"));

    try {
      const rootFile = path.join(tempDir, "demo.litsx");
      const middleFile = path.join(tempDir, "renderers.js");
      const leafFile = path.join(tempDir, "deep-renderers.js");
      const buttonFile = path.join(tempDir, "litsx-button.litsx");

      fs.writeFileSync(
        middleFile,
        [
          "import { wrapHeader } from './deep-renderers.js';",
          "export { wrapHeader };",
        ].join("\n")
      );

      fs.writeFileSync(
        leafFile,
        [
          "import { LitsxButton } from './litsx-button.litsx';",
          "export const wrapHeader = () => renderHeader();",
          "function renderHeader() {",
          "  return <LitsxButton label='Chain' />;",
          "}",
        ].join("\n")
      );

      fs.writeFileSync(
        buttonFile,
        [
          "export const LitsxButton = ({ label = '' }) => {",
          "  return <button>{label}</button>;",
          "};",
        ].join("\n")
      );

      const source = [
        "import { wrapHeader } from './renderers.js';",
        "export const Demo = () => {",
        "  return <guide-card .header={wrapHeader} />;",
        "};",
      ].join("\n");

      const result = transformLitsxSync(source, {
        filename: rootFile,
        jsxTemplate: false,
      });

      assert.match(result.code, /\.header=\{bindRendererContext\(typeof this === "undefined" \? null : this,\s*wrapHeader,\s*\{\s*projected: true\s*\}\)\}/);
      assert.match(result.code, /import \{ LitsxButton(?: as __litsxImportedLitsxButton1)? \} from ['"]\.\/litsx-button\.litsx['"]/);
      assert.match(result.code, /static elements\s*=\s*\{[\s\S]*"litsx-button": (?:LitsxButton|__litsxImportedLitsxButton1)[\s\S]*\}/);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }, 20000);

  it("preserves bare package specifiers when imported helpers render package components", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "litsx-imported-renderer-node-modules-"));

    try {
      const rootFile = path.join(tempDir, "demo.litsx");
      const helperFile = path.join(tempDir, "renderers.js");
      const packageDir = path.join(tempDir, "node_modules", "@acme", "ui");

      fs.mkdirSync(packageDir, { recursive: true });
      fs.writeFileSync(
        path.join(packageDir, "package.json"),
        JSON.stringify({
          name: "@acme/ui",
          type: "module",
          exports: "./index.js",
        }, null, 2)
      );
      fs.writeFileSync(
        path.join(packageDir, "index.js"),
        [
          "export const FancyButton = ({ label = '' }) => {",
          "  return <button>{label}</button>;",
          "};",
        ].join("\n")
      );
      fs.writeFileSync(
        helperFile,
        [
          "import { FancyButton } from '@acme/ui';",
          "export function renderHeader() {",
          "  return <FancyButton label='Pkg' />;",
          "}",
        ].join("\n")
      );

      const source = [
        "import { renderHeader } from './renderers.js';",
        "export const Demo = () => {",
        "  return <guide-card .header={renderHeader} />;",
        "};",
      ].join("\n");

      const result = transformLitsxSync(source, {
        filename: rootFile,
        jsxTemplate: false,
      });

      assert.match(result.code, /import \{ FancyButton(?: as __litsxImportedFancyButton1)? \} from ['"]@acme\/ui['"]/);
      assert.match(result.code, /\.header=\{bindRendererContext\(typeof this === "undefined" \? null : this,\s*renderHeader,\s*\{\s*projected: true\s*\}\)\}/);
      assert.match(result.code, /static elements\s*=\s*\{[\s\S]*"fancy-button": (?:FancyButton|__litsxImportedFancyButton1)[\s\S]*\}/);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }, 20000);

  it("resolves alias specifiers for imported renderer helpers and preserves the alias import", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "litsx-imported-renderer-alias-"));

    try {
      const srcDir = path.join(tempDir, "src");
      const componentsDir = path.join(srcDir, "components");
      fs.mkdirSync(componentsDir, { recursive: true });

      const rootFile = path.join(srcDir, "demo.litsx");
      const helperFile = path.join(srcDir, "renderers.js");
      const buttonFile = path.join(componentsDir, "litsx-button.litsx");
      const tsconfigFile = path.join(tempDir, "tsconfig.json");

      fs.writeFileSync(
        tsconfigFile,
        JSON.stringify({
          compilerOptions: {
            target: "ESNext",
            module: "ESNext",
            moduleResolution: "Bundler",
            jsx: "preserve",
            allowJs: true,
            baseUrl: ".",
            paths: {
              "@/*": ["src/*"],
            },
          },
          include: ["src/**/*"],
        }, null, 2)
      );

      fs.writeFileSync(
        helperFile,
        [
          "import { LitsxButton } from '@/components/litsx-button.litsx';",
          "export const renderHeader = () => <LitsxButton label='Alias' />;",
        ].join("\n")
      );

      fs.writeFileSync(
        buttonFile,
        [
          "export const LitsxButton = ({ label = '' }) => {",
          "  return <button>{label}</button>;",
          "};",
        ].join("\n")
      );

      const session = createLitsxCompilationSession({
        projectPath: tsconfigFile,
      });

      const source = [
        "import { renderHeader } from './renderers.js';",
        "export const Demo = () => {",
        "  return <guide-card .header={renderHeader} />;",
        "};",
      ].join("\n");

      const result = session.transformSync(source, {
        filename: rootFile,
        jsxTemplate: false,
      });

      assert.match(result.code, /import \{ LitsxButton(?: as __litsxImportedLitsxButton1)? \} from ['"]@\/components\/litsx-button\.litsx['"]/);
      assert.match(result.code, /\.header=\{bindRendererContext\(typeof this === "undefined" \? null : this,\s*renderHeader,\s*\{\s*projected: true\s*\}\)\}/);
      assert.match(result.code, /static elements\s*=\s*\{[\s\S]*"litsx-button": (?:LitsxButton|__litsxImportedLitsxButton1)[\s\S]*\}/);

      session.dispose();
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }, 20000);

  it("does not include unrelated top-level helpers in static elements collection", () => {
    const source = [
      "import { GuideCard } from './guide-card.litsx';",
      "import { LitsxButton } from './litsx-button.litsx';",
      "function unusedHelper() {",
      "  return <LitsxButton type=\"secondary\" label=\"unused\" />;",
      "}",
      "export function Demo() {",
      "  return <GuideCard />;",
      "}",
    ].join("\n");

    const result = transformLitsxSync(source, {
      filename: "/virtual/Demo.litsx",
      jsxTemplate: false,
    });

    assert.match(result.code, /static elements\s*=\s*\{[\s\S]*"guide-card": GuideCard[\s\S]*\}/);
    assert.doesNotMatch(result.code, /"litsx-button": LitsxButton/);
  }, 20000);

  it("fails compilation when PascalCase JSX does not resolve to an import or local declaration", () => {
    assert.throws(() => {
      transformLitsxSync(
        [
          "export function Demo() {",
          "  return <MissingThing />;",
          "}",
        ].join("\n"),
        {
          filename: "/virtual/Demo.litsx",
        }
      );
    }, /Unknown LitSX component "MissingThing"/);
  }, 20000);

  it("materializes zero-arg inline render thunks in child position", () => {
    const source = [
      "export function Demo() {",
      "  return <section>{() => <fancy-panel />}</section>;",
      "}",
    ].join("\n");

    const result = transformLitsxSync(source, {
      filename: "/virtual/Demo.litsx",
    });

    assert.match(result.code, /return html`<section>\$\{\(\(\) => html`<fancy-panel><\/fancy-panel>`\)\(\)\}<\/section>`;/);
  }, 20000);

  it("materializes zero-arg inline wrappers around local render helpers in child position", () => {
    const source = [
      "export function Demo() {",
      "  const fn = () => <fancy-panel />;",
      "  return <section>{() => fn()}</section>;",
      "}",
    ].join("\n");

    const result = transformLitsxSync(source, {
      filename: "/virtual/Demo.litsx",
    });

    assert.match(result.code, /fn\(\) \{\s*return html`<fancy-panel><\/fancy-panel>`;\s*\}/);
    assert.match(result.code, /return html`<section>\$\{\(\(\) => this\.fn\(\)\)\(\)\}<\/section>`;/);
  }, 20000);

  it("keeps direct local render helper calls working in child position, including arguments", () => {
    const source = [
      "export function Demo() {",
      "  const one = () => <fancy-panel />;",
      "  const many = (a, b, c) => <fancy-panel data-a={a} data-b={b} data-c={c} />;",
      "  return <section>{one()}{many(1, 2, 3)}</section>;",
      "}",
    ].join("\n");

    const result = transformLitsxSync(source, {
      filename: "/virtual/Demo.litsx",
    });

    assert.match(result.code, /one\(\) \{\s*return html`<fancy-panel><\/fancy-panel>`;\s*\}/);
    assert.match(result.code, /many\(a, b, c\) \{\s*return html`<fancy-panel data-a="\$\{a\}" data-b="\$\{b\}" data-c="\$\{c\}"><\/fancy-panel>`;\s*\}/);
    assert.match(result.code, /return html`<section>\$\{this\.one\(\)\}\$\{this\.many\(1, 2, 3\)\}<\/section>`;/);
  }, 20000);

  it("lowers capitalized JSX in lowercase helpers to equivalent html tags", () => {
    const source = [
      "import { LitsxButton } from './litsx-button.litsx';",
      "function renderButtonHeader() {",
      "  return <LitsxButton type=\"secondary\" label=\"Renderer returns component\" />;",
      "}",
      "export function Demo() {",
      "  return <section>{renderButtonHeader()}</section>;",
      "}",
    ].join("\n");

    const result = transformLitsxSync(source, {
      filename: "/virtual/Demo.litsx",
    });

    assert.match(result.code, /function renderButtonHeader\(\) \{\s*return html`<litsx-button type="secondary" label="Renderer returns component"><\/litsx-button>`;\s*\}/);
    assert.doesNotMatch(result.code, /html`\$\{LitsxButton\(/);
  }, 20000);

  it("lowers capitalized JSX in lowercase const helpers to equivalent html tags", () => {
    const source = [
      "import { LitsxButton } from './litsx-button.litsx';",
      "const renderButtonHeader = () => {",
      "  return <LitsxButton type=\"secondary\" label=\"Renderer returns component\" />;",
      "};",
      "export function Demo() {",
      "  return <section>{renderButtonHeader()}</section>;",
      "}",
    ].join("\n");

    const result = transformLitsxSync(source, {
      filename: "/virtual/Demo.litsx",
    });

    assert.match(result.code, /const renderButtonHeader = \(\) => \{\s*return html`<litsx-button type="secondary" label="Renderer returns component"><\/litsx-button>`;\s*\};/);
    assert.doesNotMatch(result.code, /html`\$\{LitsxButton\(/);
  }, 20000);

  it("materializes zero-arg inline thunks that return capitalized component JSX as equivalent html tags", () => {
    const source = [
      "import { LitsxButton } from './litsx-button.litsx';",
      "export function Demo() {",
      "  return <section>{() => <LitsxButton type=\"primary\" label=\"Inline thunk child\" />}</section>;",
      "}",
    ].join("\n");

    const result = transformLitsxSync(source, {
      filename: "/virtual/Demo.litsx",
    });

    assert.match(result.code, /return html`<section>\$\{\(\(\) => html`<litsx-button type="primary" label="Inline thunk child"><\/litsx-button>`\)\(\)\}<\/section>`;/);
  }, 20000);

  it("rewrites prop-backed renderer calls in JSX to renderRendererCall", () => {
    const source = [
      "export function Demo({ thunk }) {",
      "  return <section>{thunk('alpha')}</section>;",
      "}",
    ].join("\n");

    const result = transformLitsxSync(source, {
      filename: "/virtual/Demo.litsx",
      jsxTemplate: false,
    });

    assert.match(result.code, /import \{ renderRendererCall \} from "@litsx\/core\/rendering";/);
    assert.match(result.code, /return <section>\{renderRendererCall\(this\.thunk, 'alpha'\)\}<\/section>;/);
  }, 20000);

  it("binds renderer props that accept host-provided args and return component JSX", () => {
    const source = [
      "import { LitsxButton } from './litsx-button.litsx';",
      "export function ProbeHost({ itemRenderer }) {",
      "  return <section>{itemRenderer('alpha')}</section>;",
      "}",
      "export function Demo() {",
      "  return <ProbeHost .itemRenderer={(label) => <LitsxButton type=\"primary\" label={label} />} />;",
      "}",
    ].join("\n");

    const result = transformLitsxSync(source, {
      filename: "/virtual/Demo.litsx",
    });

    assert.match(result.code, /\.itemRenderer=\$\{bindRendererContext\(typeof this === "undefined" \? null : this,\s*label => html`<litsx-button type="primary" label="\$\{label\}"><\/litsx-button>`,\s*\{\s*projected: true\s*\}\)\}/);
    assert.match(result.code, /return html`<section>\$\{renderRendererCall\(this\.itemRenderer, 'alpha'\)\}<\/section>`;/);
    assert.match(result.code, /"litsx-button": LitsxButton/);
  }, 20000);

  it("binds transitive renderer helpers that return component JSX through wrapper functions", () => {
    const source = [
      "import { LitsxButton } from './litsx-button.litsx';",
      "function renderHeader() {",
      "  return <LitsxButton type=\"secondary\" label=\"Projected\" />;",
      "}",
      "function wrapHeader() {",
      "  return renderHeader();",
      "}",
      "export function Card({ header }) {",
      "  return <section>{header()}</section>;",
      "}",
      "export function Demo() {",
      "  return <Card .header={wrapHeader} />;",
      "}",
    ].join("\n");

    const result = transformLitsxSync(source, {
      filename: "/virtual/Demo.litsx",
    });

    assert.match(result.code, /function renderHeader\(\) \{\s*return html`<litsx-button type="secondary" label="Projected"><\/litsx-button>`;\s*\}/);
    assert.match(result.code, /\.header=\$\{bindRendererContext\(typeof this === "undefined" \? null : this,\s*wrapHeader,\s*\{\s*projected: true\s*\}\)\}/);
    assert.match(result.code, /return html`<section>\$\{renderRendererCall\(this\.header\)\}<\/section>`;/);
    assert.match(result.code, /"litsx-button": LitsxButton/);
  }, 20000);

  it("keeps renderer projection working in light DOM components", () => {
    const source = [
      "export function Card({ header }) {",
      "  static lightDom = true;",
      "  return <section>{header()}</section>;",
      "}",
      "export function Demo() {",
      "  return <Card .header={() => <fancy-panel />} />;",
      "}",
    ].join("\n");

    const result = transformLitsxSync(source, {
      filename: "/virtual/Demo.litsx",
    });

    assert.match(result.code, /class Card extends LightDomMixin\(LitElement\)/);
    assert.match(result.code, /\.header=\$\{bindRendererContext\(typeof this === "undefined" \? null : this,\s*\(\) => html`<fancy-panel><\/fancy-panel>`,\s*\{\s*projected: true\s*\}\)\}/);
    assert.match(result.code, /return html`<section>\$\{renderRendererCall\(this\.header\)\}<\/section>`;/);
  }, 20000);

  it("keeps renderer context through multiple container components", () => {
    const source = [
      "import { LitsxButton } from './litsx-button.litsx';",
      "export function Card({ header }) {",
      "  return <section>{header()}</section>;",
      "}",
      "export function Middle({ header }) {",
      "  return <Card .header={header} />;",
      "}",
      "function renderHeader() {",
      "  return <LitsxButton type=\"secondary\" label=\"Deep\" />;",
      "}",
      "export function Outer() {",
      "  return <Middle .header={renderHeader} />;",
      "}",
    ].join("\n");

    const result = transformLitsxSync(source, {
      filename: "/virtual/Demo.litsx",
    });

    assert.match(result.code, /<middle \.header=\$\{bindRendererContext\(typeof this === "undefined" \? null : this,\s*renderHeader,\s*\{\s*projected: true\s*\}\)\}><\/middle>/);
    assert.match(result.code, /<card \.header=\$\{this\.header\}><\/card>/);
    assert.match(result.code, /return html`<section>\$\{renderRendererCall\(this\.header\)\}<\/section>`;/);
    assert.match(result.code, /"litsx-button": LitsxButton/);
  }, 20000);

  it("supports slots and renderer props on the same component", () => {
    const source = [
      "import { LitsxButton } from './litsx-button.litsx';",
      "export function Shell({ header }) {",
      "  static lightDom = true;",
      "  return <section><header>{header()}</header><slot /></section>;",
      "}",
      "export function Demo() {",
      "  return <Shell .header={() => <LitsxButton type=\"primary\" label=\"Mixed\" />}>Body</Shell>;",
      "}",
    ].join("\n");

    const result = transformLitsxSync(source, {
      filename: "/virtual/Demo.litsx",
    });

    assert.match(result.code, /class Shell extends LightDomMixin\(LitElement\)/);
    assert.match(result.code, /<shell \.header=\$\{bindRendererContext\(typeof this === "undefined" \? null : this,\s*\(\) => html`<litsx-button type="primary" label="Mixed"><\/litsx-button>`,\s*\{\s*projected: true\s*\}\)\}>Body<\/shell>/);
    assert.match(result.code, /return html`<section><header>\$\{renderRendererCall\(this\.header\)\}<\/header><slot><\/slot><\/section>`;/);
    assert.match(result.code, /"litsx-button": LitsxButton/);
  }, 20000);

  it("does not rewrite ordinary callback props as renderer calls", () => {
    const source = [
      "export function Worker({ onResolve }) {",
      "  return <section>{[1, 2, 3].map(onResolve)}</section>;",
      "}",
    ].join("\n");

    const result = transformLitsxSync(source, {
      filename: "/virtual/Demo.litsx",
      jsxTemplate: false,
    });

    assert.doesNotMatch(result.code, /renderRendererCall/);
    assert.match(result.code, /return <section>\{\[1, 2, 3\]\.map\(this\.onResolve\)\}<\/section>;/);
  }, 20000);

  it("lowers renderer props that return mixed fragments with components", () => {
    const source = [
      "import { LitsxButton } from './litsx-button.litsx';",
      "export function Card({ header }) {",
      "  return <section>{header()}</section>;",
      "}",
      "export function Demo() {",
      "  return <Card .header={() => <><span>Lead</span><LitsxButton type=\"secondary\" label=\"Tail\" /></>} />;",
      "}",
    ].join("\n");

    const result = transformLitsxSync(source, {
      filename: "/virtual/Demo.litsx",
    });

    assert.match(result.code, /\.header=\$\{bindRendererContext\(typeof this === "undefined" \? null : this,\s*\(\) => html`<span>Lead<\/span><litsx-button type="secondary" label="Tail"><\/litsx-button>`,\s*\{\s*projected: true\s*\}\)\}/);
    assert.match(result.code, /return html`<section>\$\{renderRendererCall\(this\.header\)\}<\/section>`;/);
    assert.match(result.code, /"litsx-button": LitsxButton/);
  }, 20000);

  it("keeps lit-style attributes aligned in the final sourcemap", async () => {
    const source = [
      "export function Counter(){",
      "  return <button @click={save} .value={name} ?disabled={busy}>Hi</button>;",
      "}",
    ].join("\n");

    const result = await transformLitsx(source, {
      filename: "/virtual/Counter.tsx",
      sourceMaps: true,
    });

    assert.ok(result.map, "expected compiler to emit a sourcemap");
    const traceMap = new TraceMap(result.map);
    const checks = [
      ["@click", "@click"],
      [".value", ".value"],
      ["?disabled", "?disabled"],
    ];

    for (const [generatedNeedle, originalNeedle] of checks) {
      const generated = findPosition(result.code, generatedNeedle);
      const expected = findPosition(source, originalNeedle);
      const actual = originalPositionFor(traceMap, generated);

      assert.strictEqual(actual.source, "/virtual/Counter.tsx");
      assert.strictEqual(actual.line, expected.line);
      assert.strictEqual(actual.column, expected.column);
    }
  }, 30_000);

  it("can consume a shared TypeScript project session from typecheck for native typed compilation", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "litsx-shared-ts-session-"));
    const tsconfigPath = path.join(tempDir, "tsconfig.json");
    const typesPath = path.join(tempDir, "types.ts");
    const filePath = path.join(tempDir, "card.tsx");
    const source = [
      "import type { CardProps } from './types';",
      "export function Card({ title, active }: CardProps) {",
      "  return <article>{title}{active ? 'on' : 'off'}</article>;",
      "}",
    ].join("\n");

    fs.writeFileSync(
      tsconfigPath,
      JSON.stringify({
        compilerOptions: {
          jsx: "preserve",
          noEmit: true,
        },
        include: ["card.tsx", "types.ts"],
      }),
    );
    fs.writeFileSync(
      typesPath,
      [
        "export type CardProps = {",
        "  title: string;",
        "  active: boolean;",
        "};",
      ].join("\n"),
    );
    fs.writeFileSync(filePath, source);

    try {
      const sharedSession = createLitsxTypecheckSession(["--project", tsconfigPath]);

      const withSharedSession = transformLitsxSync(source, {
        filename: filePath,
        jsxTemplate: false,
        typescriptSession: sharedSession.projectSession,
      });
      const standalone = transformLitsxSync(source, {
        filename: filePath,
        jsxTemplate: false,
      });

      assert.strictEqual(withSharedSession.code, standalone.code);
      assert.match(withSharedSession.code, /title: \{\s*type: String\s*\}/);
      assert.match(withSharedSession.code, /active: \{\s*type: Boolean\s*\}/);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }, 20_000);

  it("surfaces metadata warnings when native className is authored", () => {
    const source = [
      "export const Counter = () => {",
      "  return <button className=\"cta\">Save</button>;",
      "};",
    ].join("\n");

    const result = transformLitsxSync(source, {
      filename: "/virtual/Counter.jsx",
    });

    assert.ok(Array.isArray(result.metadata.litsxWarnings));
    assert.strictEqual(result.metadata.litsxWarnings.length, 1);
    assert.strictEqual(result.metadata.litsxWarnings[0].code, "LITSX_NATIVE_CLASSNAME");
    assert.strictEqual(result.metadata.litsxWarnings[0].filename, "/virtual/Counter.jsx");
    assert.match(result.metadata.litsxWarnings[0].message, /is not native LitSX syntax/);
  }, 20000);

  it("surfaces metadata warnings when React memo wrappers are lowered away", () => {
    const source = [
      "import { memo } from 'react';",
      "const Counter = memo(({ label }) => {",
      "  return <button>{label}</button>;",
      "});",
    ].join("\n");

    const result = transformLitsxSync(source, {
      filename: "/virtual/Counter.jsx",
    });

    assert.ok(Array.isArray(result.metadata.litsxWarnings));
    assert.strictEqual(result.metadata.litsxWarnings.length, 1);
    assert.strictEqual(result.metadata.litsxWarnings[0].code, 91016);
    assert.match(result.metadata.litsxWarnings[0].message, /migration wrapper only/);
  }, 20000);

  it("throws when implicit children are used outside direct JSX child projection", () => {
    const source = [
      "export function Panel({ children }) {",
      "  const body = children;",
      "  return <section>{body}</section>;",
      "}",
    ].join("\n");

    assert.throws(
      () => {
        transformLitsxSync(source, {
          filename: "/virtual/ChildrenError.litsx",
        });
      },
      /Implicit `children` projection is only supported as a direct JSX child expression/
    );
  }, 20000);

  it("throws when implicit children projection is duplicated in one render", () => {
    const source = [
      "export function Panel({ children }) {",
      "  return <section>{children}{children}</section>;",
      "}",
    ].join("\n");

    assert.throws(
      () => {
        transformLitsxSync(source, {
          filename: "/virtual/ChildrenDuplicate.litsx",
        });
      },
      /Implicit `children` projection can only appear once per component render/
    );
  }, 20000);

  it("accepts static hoist assignments without surfacing deprecation warnings", () => {
    const source = [
      "export const Counter = () => {",
      "  static styles = `:host { display: block; }`;",
      "  return <button>Save</button>;",
      "};",
    ].join("\n");

    const result = transformLitsxSync(source, {
      filename: "/virtual/Counter.jsx",
    });

    assert.ok(Array.isArray(result.metadata.litsxWarnings));
    assert.ok(!result.metadata.litsxWarnings.some((warning) => warning.code === 91020));
  }, 20000);

  it("runs outputPlugins after the native preset pipeline", () => {
    const source = [
      "export const Counter = ({ label }) => {",
      "  return <button>{label}</button>;",
      "};",
    ].join("\n");

    const renameClassPlugin = () => ({
      visitor: {
        ClassDeclaration(path) {
          if (path.node.id?.name === "Counter") {
            path.node.id = t.identifier("CounterAfterNative");
          }
        },
      },
    });

    const result = transformLitsxSync(source, {
      filename: "/virtual/Counter.jsx",
      outputPlugins: [renameClassPlugin],
    });

    assert.match(result.code, /class CounterAfterNative extends LitElement/);
  }, 20000);

  it("runs outputPlugins before final TypeScript stripping", () => {
    const source = [
      "interface CounterProps {",
      "  label?: string;",
      "}",
      "type CounterVariant = \"primary\" | \"secondary\";",
      "export const Counter = ({ label = \"Save\" }: CounterProps) => {",
      "  return <button>{label}</button>;",
      "};",
    ].join("\n");

    const seenTypeDeclarations = [];
    const captureTypesPlugin = () => ({
      visitor: {
        TSInterfaceDeclaration(path) {
          seenTypeDeclarations.push(`interface:${path.node.id.name}`);
          path.insertAfter(
            t.variableDeclaration("const", [
              t.variableDeclarator(
                t.identifier("__sawInterfaceBeforeStrip"),
                t.booleanLiteral(true),
              ),
            ]),
          );
        },
        TSTypeAliasDeclaration(path) {
          seenTypeDeclarations.push(`type:${path.node.id.name}`);
          path.insertAfter(
            t.variableDeclaration("const", [
              t.variableDeclarator(
                t.identifier("__sawTypeAliasBeforeStrip"),
                t.booleanLiteral(true),
              ),
            ]),
          );
        },
      },
    });

    const result = transformLitsxSync(source, {
      filename: "/virtual/Counter.litsx",
      outputPlugins: [captureTypesPlugin],
    });

    assert.deepStrictEqual(seenTypeDeclarations, [
      "interface:CounterProps",
      "type:CounterVariant",
    ]);
    assert.match(result.code, /const __sawInterfaceBeforeStrip = true;/);
    assert.match(result.code, /const __sawTypeAliasBeforeStrip = true;/);
    assert.doesNotMatch(result.code, /interface CounterProps/);
    assert.doesNotMatch(result.code, /type CounterVariant/);
  }, 20000);

  it("lets outputPlugins inspect generic TypeScript syntax before final stripping", () => {
    const source = [
      "function identity<T>(value: T): T {",
      "  return value;",
      "}",
      "export const Counter = () => {",
      "  const label = identity<string>(\"Save\");",
      "  return <button>{label}</button>;",
      "};",
    ].join("\n");

    let sawTypeParameterDeclaration = false;
    let sawTypeParameterInstantiation = false;
    const captureGenericTypesPlugin = () => ({
      visitor: {
        FunctionDeclaration(path) {
          if (path.node.id?.name === "identity" && path.node.typeParameters) {
            sawTypeParameterDeclaration = true;
            path.insertBefore(
              t.variableDeclaration("const", [
                t.variableDeclarator(
                  t.identifier("__sawGenericDeclarationBeforeStrip"),
                  t.booleanLiteral(true),
                ),
              ]),
            );
          }
        },
        CallExpression(path) {
          if (
            path.node.callee?.type === "Identifier"
            && path.node.callee.name === "identity"
            && (path.node.typeParameters || path.node.typeArguments)
          ) {
            sawTypeParameterInstantiation = true;
            path.getStatementParent().insertBefore(
              t.variableDeclaration("const", [
                t.variableDeclarator(
                  t.identifier("__sawGenericInstantiationBeforeStrip"),
                  t.booleanLiteral(true),
                ),
              ]),
            );
          }
        },
      },
    });

    const result = transformLitsxSync(source, {
      filename: "/virtual/Counter.litsx",
      outputPlugins: [captureGenericTypesPlugin],
    });

    assert.strictEqual(sawTypeParameterDeclaration, true);
    assert.strictEqual(sawTypeParameterInstantiation, true);
    assert.match(result.code, /const __sawGenericDeclarationBeforeStrip = true;/);
    assert.match(result.code, /const __sawGenericInstantiationBeforeStrip = true;/);
    assert.doesNotMatch(result.code, /<T>/);
    assert.doesNotMatch(result.code, /identity<string>/);
  }, 20000);

  it("runs authoringPlugins before the native preset pipeline", () => {
    const source = [
      "export const Counter = ({ label }) => {",
      "  return <x-rename-tag>{label}</x-rename-tag>;",
      "};",
    ].join("\n");

    const renameIntrinsicPlugin = () => ({
      visitor: {
        JSXIdentifier(path) {
          if (
            path.node.name === "x-rename-tag" &&
            path.parent?.type === "JSXOpeningElement"
          ) {
            path.node.name = "button";
          }
          if (
            path.node.name === "x-rename-tag" &&
            path.parent?.type === "JSXClosingElement"
          ) {
            path.node.name = "button";
          }
        },
      },
    });

    const result = transformLitsxSync(source, {
      filename: "/virtual/Counter.jsx",
      authoringPlugins: [renameIntrinsicPlugin],
    });

    assert.match(result.code, /html`<button>\$\{this\.label\}<\/button>`/);
    assert.doesNotMatch(result.code, /x-rename-tag/);
  }, 20000);

  it("can skip final template lowering while preserving native class lowering", () => {
    const source = [
      "export const Counter = ({ label }) => {",
      "  return <button @click={save}>{label}</button>;",
      "};",
    ].join("\n");

    const result = transformLitsxSync(source, {
      filename: "/virtual/Counter.jsx",
      jsxTemplate: false,
    });

    assert.match(result.code, /class Counter extends LitElement/);
    assert.match(result.code, /return <button @click=\{save\}>\{this\.label\}<\/button>;/);
    assert.doesNotMatch(result.code, /html`/);
  }, 20000);

  it("preserves the raw Babel sourcemap when final template lowering is disabled", () => {
    const source = [
      "export const Counter = ({ label }) => {",
      "  return <button @click={save}>{label}</button>;",
      "};",
    ].join("\n");

    const result = transformLitsxSync(source, {
      filename: "/virtual/Counter.jsx",
      jsxTemplate: false,
      sourceMaps: true,
    });

    assert.ok(result.map);
    assert.strictEqual(result.map.version, 3);
    assert.ok(Array.isArray(result.map.sources));
    assert.ok(result.map.sources.includes("/virtual/Counter.jsx"));
  }, 20000);

  it("dedupes authored and plugin warnings while tolerating missing warning fields", () => {
    const source = [
      "export const Counter = () => {",
      "  return <button className=\"cta\">Save</button>;",
      "};",
    ].join("\n");

    const pluginWarnings = () => ({
      post(file) {
        file.metadata.litsxWarnings = [
          { attributeName: "className", tagName: "button" },
          { attributeName: "className", tagName: "button" },
        ];
      },
    });

    const result = transformLitsxSync(source, {
      filename: "/virtual/Counter.jsx",
      outputPlugins: [pluginWarnings],
    });

    assert.ok(Array.isArray(result.metadata.litsxWarnings));
    assert.strictEqual(result.metadata.litsxWarnings.length, 2);
    assert.strictEqual(
      result.metadata.litsxWarnings.filter((warning) => warning.code === "LITSX_NATIVE_CLASSNAME").length,
      1
    );
    assert.strictEqual(
      result.metadata.litsxWarnings.filter((warning) => warning.code === null).length,
      1
    );
    assert.ok(result.metadata.litsxWarnings.every((warning) => warning.filename === "/virtual/Counter.jsx"));
  }, 20000);

  it("reuses memoized preset plugins for repeated compiler calls with the same options object", () => {
    const source = [
      "export const Counter = ({ label }) => {",
      "  return <button>{label}</button>;",
      "};",
    ].join("\n");
    const options = {
      filename: "/virtual/Counter.jsx",
      jsxTemplate: false,
    };
    const presetSpy = vi.spyOn(presetModule, "createLitsxPresetPlugins");

    try {
      transformLitsxSync(source, options);
      transformLitsxSync(source, options);

      assert.strictEqual(presetSpy.mock.calls.length, 1);
    } finally {
      presetSpy.mockRestore();
    }
  }, 20_000);

  it("provides a reusable compilation session facade", async () => {
    const session = createLitsxCompilationSession({
      transformOptions: {
        jsxTemplate: false,
      },
    });
    const source = [
      "export const Counter = ({ label }) => {",
      "  return <button>{label}</button>;",
      "};",
    ].join("\n");

    try {
      const first = session.transformSync(source, {
        filename: "/virtual/Counter.jsx",
      });
      const second = await session.transform(source, {
        filename: "/virtual/Counter.jsx",
      });

      assert.strictEqual(first.code, second.code);
      assert.equal(typeof session.getTypecheckSession, "function");

      session.invalidate(["/virtual/Counter.jsx"]);

      const third = session.transformSync(source, {
        filename: "/virtual/Counter.jsx",
      });
      assert.strictEqual(third.code, first.code);
    } finally {
      session.dispose();
    }
  }, 20_000);

  it("clears compiler caches and overlay state when invalidating and disposing a session", () => {
    const session = createLitsxCompilationSession({
      transformOptions: {
        jsxTemplate: false,
      },
    });

    const invalidateSpy = vi.spyOn(session.typescriptSession, "invalidate");
    const clearOverlaySpy = vi.spyOn(session.typescriptSession, "clearOverlayFiles");

    session.sourceFeaturesCache.set("/virtual/a:src", {});
    session.authoredInputCache.set("/virtual/a:src", {});
    session.invalidate();

    assert.strictEqual(session.sourceFeaturesCache.size, 0);
    assert.strictEqual(session.authoredInputCache.size, 0);
    assert.deepStrictEqual(invalidateSpy.mock.calls[0], [{ host: true }]);

    session.dispose();

    expect(clearOverlaySpy).toHaveBeenCalledTimes(1);
    assert.strictEqual(session.typescriptSession, null);
  }, 20_000);

  it("invalidates the whole TypeScript session for authored source file extensions", () => {
    const session = createLitsxCompilationSession();
    const invalidateSpy = vi.spyOn(session.typescriptSession, "invalidate");

    session.sourceFeaturesCache.set("/virtual/demo.litsx:src", {});
    session.authoredInputCache.set("/virtual/demo.litsx:src", {});
    session.invalidate(["/virtual/demo.litsx"]);

    assert.strictEqual(session.sourceFeaturesCache.size, 0);
    assert.strictEqual(session.authoredInputCache.size, 0);
    expect(invalidateSpy).toHaveBeenCalledWith();

    session.dispose();
  }, 20_000);

  it("memoizes preset plugins per feature set for the same options object", () => {
    const plainSource = [
      "export const Counter = ({ label }) => {",
      "  return <button>{label}</button>;",
      "};",
    ].join("\n");
    const featureSource = [
      "import FancyButton from './FancyButton.js';",
      "import { useRef, useState } from '@litsx\/core';",
      "export function Counter({ label }) {",
      "  const ref = useRef(null);",
      "  const [count] = useState(0);",
      "  return <FancyButton ref={ref}>{label}{count}</FancyButton>;",
      "}",
    ].join("\n");
    const options = {
      filename: "/virtual/Counter.jsx",
      jsxTemplate: false,
    };
    const presetSpy = vi.spyOn(presetModule, "createLitsxPresetPlugins");

    try {
      transformLitsxSync(plainSource, options);
      transformLitsxSync(featureSource, options);
      transformLitsxSync(featureSource, options);

      assert.strictEqual(presetSpy.mock.calls.length, 2);
    } finally {
      presetSpy.mockRestore();
    }
  }, 20_000);

  it("skips template sourcemap patching when no template attribute mappings are emitted", () => {
    const source = [
      "export const Counter = () => {",
      "  return <button>Save</button>;",
      "};",
    ].join("\n");
    const patchSpy = vi.spyOn(jsxTemplateModule, "patchLitAttributeSourcemap");

    try {
      const result = transformLitsxSync(source, {
        filename: "/virtual/Counter.jsx",
        sourceMaps: true,
      });

      assert.ok(result.map);
      assert.strictEqual(patchSpy.mock.calls.length, 0);
    } finally {
      patchSpy.mockRestore();
    }
  }, 20_000);
});
