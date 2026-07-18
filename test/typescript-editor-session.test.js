import assert from "assert";
import fs from "fs";
import os from "os";
import path from "path";
import ts from "typescript";
import { describe, it } from "vitest";

import { createLitsxEditorSession } from "../packages/typescript/src/editor-session.js";

const COMPLETION_KINDS = {
  Keyword: 14,
  Variable: 6,
  Property: 10,
  Function: 3,
  Class: 7,
  Interface: 8,
  Module: 9,
  Text: 0,
  Event: 23,
};

function createTempDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, JSON.stringify(value));
}

function createProjectSessionFixture({
  prefix,
  compilerOptions,
  include,
  files,
  sessionOptions = {},
  linkCorePackage = false,
}) {
  const tempDir = createTempDir(prefix);

  if (linkCorePackage) {
    const packageDir = path.join(tempDir, "node_modules", "@litsx");
    fs.mkdirSync(packageDir, { recursive: true });
    fs.symlinkSync(path.join(process.cwd(), "packages", "core"), path.join(packageDir, "core"), "dir");
  }

  writeJson(path.join(tempDir, "tsconfig.json"), {
    compilerOptions,
    include,
  });

  for (const [relativePath, sourceText] of Object.entries(files)) {
    const filePath = path.join(tempDir, relativePath);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, sourceText);
  }

  return {
    tempDir,
    session: createLitsxEditorSession({
      typescript: ts,
      ...sessionOptions,
    }),
    resolve(relativePath) {
      return path.join(tempDir, relativePath);
    },
  };
}

describe("@litsx/typescript editor-session", () => {
  it("uses the injected TypeScript module", () => {
    const session = createLitsxEditorSession({
      typescript: ts,
    });

    assert.strictEqual(session.typescript, ts);
  });

  it("supports trace loggers, bundled lib fallback, completion adapters, and cache clearing", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "litsx-editor-session-options-"));
    const bundledLibDir = path.join(tempDir, "lib");
    const filePath = path.join(tempDir, "plain.jsx");
    const sourceText = "const view = <button  />;\n";
    const logs = [];

    fs.mkdirSync(bundledLibDir, { recursive: true });
    fs.writeFileSync(path.join(bundledLibDir, ts.getDefaultLibFileName({})), "", "utf8");
    fs.writeFileSync(filePath, sourceText);

    const session = createLitsxEditorSession({
      typescript: ts,
      bundledLibDir,
      trace: true,
      logger: {
        appendLine(message) {
          logs.push(message);
        },
      },
    });

    const hover = session.getHover(filePath, sourceText, "jsx", sourceText.indexOf("view") + 1);
    const completions = session.getCompletions(
      filePath,
      sourceText,
      "jsx",
      sourceText.indexOf("<button ") + "<button ".length,
      (kind, context) => `${kind}:${context?.source ?? "none"}`,
    );

    assert.deepStrictEqual(logs, ["LitSX editor session initialized"]);
    assert.match(hover.markdown, /```jsx/);
    assert.ok(completions.some((entry) => (
      entry.label === "class" &&
      entry.kind === "Property:litsx-markup"
    )));
    session.clear();
    assert.ok(session.getDiagnostics(filePath, sourceText, "jsx").length >= 0);
  }, 15000);

  it("covers jsconfig projects, logger functions, and transparent extensionless resolution", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "litsx-editor-session-jsconfig-"));
    const bundledLibDir = path.join(tempDir, "missing-libs");
    const srcDir = path.join(tempDir, "src");
    const libDir = path.join(srcDir, "lib");
    const filePath = path.join(srcDir, "component.litsx.jsx");
    const plainTsPath = path.join(srcDir, "plain.ts");
    const logs = [];

    fs.mkdirSync(libDir, { recursive: true });
    fs.writeFileSync(
      path.join(tempDir, "jsconfig.json"),
      JSON.stringify({
        compilerOptions: {
          jsx: "preserve",
          target: "ES2022",
          module: "ESNext",
          checkJs: true,
        },
        include: ["src/**/*"],
      }),
    );
    fs.writeFileSync(path.join(libDir, "index.ts"), "export const label: string = 'ready';\n");
    fs.writeFileSync(path.join(srcDir, "helper.js"), "export const count = 1;\n");
    fs.writeFileSync(plainTsPath, "export const typed = 1;\n");

    const sourceText = [
      "import { label } from './lib';",
      "import { count } from './helper';",
      "const view = <button title={label}>{count}</button>;",
      "",
    ].join("\n");
    fs.writeFileSync(filePath, sourceText);

    const session = createLitsxEditorSession({
      typescript: ts,
      bundledLibDir,
      trace: true,
      logger(message) {
        logs.push(message);
      },
    });

    assert.deepStrictEqual(logs, ["LitSX editor session initialized"]);
    assert.deepStrictEqual(
      session.getDiagnostics(filePath, sourceText, "litsx-jsx").filter((diagnostic) => diagnostic.code === 2307),
      [],
    );
    assert.deepStrictEqual(
      session.getDiagnostics(plainTsPath, "export const typed = 1;\n", "typescript"),
      [],
    );
  }, 15000);

  it("uses standalone sessions without a logger and falls back for missing files", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "litsx-editor-session-standalone-"));
    const filePath = path.join(tempDir, "standalone.js");
    const sourceText = "const value = 1;\nvalue;\n";

    const session = createLitsxEditorSession({
      typescript: ts,
      trace: true,
    });

    const diagnostics = session.getDiagnostics(filePath, sourceText, "javascript");
    const hover = session.getHover(filePath, sourceText, "javascript", sourceText.indexOf("value") + 1);
    const completions = session.getCompletions(
      filePath,
      sourceText,
      "javascript",
      sourceText.length,
      null,
    );

    assert.deepStrictEqual(diagnostics, []);
    assert.match(hover.markdown, /```ts/);
    assert.ok(completions.some((entry) => entry.label === "value"));
  }, 15000);

  it("provides project-backed diagnostics, resolution, and intrinsic completions", () => {
    const fixture = createProjectSessionFixture({
      prefix: "litsx-editor-session-project-backed-",
      compilerOptions: {
        jsx: "preserve",
        target: "ES2022",
        module: "ESNext",
        strict: true,
      },
      include: ["*.litsx"],
      files: {
        "component-basic.litsx": [
          "const count: number = 1;",
          "const broken: number = 'nope';",
          "const view = <button @cl>{cou}</button>;",
          "",
        ].join("\n"),
        "litsx-button.litsx": [
          'export const buttonLabel = "Primary";',
          "",
        ].join("\n"),
        "component-resolve.litsx": [
          'import { buttonLabel } from "./litsx-button";',
          'import { wrongButtonLabel } from "./litsx-button.litsx.jsx";',
          "const view = <input .valuee={buttonLabel} @cl />;",
          "wrongButtonLabel;",
          "",
        ].join("\n"),
        "component-markup.litsx": "const view = <button  />;\n",
        "component-click.litsx": [
          "const count = 1;",
          "const view = <input .value={count} @click={() => count.toFixed()} ?disabled />;",
          "",
        ].join("\n"),
        "component-after-handler.litsx": [
          "const count = 1;",
          "const view = <input .value={count} @click={() => count.toFixed()}  />;",
          "",
        ].join("\n"),
      },
    });

    const basicPath = fixture.resolve("component-basic.litsx");
    const basicSource = fs.readFileSync(basicPath, "utf8");
    const basicDiagnostics = fixture.session.getDiagnostics(basicPath, basicSource, "litsx");
    const basicHover = fixture.session.getHover(
      basicPath,
      basicSource,
      "litsx",
      basicSource.indexOf("count") + 1,
    );
    const basicCompletions = fixture.session.getCompletions(
      basicPath,
      basicSource,
      "litsx",
      basicSource.indexOf("@cl") + 3,
      COMPLETION_KINDS,
    );

    assert.ok(basicDiagnostics.some((diagnostic) => diagnostic.code === 2322));
    assert.match(basicHover.code, /const count: number/);
    assert.match(basicHover.markdown, /```tsx/);
    assert.match(basicHover.markdown, /const count: number/);
    assert.ok(basicCompletions.some((entry) => entry.label === "@click" && entry.kind === 23));
    const clickCompletion = basicCompletions.find((entry) => entry.label === "@click");
    assert.strictEqual(clickCompletion.insertText, "click");
    assert.strictEqual(clickCompletion.filterText, "click");

    const resolvePath = fixture.resolve("component-resolve.litsx");
    const resolveSource = fs.readFileSync(resolvePath, "utf8");
    const resolveDiagnostics = fixture.session.getDiagnostics(resolvePath, resolveSource, "litsx");
    const resolveCompletions = fixture.session.getCompletions(
      resolvePath,
      resolveSource,
      "litsx",
      resolveSource.indexOf("@cl") + 3,
      COMPLETION_KINDS,
    );

    assert.ok(resolveDiagnostics.some((diagnostic) => diagnostic.code === 91004));
    assert.ok(
      resolveDiagnostics.some((diagnostic) => (
        diagnostic.code === 2307 &&
        String(diagnostic.messageText).includes("./litsx-button.litsx.jsx")
      )),
    );
    assert.ok(resolveCompletions.every((entry) => !entry.label.startsWith("__litsx_")));

    const markupPath = fixture.resolve("component-markup.litsx");
    const markupSource = fs.readFileSync(markupPath, "utf8");
    const markupCompletions = fixture.session.getCompletions(
      markupPath,
      markupSource,
      "litsx",
      markupSource.indexOf("<button ") + "<button ".length,
      COMPLETION_KINDS,
    );

    assert.deepStrictEqual(
      markupCompletions.slice(0, 8).map((entry) => entry.label),
      ["class", "id", "title", "style", "role", "slot", "part", "tabIndex"],
    );
    assert.ok(markupCompletions.some((entry) => entry.label === "@click"));
    assert.ok(markupCompletions.some((entry) => entry.label === "?disabled"));
    assert.ok(!markupCompletions.some((entry) => entry.label === "_currentTarget"));
    assert.ok(!markupCompletions.some((entry) => entry.label === "addEventListener"));

    const clickPath = fixture.resolve("component-click.litsx");
    const clickSource = fs.readFileSync(clickPath, "utf8");
    const clickDiagnostics = fixture.session.getDiagnostics(clickPath, clickSource, "litsx");

    assert.ok(!clickDiagnostics.some((diagnostic) => diagnostic.code === 91006));

    const afterHandlerPath = fixture.resolve("component-after-handler.litsx");
    const afterHandlerSource = fs.readFileSync(afterHandlerPath, "utf8");
    const afterHandlerCompletions = fixture.session.getCompletions(
      afterHandlerPath,
      afterHandlerSource,
      "litsx",
      afterHandlerSource.indexOf("/>") - 1,
      COMPLETION_KINDS,
    );

    assert.ok(afterHandlerCompletions.some((entry) => entry.label === "@click"));
    assert.ok(afterHandlerCompletions.some((entry) => entry.label === "?disabled"));
    assert.ok(afterHandlerCompletions.some((entry) => entry.label === "class"));
  }, 15000);

  it("surfaces imported component props and events in opening tags", () => {
    const fixture = createProjectSessionFixture({
      prefix: "litsx-editor-session-component-metadata-",
      compilerOptions: {
        jsx: "react-jsx",
        jsxImportSource: "@litsx/core",
        target: "ES2022",
        module: "ESNext",
        strict: true,
        moduleResolution: "Bundler",
        allowArbitraryExtensions: true,
      },
      include: ["*.litsx"],
      files: {
        "typed-button.litsx": "export const TypedButton = ({ kind = 'primary', disabled = false, count = 0 } = {}) => <button>{kind}{count}</button>;\n",
        "typed-consumer.litsx": [
          'import { TypedButton } from "./typed-button.litsx";',
          "const view = <TypedButton  />;",
          "",
        ].join("\n"),
        "static-button.litsx": [
          "export const StaticButton = () => {",
          "  static properties = {",
          "    label: { type: String },",
          "    kind: { type: String },",
          "    disabled: { type: Boolean },",
          "  };",
          "  return <button />;",
          "};",
          "",
        ].join("\n"),
        "static-consumer.litsx": [
          'import { StaticButton } from "./static-button.litsx";',
          "const view = <StaticButton  />;",
          "",
        ].join("\n"),
        "messages-hook.litsx": [
          'import { defineHook } from "@litsx/core";',
          "",
          "export const useMessages = defineHook({",
          "  props(_host, _state, next) {",
          "    return {",
          "      ...next(),",
          "      messages: { attribute: false },",
          "      locale: { reflect: true },",
          "    };",
          "  },",
          "});",
          "",
        ].join("\n"),
        "hook-button.litsx": [
          'import { useMessages } from "./messages-hook.litsx";',
          "",
          "export const HookButton = () => {",
          "  useMessages();",
          "  return <button />;",
          "};",
          "",
        ].join("\n"),
        "hook-consumer.litsx": [
          'import { HookButton } from "./hook-button.litsx";',
          "const view = <HookButton  />;",
          "",
        ].join("\n"),
        "event-button.litsx": [
          'import { useEmit } from "@litsx/core";',
          "",
          "export const EventButton = () => {",
          "  const emit = useEmit();",
          '  emit("primary-action");',
          '  emit("secondary-action");',
          "  return <button />;",
          "};",
          "",
        ].join("\n"),
        "event-consumer.litsx": [
          'import { EventButton } from "./event-button.litsx";',
          "const view = <EventButton @pr />;",
          "",
        ].join("\n"),
      },
    });

    const typedConsumerPath = fixture.resolve("typed-consumer.litsx");
    const typedConsumerSource = fs.readFileSync(typedConsumerPath, "utf8");
    const typedCompletions = fixture.session.getCompletions(
      typedConsumerPath,
      typedConsumerSource,
      "litsx",
      typedConsumerSource.indexOf("<TypedButton ") + "<TypedButton ".length,
      COMPLETION_KINDS,
    );

    assert.deepStrictEqual(
      typedCompletions.slice(0, 3).map((entry) => entry.label),
      ["count", "disabled", "kind"],
    );

    const staticConsumerPath = fixture.resolve("static-consumer.litsx");
    const staticConsumerSource = fs.readFileSync(staticConsumerPath, "utf8");
    const staticCompletions = fixture.session.getCompletions(
      staticConsumerPath,
      staticConsumerSource,
      "litsx",
      staticConsumerSource.indexOf("<StaticButton ") + "<StaticButton ".length,
      COMPLETION_KINDS,
    );

    assert.ok(staticCompletions.some((entry) => entry.label === "label"));
    assert.ok(staticCompletions.some((entry) => entry.label === "kind"));
    assert.ok(staticCompletions.some((entry) => entry.label === "disabled"));

    const hookConsumerPath = fixture.resolve("hook-consumer.litsx");
    const hookConsumerSource = fs.readFileSync(hookConsumerPath, "utf8");
    const hookCompletions = fixture.session.getCompletions(
      hookConsumerPath,
      hookConsumerSource,
      "litsx",
      hookConsumerSource.indexOf("<HookButton ") + "<HookButton ".length,
      COMPLETION_KINDS,
    );

    assert.ok(hookCompletions.some((entry) => entry.label === "messages"));
    assert.ok(hookCompletions.some((entry) => entry.label === "locale"));

    const eventConsumerPath = fixture.resolve("event-consumer.litsx");
    const eventConsumerSource = fs.readFileSync(eventConsumerPath, "utf8");
    const eventCompletions = fixture.session.getCompletions(
      eventConsumerPath,
      eventConsumerSource,
      "litsx",
      eventConsumerSource.indexOf("@pr") + 3,
      COMPLETION_KINDS,
    );

    assert.ok(eventCompletions.some((entry) => entry.label === "@primary-action"));
    assert.ok(!eventCompletions.some((entry) => entry.label === "@secondary-action"));
  }, 15000);

  it("prioritizes @litsx/core exports over noisy globals in component bodies", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "litsx-editor-session-uses-"));
    const packageDir = path.join(tempDir, "node_modules", "@litsx");
    const filePath = path.join(tempDir, "component.litsx");
    const sourceText = "export function Component() { useS }\n";

    fs.mkdirSync(packageDir, { recursive: true });
    fs.symlinkSync(path.join(process.cwd(), "packages", "core"), path.join(packageDir, "core"), "dir");
    fs.writeFileSync(
      path.join(tempDir, "tsconfig.json"),
      JSON.stringify({
        compilerOptions: {
          jsx: "react-jsx",
          jsxImportSource: "@litsx/core",
          target: "ES2022",
          module: "ESNext",
          moduleResolution: "Bundler",
          allowArbitraryExtensions: true,
        },
        include: ["component.litsx"],
      }),
    );
    fs.writeFileSync(filePath, sourceText);

    const session = createLitsxEditorSession({ typescript: ts });
    const completions = session.getCompletions(
      filePath,
      sourceText,
      "litsx",
      sourceText.indexOf("useS") + 4,
      COMPLETION_KINDS,
    );

    const topTen = completions.slice(0, 10).map((entry) => entry.label);
    assert.ok(topTen.includes("useState"));
    assert.ok(topTen.every((label) => label.startsWith("use")));
    assert.ok(completions.findIndex((entry) => entry.label === "useState") < completions.findIndex((entry) => entry.label === "AbortController"));
    const useStateCompletion = completions.find((entry) => entry.label === "useState");
    assert.ok(useStateCompletion.additionalTextEdits?.some((edit) => (
      edit.newText.includes('import { useState } from "@litsx/core";')
    )));
    assert.ok(!completions.some((entry) => entry.label === "__litsx_static_styles"));
  }, 15000);

  it("surfaces jsxImportSource exports for bare use-prefix completions", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "litsx-editor-session-demo-"));
    const packageDir = path.join(tempDir, "node_modules", "@litsx");
    const filePath = path.join(tempDir, "component.litsx");
    const sourceText = [
      "const count = 1;",
      "",
      "function Demo() {",
      "  static styles = `:host { display: block; }`;",
      "",
      "  use",
      "  ",
      "  return <input .value={count} @click={() => count.toFixed()} ?disabled />;",
      "}",
      "",
    ].join("\n");

    fs.mkdirSync(packageDir, { recursive: true });
    fs.symlinkSync(path.join(process.cwd(), "packages", "core"), path.join(packageDir, "core"), "dir");
    fs.writeFileSync(
      path.join(tempDir, "tsconfig.json"),
      JSON.stringify({
        compilerOptions: {
          jsx: "react-jsx",
          jsxImportSource: "@litsx/core",
          target: "ES2022",
          module: "ESNext",
          moduleResolution: "Bundler",
          allowArbitraryExtensions: true,
        },
        include: ["component.litsx"],
      }),
    );
    fs.writeFileSync(filePath, sourceText);

    const session = createLitsxEditorSession({ typescript: ts });
    const completions = session.getCompletions(
      filePath,
      sourceText,
      "litsx",
      sourceText.indexOf("use") + 3,
      COMPLETION_KINDS,
    );

    const topTwenty = completions.slice(0, 20).map((entry) => entry.label);
    assert.ok(topTwenty.includes("useHost"));
    assert.ok(topTwenty.includes("useFormValue"));
    assert.ok(topTwenty.every((label) => label.startsWith("use")));
    assert.ok(completions.findIndex((entry) => entry.label === "useState") < completions.findIndex((entry) => entry.label === "UserActivation"));
  }, 15000);

  it("does not report editor false positives for authored LitSX components", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "litsx-editor-session-authored-"));
    const packageDir = path.join(tempDir, "node_modules", "@litsx");
    const filePath = path.join(tempDir, "components.litsx");
    const sourceText = [
      'import { useState } from "@litsx/core";',
      "",
      'export function DemoLeaf({ label = "Counter", initialCount = 0 }) {',
      '  static styles = `button { border-radius: 8px; }`;',
      '  const [count, setCount] = useState(initialCount);',
      '  return <button @click={() => setCount(count + 1)}>{label}: {count}</button>;',
      "}",
      "",
      'export function DemoMetricRow({ label = "Depth", children }) {',
      "  return <p><strong>{label}</strong>{children}</p>;",
      "}",
      "",
      "export function DemoPanel({ children }) {",
      "  static lightDom = true;",
      "  return <section>{children}</section>;",
      "}",
      "",
      'export function DemoApp({ title = "SSR" }) {',
      "  static lightDom = true;",
      "  return (",
      "    <DemoPanel>",
      "      <h1>{title}</h1>",
      '      <DemoMetricRow label="Level">5</DemoMetricRow>',
      '      <DemoLeaf initialCount={4} />',
      "    </DemoPanel>",
      "  );",
      "}",
      "",
    ].join("\n");

    fs.mkdirSync(packageDir, { recursive: true });
    fs.symlinkSync(path.join(process.cwd(), "packages", "core"), path.join(packageDir, "core"), "dir");
    fs.writeFileSync(
      path.join(tempDir, "tsconfig.json"),
      JSON.stringify({
        compilerOptions: {
          jsx: "react-jsx",
          jsxImportSource: "@litsx/core",
          target: "ES2022",
          module: "ESNext",
          moduleResolution: "Bundler",
          allowArbitraryExtensions: true,
          strict: true,
        },
        include: ["components.litsx"],
      }),
    );
    fs.writeFileSync(filePath, sourceText);

    const session = createLitsxEditorSession({ typescript: ts });
    const diagnostics = session.getDiagnostics(filePath, sourceText, "litsx");
    const diagnosticCodes = diagnostics.map((diagnostic) => diagnostic.code);

    assert.ok(!diagnosticCodes.includes(2554));
    assert.ok(!diagnosticCodes.includes(2322));
    assert.ok(!diagnosticCodes.includes(7031));
    assert.ok(diagnosticCodes.includes(91020));
    assert.ok(!diagnosticCodes.includes(91009));
  }, 15000);

  it("does not report duplicate static hoists for the ssr hydration component tree", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "litsx-editor-session-ssr-hydration-"));
    const packageDir = path.join(tempDir, "node_modules", "@litsx");
    const filePath = path.join(tempDir, "components.litsx");
    const sourceText = [
      'import { useMemoValue, useState } from "@litsx/core";',
      "",
      'export function DemoLeaf({ label, initialCount = 0 }) {',
      "  static styles = `",
      "    :host {",
      "      display: inline-block;",
      "    }",
      "",
      "    button {",
      "      border: 0;",
      "    }",
      "  `;",
      "",
      "  const [count, setCount] = useState(initialCount);",
      "  const buttonLabel = useMemoValue(() => `${label}: ${count}`, [label, count]);",
      "  return <button @click={() => setCount((value) => value + 1)}>{buttonLabel}</button>;",
      "}",
      "",
      "export function DemoMetricRow({ label, initialCount }) {",
      "  static lightDom = true;",
      "  return (",
      "    <article>",
      "      <DemoLeaf label={label} initialCount={initialCount} />",
      "    </article>",
      "  );",
      "}",
      "",
      "export function DemoPanel({ label, initialCount, children }) {",
      "  static styles = `",
      "    :host {",
      "      display: block;",
      "    }",
      "  `;",
      "  return (",
      "    <section>",
      "      <slot></slot>",
      "      <DemoMetricRow label={label} initialCount={initialCount} />",
      "    </section>",
      "  );",
      "}",
      "",
      "export function DemoContent({ label, initialCount }) {",
      "  static lightDom = true;",
      "  return (",
      "    <div>",
      "      <DemoPanel label={label} initialCount={initialCount}>",
      "        <p>{label}</p>",
      "      </DemoPanel>",
      "    </div>",
      "  );",
      "}",
      "",
      'export function DemoApp({ title = "LitSX SSR", initialCount = 0 }) {',
      "  static styles = `",
      "    :host {",
      "      display: block;",
      "    }",
      "  `;",
      "  const [currentTitle] = useState(title);",
      "  return (",
      "    <section>",
      "      <h1>{currentTitle}</h1>",
      '      <DemoContent label="Hydrated counter" initialCount={initialCount} />',
      "    </section>",
      "  );",
      "}",
      "",
    ].join("\n");

    fs.mkdirSync(packageDir, { recursive: true });
    fs.symlinkSync(path.join(process.cwd(), "packages", "core"), path.join(packageDir, "core"), "dir");
    fs.writeFileSync(
      path.join(tempDir, "tsconfig.json"),
      JSON.stringify({
        compilerOptions: {
          jsx: "react-jsx",
          jsxImportSource: "@litsx/core",
          target: "ES2022",
          module: "ESNext",
          moduleResolution: "Bundler",
          allowArbitraryExtensions: true,
          strict: true,
        },
        include: ["components.litsx"],
      }),
    );
    fs.writeFileSync(filePath, sourceText);

    const session = createLitsxEditorSession({ typescript: ts });
    const diagnostics = session.getDiagnostics(filePath, sourceText, "litsx");
    const diagnosticCodes = diagnostics.map((diagnostic) => diagnostic.code);

    assert.ok(!diagnosticCodes.includes(91009));
  }, 15000);

  it("suppresses customElements.define false positives for imported .litsx components", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "litsx-editor-session-story-"));
    const componentFilePath = path.join(tempDir, "button.litsx");
    const storyFilePath = path.join(tempDir, "button.stories.litsx");

    fs.writeFileSync(
      path.join(tempDir, "tsconfig.json"),
      JSON.stringify({
        compilerOptions: {
          jsx: "react-jsx",
          jsxImportSource: "@litsx/core",
          target: "ES2022",
          module: "ESNext",
        },
        include: ["*.litsx"],
      }),
    );
    fs.writeFileSync(
      componentFilePath,
      [
        "export const LitsxButton = ({ label = '' } = {}) => {",
        "  return <button>{label}</button>;",
        "};",
        "",
      ].join("\n"),
    );
    const storySource = [
      'import { LitsxButton } from "./button.litsx";',
      "",
      'if (!customElements.get("litsx-button")) {',
      '  customElements.define("litsx-button", LitsxButton);',
      "}",
      "",
    ].join("\n");
    fs.writeFileSync(storyFilePath, storySource);

    const session = createLitsxEditorSession({ typescript: ts });
    const diagnostics = session.getDiagnostics(storyFilePath, storySource, "litsx");

    assert.ok(!diagnostics.some((diagnostic) => diagnostic.code === 2345));
  }, 15000);
});
