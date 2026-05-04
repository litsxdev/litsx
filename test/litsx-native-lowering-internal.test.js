import assert from "assert";
import fs from "fs";
import os from "os";
import path from "path";
import babelCore from "@babel/core";
import parser from "../packages/babel-parser-litsx/src/index.mjs";
import { beforeAll, describe, it } from 'vitest';
import { interopDefault } from "./helpers/interop-default.js";

const { transformFromAstSync } = babelCore;
let nativePreset;

function transformWithNativePreset(source) {
  const inputAst = parser.parse(source, { sourceType: "module" });
  return transformFromAstSync(inputAst, source, {
    configFile: false,
    babelrc: false,
    presets: [[nativePreset, { jsxTemplate: false }]],
  });
}

beforeAll(async () => {
  const mod = await import("../packages/babel-preset-litsx/src/index.js");
  nativePreset = interopDefault(mod);
});

describe("@litsx/babel-preset-litsx native lowering internals", () => {
  it("treats native ref props as component-instance refs by default", () => {
    const source = [
      "const SearchPanel = ({ title, ref }) => {",
      "  return <section>{title}</section>;",
      "};",
    ].join("\n");

    const { code } = transformWithNativePreset(source);

    assert.match(code, /class SearchPanel extends LitElement/);
    assert.match(
      code,
      /static properties = \{[\s\S]*title: \{[\s\S]*type: String[\s\S]*ref: \{[\s\S]*type: Object[\s\S]*attribute: false/s
    );
    assert.match(code, /useCallbackRef\(this, \(\) => this,/);
    assert.doesNotMatch(code, /data-ref="_refElement"/);
  });

  it("forwards native ref props transitively through component children", () => {
    const source = [
      "const SearchField = ({ ref }) => {",
      "  return <input ref={ref} />;",
      "};",
      "",
      "const SearchShell = ({ ref }) => {",
      "  return <SearchField ref={ref} />;",
      "};",
    ].join("\n");

    const { code } = transformWithNativePreset(source);

    assert.match(code, /class SearchField extends LitElement/);
    assert.match(code, /class SearchShell extends (?:ShadowDomElementsMixin\(LitElement\)|LitElement)/);
    assert.match(code, /<input data-ref="_refElement" \/>/);
    assert.match(code, /useCallbackRef\(this, \(\) => this\.renderRoot\?\./);
    assert.match(code, /<(?:search-field|SearchField) ref=\{this\.ref\} \/>/);
  });

  it("detects native ref props through defaulted destructuring and string keys", () => {
    const source = [
      "const SearchPanel = ({ title, 'ref': forwardedRef } = {}) => {",
      "  return <input ref={forwardedRef} aria-label={title} />;",
      "};",
    ].join("\n");

    const { code } = transformWithNativePreset(source);

    assert.match(code, /class SearchPanel extends LitElement/);
    assert.match(code, /prepareEffects\(this\);/);
    assert.match(code, /useCallbackRef\(this, \(\) => this,/);
    assert.match(code, /return <input ref=\{forwardedRef\} aria-label=\{title\} \/>;/);
  });

  it("detects native ref props through identifier props access and skips non-standard tags", () => {
    const source = [
      "const SearchPanel = (props) => {",
      "  return (",
      "    <section>",
      "      <WidgetBox ref={props.ref} />",
      "      <input ref={props.ref} />",
      "    </section>",
      "  );",
      "};",
    ].join("\n");

    const { code } = transformWithNativePreset(source);

    assert.match(code, /class SearchPanel extends (?:ShadowDomElementsMixin\(LitElement\)|LitElement)/);
    assert.match(
      code,
      /static properties = \{[\s\S]*ref: \{[\s\S]*type: String[\s\S]*attribute: false/s
    );
    assert.match(code, /<WidgetBox ref=\{this\.ref\} \/>/);
    assert.match(code, /<input data-ref="_refElement" \/>/);
    const useCallbackRefMatches = code.match(/useCallbackRef\(this, \(\) => this\.renderRoot\?\./g) || [];
    assert.strictEqual(useCallbackRefMatches.length, 1);
  });

});

describe("@litsx/babel-preset-litsx native authored coverage", () => {

  it("converts arrow functions into LitElement classes", () => {
    const source = `
      const Greeting = ({ name, count }) => {
        const doubled = count * 2;
        return <p>{name} {doubled}</p>;
      };
    `;

    const { code } = transformWithNativePreset(source);

    const ast = parser.parse(code, { sourceType: "module" });

    const importDecl = ast.program.body.find(
      (node) => node.type === "ImportDeclaration" && node.source.value === "lit"
    );
    assert(importDecl, "expected lit import to be added");

    const classDecl = ast.program.body.find((node) => node.type === "ClassDeclaration");
    assert(classDecl, "expected a generated class declaration");
    assert.strictEqual(classDecl.superClass.name, "LitElement");

    const propertiesField = classDecl.body.body.find(
      (member) => member.type === "ClassProperty" && member.key.name === "properties"
    );
    assert(propertiesField, "expected properties static field");
    assert(propertiesField.static, "properties field should be static");

    const propertyNames = propertiesField.value.properties.map((prop) => prop.key.name);
    assert.deepStrictEqual(propertyNames.sort(), ["count", "name"]);

    const renderMethod = classDecl.body.body.find(
      (member) => member.type === "ClassMethod" && member.key.name === "render"
    );
    assert(renderMethod, "expected render method to be emitted");

    const returnStatement = renderMethod.body.body.find((stmt) => stmt.type === "ReturnStatement");
    assert(returnStatement, "render method should contain a return statement");
  });

  it("converts named function exports", () => {
    const source = `
      export function AlertBanner({ message, level }) {
        const upper = level.toUpperCase();
        return (
          <div class={level}>
            <span>{message}</span>
            <small>{upper}</small>
          </div>
        );
      }
    `;

    const inputAst = parser.parse(source, { sourceType: "module" });
    const { code } = transformFromAstSync(inputAst, source, {
      configFile: false,
      babelrc: false,
      presets: [[nativePreset, { jsxTemplate: false }]],
    });

    const ast = parser.parse(code, { sourceType: "module" });
    const litImport = ast.program.body.find(
      (node) => node.type === "ImportDeclaration" && node.source.value === "lit"
    );
    assert(litImport, "expected lit import to be added for named export");

    const exportDecl = ast.program.body.find(
      (node) =>
        node.type === "ExportNamedDeclaration" &&
        node.declaration &&
        node.declaration.type === "ClassDeclaration"
    );

    assert(exportDecl, "expected exported class declaration");
    assert.strictEqual(exportDecl.declaration.id.name, "AlertBanner");
    assert.strictEqual(exportDecl.declaration.superClass.name, "LitElement");

    const renderMethod = exportDecl.declaration.body.body.find(
      (member) => member.type === "ClassMethod" && member.key.name === "render"
    );
    assert(renderMethod, "expected render method in exported class");
  });

  it("infers static properties from TypeScript parameter annotations", () => {
    const source = `
      const TypedCounter = ({ label, count, active }: { label: string; count: number; active: boolean }) => {
        return <p>{label} - {count} - {active}</p>;
      };
    `;

    const inputAst = parser.parse(source, {
      sourceType: "module",
      plugins: ["typescript"],
    });
    const { code } = transformFromAstSync(inputAst, source, {
      configFile: false,
      babelrc: false,
      presets: [[nativePreset, { jsxTemplate: false }]],
    });

    const ast = parser.parse(code, {
      sourceType: "module",
      plugins: ["typescript"],
    });

    const classDecl = ast.program.body.find(
      (node) => node.type === "ClassDeclaration" && node.id.name === "TypedCounter"
    );
    assert(classDecl, "expected a class declaration named TypedCounter");

    const propertiesField = classDecl.body.body.find(
      (member) => member.type === "ClassProperty" && member.key.name === "properties"
    );
    assert(propertiesField, "expected a static properties field");
    assert(propertiesField.static, "properties field should be static");

    const propertyEntries = propertiesField.value.properties;
    const propertyNames = propertyEntries.map((prop) => prop.key.name).sort();
    assert.deepStrictEqual(propertyNames, ["active", "count", "label"]);

    const propertyTypes = propertyEntries.map((prop) => {
      const typeProperty = prop.value.properties.find(
        (inner) => inner.key.name === "type"
      );
      return typeProperty.value.name;
    });
    assert.deepStrictEqual(propertyTypes.sort(), ["Boolean", "Number", "String"]);

    assert.match(code, /this\.label/, "label should be accessed from this");
    assert.match(code, /this\.count/, "count should be accessed from this");
    assert.match(code, /this\.active/, "active should be accessed from this");
  });

  it("expands local TypeScript interfaces into static properties", () => {
    const source = `
      interface CardProps {
        title: string;
        active: boolean;
        tags: string[];
      }

      function Card(props: CardProps) {
        return <article>{props.title} {props.active ? "on" : "off"} {props.tags.length}</article>;
      }
    `;

    const inputAst = parser.parse(source, {
      sourceType: "module",
      plugins: ["typescript"],
    });
    const { code } = transformFromAstSync(inputAst, source, {
      configFile: false,
      babelrc: false,
      presets: [[nativePreset, { jsxTemplate: false }]],
    });

    assert.match(
      code,
      /static properties = \{\s*title: \{\s*type: String\s*\},\s*active: \{\s*type: Boolean\s*\},\s*tags: \{\s*type: Array\s*\}\s*\};/s
    );
    assert.match(code, /this\.title/);
    assert.match(code, /this\.active/);
    assert.match(code, /this\.tags/);
  });

  it("supports typed props aliases with default object initializers", () => {
    const source = `
      interface CardProps {
        title: string;
        active: boolean;
      }

      function Card(props: CardProps = {} as CardProps) {
        return <article>{props.title} {props.active ? "on" : "off"}</article>;
      }
    `;

    const inputAst = parser.parse(source, {
      sourceType: "module",
      plugins: ["typescript"],
    });
    const { code } = transformFromAstSync(inputAst, source, {
      configFile: false,
      babelrc: false,
      presets: [[nativePreset, { jsxTemplate: false }]],
    });

    assert.match(
      code,
      /static properties = \{\s*title: \{\s*type: String\s*\},\s*active: \{\s*type: Boolean\s*\}\s*\};/s
    );
    assert.match(code, /this\.title/);
    assert.match(code, /this\.active/);
    assert.doesNotMatch(code, /this\.props/);
  });

  it("supports body destructuring from typed props aliases with default object initializers", () => {
    const source = `
      interface CardProps {
        title: string;
        active: boolean;
      }

      function Card(props: CardProps = {} as CardProps) {
        const { title, active } = props;
        return <article>{title} {active ? "on" : "off"}</article>;
      }
    `;

    const inputAst = parser.parse(source, {
      sourceType: "module",
      plugins: ["typescript"],
    });
    const { code } = transformFromAstSync(inputAst, source, {
      configFile: false,
      babelrc: false,
      presets: [[nativePreset, { jsxTemplate: false }]],
    });

    assert.match(
      code,
      /static properties = \{\s*title: \{\s*type: String\s*\},\s*active: \{\s*type: Boolean\s*\}\s*\};/s
    );
    assert.match(code, /const \{\s*title,\s*active\s*\} = this;/);
    assert.match(code, /return <article>\{this\.title\} \{this\.active \? "on" : "off"\}<\/article>;/);
    assert.doesNotMatch(code, /this\.props/);
  });

  it("marks function-typed props as non-attribute properties", () => {
    const source = `
      type CardProps = {
        title: string;
        onSelect: (id: string) => void;
      };

      function Card(props: CardProps) {
        return <button onClick={() => props.onSelect(props.title)}>{props.title}</button>;
      }
    `;

    const inputAst = parser.parse(source, {
      sourceType: "module",
      plugins: ["typescript"],
    });
    const { code } = transformFromAstSync(inputAst, source, {
      configFile: false,
      babelrc: false,
      presets: [[nativePreset, { jsxTemplate: false }]],
    });

    assert.match(code, /title: \{\s*type: String\s*\}/);
    assert.match(code, /onSelect: \{\s*type: Object,\s*attribute: false\s*\}/s);
  });

  it("merges ^properties overrides into inferred static properties", () => {
    const source = `
      type CardProps = {
        title: string;
        active: boolean;
        payload: Record<string, unknown>;
        onSelect: (id: string) => void;
      };

      function Card(props: CardProps) {
        ^properties<CardProps>({
          active: { reflect: true },
          payload: { attribute: false },
          onSelect: { attribute: false }
        });

        return <article>{props.title}</article>;
      }
    `;

    const inputAst = parser.parse(source, {
      sourceType: "module",
      plugins: ["typescript"],
    });
    const { code } = transformFromAstSync(inputAst, source, {
      configFile: false,
      babelrc: false,
      presets: [[nativePreset, { jsxTemplate: false }]],
    });

    assert.match(code, /title: \{\s*type: String\s*\}/);
    assert.match(code, /active: \{\s*type: Boolean\s*\}/s);
    assert.match(code, /payload: \{\s*type: Object\s*\}/s);
    assert.match(code, /onSelect: \{\s*type: Object,\s*attribute: false\s*\}/s);
    assert.match(code, /reflect: true/);
    assert.match(code, /payload: \{\s*attribute: false\s*\}/s);
    assert.match(code, /static get properties\(\)/);
    assert.match(code, /from "@litsx\/litsx\/runtime-infrastructure"/);
    assert.match(code, /extends LitsxStaticHoistsMixin\(LitElement\)/);
    assert.match(code, /this\.__litsxMergeProperties\(/);
    assert.match(code, /this\.__litsxStatic\(_litsx_static_properties,\s*\(\)\s*=>/);
    assert.doesNotMatch(code, /\^properties</);
    assert.doesNotMatch(code, /\^properties\(/);
  });

  it("hoists ^properties into a memoized static getter that merges inferred props", () => {
    const source = `
      type CardProps = {
        title: string;
        active: boolean;
      };

      function Card(props: CardProps) {
        ^properties({
          active: { reflect: true },
        });

        return <article>{props.title}</article>;
      }
    `;

    const inputAst = parser.parse(source, {
      sourceType: "module",
      plugins: ["typescript"],
    });
    const { code } = transformFromAstSync(inputAst, source, {
      configFile: false,
      babelrc: false,
      presets: [[nativePreset, { jsxTemplate: false }]],
    });

    assert.match(code, /const _litsx_static_properties = Symbol\("litsx\.static\.properties"\);/);
    assert.match(code, /static get properties\(\)/);
    assert.match(code, /from "@litsx\/litsx\/runtime-infrastructure"/);
    assert.match(code, /extends LitsxStaticHoistsMixin\(LitElement\)/);
    assert.match(code, /this\.__litsxStatic\(_litsx_static_properties,\s*\(\)\s*=>/);
    assert.match(code, /this\.__litsxMergeProperties\(/);
    assert.match(code, /title: \{\s*type: String\s*\}/);
    assert.match(code, /active: \{\s*type: Boolean\s*\}/);
    assert.match(code, /reflect: true/);
  });

  it("uses a virtual TypeScript checker program for inline utility types", () => {
    const source = `
      type BaseProps = {
        title: string;
        active: boolean;
        payload: Record<string, unknown>;
      };

      type CardProps = Pick<BaseProps, "title" | "active"> & {
        payload: BaseProps["payload"];
      };

      function Card(props: CardProps) {
        return <article>{props.title} {props.active ? "on" : "off"}</article>;
      }
    `;

    const inputAst = parser.parse(source, {
      sourceType: "module",
      plugins: ["typescript"],
    });
    const { code } = transformFromAstSync(inputAst, source, {
      configFile: false,
      babelrc: false,
      presets: [[nativePreset, { jsxTemplate: false }]],
    });

    assert.match(code, /title: \{\s*type: String\s*\}/);
    assert.match(code, /active: \{\s*type: Boolean\s*\}/);
    assert.match(code, /payload: \{\s*type: Object\s*\}/);
  });

  it("resolves imported TypeScript prop types with the checker when filename is available", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "litsx-transform-"));
    const typesPath = path.join(tempDir, "types.ts");
    const componentPath = path.join(tempDir, "Card.tsx");

    fs.writeFileSync(
      typesPath,
      [
        "export interface CardProps {",
        "  title: string;",
        "  active: boolean;",
        "  tags: ReadonlyArray<string>;",
        "  payload: Record<string, unknown>;",
        "  onSelect: (id: string) => void;",
        "}",
      ].join("\n")
    );

    const source = [
      "import type { CardProps } from './types';",
      "function Card(props: CardProps) {",
      "  return <article>{props.title} {props.active ? 'on' : 'off'} {props.tags.length}</article>;",
      "}",
    ].join("\n");

    fs.writeFileSync(componentPath, source);

    const inputAst = parser.parse(source, {
      sourceType: "module",
      plugins: ["typescript"],
    });
    const { code } = transformFromAstSync(inputAst, source, {
      configFile: false,
      babelrc: false,
      filename: componentPath,
      presets: [[nativePreset, { jsxTemplate: false }]],
    });

    assert.match(code, /title: \{\s*type: String\s*\}/);
    assert.match(code, /active: \{\s*type: Boolean\s*\}/);
    assert.match(code, /tags: \{\s*type: Array\s*\}/);
    assert.match(code, /payload: \{\s*type: Object\s*\}/);
    assert.match(code, /onSelect: \{\s*type: Object,\s*attribute: false\s*\}/s);
  }, 30000);

  it("supports object rest properties in parameter destructuring", () => {
    const source = `
      const List = ({ items = [], title, ...restProps }) => {
        const count = items.length;
        const extra = restProps.subtitle;

        return (
          <ul>
            <li>{title}</li>
            {items.map((item) => (
              <li>{item}</li>
            ))}
            <li>Total: {count}</li>
            <li>{extra}</li>
          </ul>
        );
      };
    `;

    const inputAst = parser.parse(source, { sourceType: "module" });
    const { code } = transformFromAstSync(inputAst, source, {
      configFile: false,
      babelrc: false,
      presets: [[nativePreset, { jsxTemplate: false }]],
    });

    assert.match(
      code,
      /static properties = {\s*items: {\s*type: Array\s*},\s*title: {\s*type: String\s*},\s*restProps: {\s*type: Object\s*}\s*};/s,
    );
    assert.match(code, /const count = this\.items\.length;/);
    assert.match(code, /this\.restProps\.subtitle/);
    assert.match(
      code,
      new RegExp(String.raw`<li>\{this\.title\}<\/li>`)
    );
  });

  it("hoists inline event handlers into class methods", () => {
    const source = `
      const Button = ({ label }) => {
        return <button onClick={() => console.log(label)}>{label}</button>;
      };
    `;

    const inputAst = parser.parse(source, { sourceType: "module" });
    const { code } = transformFromAstSync(inputAst, source, {
      configFile: false,
      babelrc: false,
      presets: [[nativePreset, { jsxTemplate: false }]],
    });

    assert.match(code, /onClick=\{this\.handleClick\}/);
    assert.doesNotMatch(code, /onClick=\{\(.*=>/);

    const ast = parser.parse(code, { sourceType: "module" });
    const classDecl = ast.program.body.find(
      (node) => node.type === "ClassDeclaration" && node.id.name === "Button"
    );

    assert(classDecl, "expected Button class declaration");

    const hasHandlerMethod = classDecl.body.body.some(
      (member) => member.type === "ClassMethod" && member.key.name === "handleClick"
    );

    assert(hasHandlerMethod, "expected handleClick method to be generated");
  });

  it("hoists declared handlers into class methods", () => {
    const source = `
      const Button = ({ label }) => {
        const handleClick = (event) => {
          console.log(label, event.type);
        };

        return <button onClick={handleClick}>{label}</button>;
      };
    `;

    const inputAst = parser.parse(source, { sourceType: "module" });
    const { code } = transformFromAstSync(inputAst, source, {
      configFile: false,
      babelrc: false,
      presets: [[nativePreset, { jsxTemplate: false }]],
    });

    assert.doesNotMatch(code, /const handleClick/);
    assert.match(code, /onClick=\{this\.handleClick\}/);

    const ast = parser.parse(code, { sourceType: "module" });
    const classDecl = ast.program.body.find(
      (node) => node.type === "ClassDeclaration" && node.id.name === "Button"
    );

    assert(classDecl, "expected Button class declaration");

    const handlerMethod = classDecl.body.body.find(
      (member) => member.type === "ClassMethod" && member.key.name === "handleClick"
    );

    assert(handlerMethod, "expected handleClick method to exist");
    assert.strictEqual(handlerMethod.params.length, 1, "should preserve parameters");
  });

  it("keeps inline handlers that capture local bindings", () => {
    const source = `
      const Button = ({ label }) => {
        const prefix = '>>>';
        return <button onClick={() => console.log(prefix, label)}>{prefix}{label}</button>;
      };
    `;

    const inputAst = parser.parse(source, { sourceType: "module" });
    const { code } = transformFromAstSync(inputAst, source, {
      configFile: false,
      babelrc: false,
      presets: [[nativePreset, { jsxTemplate: false }]],
    });

    assert.match(code, /onClick=\{\(.*=>/);

    const ast = parser.parse(code, { sourceType: "module" });
    const classDecl = ast.program.body.find(
      (node) => node.type === "ClassDeclaration" && node.id.name === "Button"
    );

    const handlerMethods = classDecl.body.body.filter(
      (member) => member.type === "ClassMethod" && member.key.name.startsWith("handle")
    );

    assert.strictEqual(handlerMethods.length, 0, "should not hoist handlers capturing locals");
  });

  it("handles TypeScript array parameters with custom types", () => {
    const source = `
      type LogEntry = {
        message: string;
        count: number;
        active: boolean;
        tags: string[];
        metadata: Record<string, unknown>;
      };

      const Logger = (entries: LogEntry[]) => {
        const first = entries[0];

        return (
          <section>
            <ul>
              {entries.map((entry) => (
                <li>{entry.message}</li>
              ))}
            </ul>
            <footer>{entries.length}</footer>
            <p>{first?.message}</p>
          </section>
        );
      };
    `;

    const inputAst = parser.parse(source, {
      sourceType: "module",
      plugins: ["typescript"],
    });
    const { code } = transformFromAstSync(inputAst, source, {
      configFile: false,
      babelrc: false,
      presets: [[nativePreset, { jsxTemplate: false }]],
    });

    const ast = parser.parse(code, {
      sourceType: "module",
      plugins: ["typescript"],
    });

    const classDecl = ast.program.body.find(
      (node) => node.type === "ClassDeclaration" && node.id.name === "Logger"
    );
    assert(classDecl, "expected a Logger class declaration");

    const propertiesField = classDecl.body.body.find(
      (member) => member.type === "ClassProperty" && member.key.name === "properties"
    );
    assert(propertiesField, "expected properties field");

    const keys = propertiesField.value.properties.map((prop) => prop.key.name).sort();
    assert.deepStrictEqual(keys, ["entries"]);

    const entriesProp = propertiesField.value.properties.find((prop) => prop.key.name === "entries");
    const entriesType = entriesProp.value.properties.find((prop) => prop.key.name === "type");
    assert.strictEqual(entriesType.value.name, "Array");

    assert.match(code, /const first = this\.entries\[0\];/);
    assert.match(code, new RegExp(String.raw`\{this\.entries\.map`));
    assert.match(
      code,
      new RegExp(String.raw`<footer>\{this\.entries\.length\}<\/footer>`)
    );
  });

  it("expands TypeScript object parameters into property fields", () => {
    const source = `
      type LogEntry = {
        message: string;
        count: number;
        active: boolean;
        tags: string[];
        metadata: Record<string, unknown>;
      };

      const Logger = (entry: LogEntry) => {
        const extra = entry.metadata.details;

        return (
          <article>
            <header>{entry.message}</header>
            <section>{entry.count}</section>
            <footer>{entry.active ? 'on' : 'off'}</footer>
            <ul>
              {entry.tags.map((tag) => (
                <li>{tag}</li>
              ))}
            </ul>
            <pre>{extra}</pre>
          </article>
        );
      };
    `;

    const inputAst = parser.parse(source, {
      sourceType: "module",
      plugins: ["typescript"],
    });
    const { code } = transformFromAstSync(inputAst, source, {
      configFile: false,
      babelrc: false,
      presets: [[nativePreset, { jsxTemplate: false }]],
    });

    const ast = parser.parse(code, {
      sourceType: "module",
      plugins: ["typescript"],
    });

    const classDecl = ast.program.body.find(
      (node) => node.type === "ClassDeclaration" && node.id.name === "Logger"
    );
    assert(classDecl, "expected Logger class declaration");

    const propertiesField = classDecl.body.body.find(
      (member) => member.type === "ClassProperty" && member.key.name === "properties"
    );
    assert(propertiesField, "expected properties static field");

    const propertyMap = new Map(
      propertiesField.value.properties.map((prop) => [prop.key.name, prop.value.properties[0].value.name])
    );

    assert.strictEqual(propertyMap.get("message"), "String");
    assert.strictEqual(propertyMap.get("count"), "Number");
    assert.strictEqual(propertyMap.get("active"), "Boolean");
    assert.strictEqual(propertyMap.get("tags"), "Array");
    assert.strictEqual(propertyMap.get("metadata"), "Object");

    assert.match(code, /this\.metadata\.details/);
    assert.match(code, /this\.tags\.map/);
    assert.match(
      code,
      new RegExp(String.raw`<header>\{this\.message\}<\/header>`)
    );
  });

  it("skips anonymous default exported arrow functions", () => {
    const source = `
      export default (props) => {
        return <p>{props.message}</p>;
      };
    `;

    const inputAst = parser.parse(source, { sourceType: "module" });
    const { code } = transformFromAstSync(inputAst, source, {
      configFile: false,
      babelrc: false,
      presets: [[nativePreset, { jsxTemplate: false }]],
    });

    assert.doesNotMatch(code, /export default class/);
    assert.match(code, /export default props =>/);
    assert.doesNotMatch(code, /import \{ LitElement, html \} from "lit";/);
  });

  it("does not modify code when no LitX component exists", () => {
    const source = `const value = 42;`;
    const inputAst = parser.parse(source, { sourceType: "module" });
    const { code } = transformFromAstSync(inputAst, source, {
      configFile: false,
      babelrc: false,
      presets: [[nativePreset, { jsxTemplate: false }]],
    });

    assert.strictEqual(code.trim(), source.trim());
  });

  it("preserves existing LitElement imports", () => {
    const source = `
      import { LitElement } from 'lit';
      const Button = ({ label }) => {
        return <button>{label}</button>;
      };
    `;
    const inputAst = parser.parse(source, { sourceType: "module" });
    const { code } = transformFromAstSync(inputAst, source, {
      configFile: false,
      babelrc: false,
      presets: [[nativePreset, { jsxTemplate: false }]],
    });

    const litImports = (code.match(/import \{[^}]*LitElement[^}]*\} from ['"]lit['"];?/g) || []);
    assert.strictEqual(litImports.length, 1);
  });

  it("adds LitElement import when lit is namespaced imported", () => {
    const source = `
      import * as lit from 'lit';
      const Button = ({ label }) => {
        return <button>{label}</button>;
      };
    `;
    const inputAst = parser.parse(source, { sourceType: "module" });
    const { code } = transformFromAstSync(inputAst, source, {
      configFile: false,
      babelrc: false,
      presets: [[nativePreset, { jsxTemplate: false }]],
    });

    assert.match(code, /import \{ LitElement \} from ['"]lit['"];?/);
    assert.match(code, /import \* as lit from ['"]lit['"];?/);
  });

  it("transforms typed alias object parameters", () => {
    const source = `
      type Props = {
        label: string;
        count: number;
      };

      const AliasComponent = (props: Props) => {
        return <span>{props.label} {props.count}</span>;
      };
    `;

    const inputAst = parser.parse(source, {
      sourceType: "module",
      plugins: ["typescript"],
    });
    const { code } = transformFromAstSync(inputAst, source, {
      configFile: false,
      babelrc: false,
      presets: [[nativePreset, { jsxTemplate: false }]],
    });

    assert.match(code, /static properties = \{[\s\S]*label: \{\s*type: String\s*\}[\s\S]*count: \{\s*type: Number\s*\}[\s\S]*\};/);
    assert.match(code, /this\.label/);
    assert.match(code, /this\.count/);
  });

  it("rewrites props member access to component properties when ^properties declares them", () => {
    const source = `
      export function Playground(props) {
        ^properties({
          source: String,
          exportName: String,
        });

        return <section>{props.source} {props.exportName}</section>;
      }
    `;

    const inputAst = parser.parse(source, { sourceType: "module" });
    const { code } = transformFromAstSync(inputAst, source, {
      configFile: false,
      babelrc: false,
      presets: [[nativePreset, { jsxTemplate: false }]],
    });

    assert.match(code, /source: \{\s*type: String\s*\}/);
    assert.match(code, /exportName: \{\s*type: String\s*\}/);
    assert.match(code, /this\.source/);
    assert.match(code, /this\.exportName/);
    assert.doesNotMatch(code, /this\.props\./);
  });

  it("converts default exported named function declarations when the name is capitalized", () => {
    const source = `
      export default function Greeting({ message }) {
        return <div>{message}</div>;
      }
    `;
    const inputAst = parser.parse(source, { sourceType: "module" });
    const { code } = transformFromAstSync(inputAst, source, {
      configFile: false,
      babelrc: false,
      presets: [[nativePreset, { jsxTemplate: false }]],
    });

    assert.match(code, /export default class Greeting extends LitElement/);
    assert.match(code, /static properties = \{[\s\S]*message: \{\s*type: String\s*\}[\s\S]*\};/);
  });

  it("uses namespace import when LitElement is not directly imported", () => {
    const source = `
      import * as lit from 'lit';
      const Button = ({ label }) => {
        return <button>{label}</button>;
      };
    `;
    const inputAst = parser.parse(source, { sourceType: "module" });
    const { code } = transformFromAstSync(inputAst, source, {
      configFile: false,
      babelrc: false,
      presets: [[nativePreset, { jsxTemplate: false }]],
    });

    assert.match(code, /import \{ LitElement \} from ['"]lit['"];?/);
    assert.match(code, /class Button extends LitElement/);
  });

  it("handles function with non-JSX return statement", () => {
    const source = `
      const Formatter = ({ value }) => {
        return value.toString();
      };
    `;
    const inputAst = parser.parse(source, { sourceType: "module" });
    const { code } = transformFromAstSync(inputAst, source, {
      configFile: false,
      babelrc: false,
      presets: [[nativePreset, { jsxTemplate: false }]],
    });

    assert.doesNotMatch(code, /class Formatter extends LitElement/);
    assert.match(code, /const Formatter = /);
  });

  it("preserves LitElement when already imported from lit", () => {
    const source = `
      import { LitElement, html } from 'lit';
      const Button = ({ label }) => {
        return <button>{label}</button>;
      };
    `;
    const inputAst = parser.parse(source, { sourceType: "module" });
    const { code } = transformFromAstSync(inputAst, source, {
      configFile: false,
      babelrc: false,
      presets: [[nativePreset, { jsxTemplate: false }]],
    });

    const litImports = (code.match(/import \{[^}]*LitElement[^}]*\} from ['"]lit['"];?/g) || []);
    assert.strictEqual(litImports.length, 1);
    assert.match(code, /class Button extends LitElement/);
  });

  it("handles parameter without direct binding references", () => {
    const source = `
      const Component = ({ unused }) => {
        return <div>static content</div>;
      };
    `;
    const inputAst = parser.parse(source, { sourceType: "module" });
    const { code } = transformFromAstSync(inputAst, source, {
      configFile: false,
      babelrc: false,
      presets: [[nativePreset, { jsxTemplate: false }]],
    });

    assert.match(code, /static properties = \{[\s\S]*unused:/);
    assert.match(code, /class Component extends LitElement/);
  });

  it("infers array type from default value without type annotation", () => {
    const source = `
      const ListComponent = ({ items = [] }) => {
        return <ul>{items.map(item => <li>{item}</li>)}</ul>;
      };
    `;
    const inputAst = parser.parse(source, { sourceType: "module" });
    const { code } = transformFromAstSync(inputAst, source, {
      configFile: false,
      babelrc: false,
      presets: [[nativePreset, { jsxTemplate: false }]],
    });

    assert.match(code, /items: \{\s*type: Array\s*\}/);
    assert.match(code, /this\.items\.map/);
  });

  it("transforms array pattern parameters", () => {
    const source = `
      const DisplayTuple = ([first, second] = []) => {
        return <div>{first} {second}</div>;
      };
    `;
    const inputAst = parser.parse(source, { sourceType: "module" });
    const { code } = transformFromAstSync(inputAst, source, {
      configFile: false,
      babelrc: false,
      presets: [[nativePreset, { jsxTemplate: false }]],
    });

    // Array patterns are treated as a single property of type Array
  });

  it("skips nested arrow functions that do not belong to the program", () => {
    const source = `
      const createFactory = () => {
        const render = () => {
          const inline = () => <span>{value}</span>;
          return inline;
        };
        return render();
      };
    `;

    const inputAst = parser.parse(source, { sourceType: "module" });
    const { code } = transformFromAstSync(inputAst, source, {
      configFile: false,
      babelrc: false,
      presets: [[nativePreset, { jsxTemplate: false }]],
    });

    assert.match(
      code,
      new RegExp(String.raw`const inline = \(\) => <span>\{value\}<\/span>;`)
    );
  });

  it("maps additional TypeScript references", () => {
    const source = `
      type Config = {
        entries: ReadonlyArray<string>;
        mapping: Record<string, number>;
      };

      export const Viewer = ({ entries, mapping }: Config) => {
        return (
          <section>
            <p>{entries.length}</p>
            <p>{mapping.size}</p>
          </section>
        );
      };
    `;

    const inputAst = parser.parse(source, {
      sourceType: "module",
      plugins: ["typescript"],
    });
    const { code } = transformFromAstSync(inputAst, source, {
      configFile: false,
      babelrc: false,
      presets: [[nativePreset, { jsxTemplate: false }]],
    });

    assert.match(code, new RegExp(String.raw`entries: \{\s*type: Array\s*\}`));
    assert.match(code, new RegExp(String.raw`mapping: \{\s*type: Object\s*\}`));
  });

  it("infers types from default parameter values", () => {
    const source = `
      const WithDefaults = ({ count = 5, enabled = false, tags = [] }) => {
        return <p>{count}{enabled ? 'on' : 'off'}{tags.length}</p>;
      };
    `;

    const inputAst = parser.parse(source, { sourceType: "module" });
    const { code } = transformFromAstSync(inputAst, source, {
      configFile: false,
      babelrc: false,
      presets: [[nativePreset, { jsxTemplate: false }]],
    });

    assert.match(code, new RegExp(String.raw`count: \{\s*type: Number\s*\}`));
    assert.match(code, new RegExp(String.raw`enabled: \{\s*type: Boolean\s*\}`));
    assert.match(code, new RegExp(String.raw`tags: \{\s*type: Array\s*\}`));
    assert.match(code, /this\.count/);
    assert.match(code, /this\.enabled/);
    assert.match(code, /this\.tags\.length/);
    assert.match(code, /constructor\(\)\s*{\s*super\(\);/);
    assert.match(code, /this\.count \?\?= 5;/);
    assert.match(code, /this\.enabled \?\?= false;/);
    assert.match(code, /this\.tags \?\?= \[\];/);
  });

  it("preserves nested destructuring defaults", () => {
    const source = `
      const WithNestedDefaults = ({
        info = { label: 'hello', metrics: { total: 1 } },
        options: { mode = 'auto', retries = 3 } = {},
        items = []
      }) => {
        return <pre>{info.label}{info.metrics.total}{mode}{retries}{items.length}</pre>;
      };
    `;

    const inputAst = parser.parse(source, { sourceType: "module" });
    const { code } = transformFromAstSync(inputAst, source, {
      configFile: false,
      babelrc: false,
      presets: [[nativePreset, { jsxTemplate: false }]],
    });

    assert.match(code, /static properties = {\s*info: {\s*type: Object\s*},\s*options: {\s*type: Object\s*},\s*items: {\s*type: Array\s*}\s*};/s);
    assert.match(code, /constructor\(\)\s*{\s*super\(\);/);
    assert.match(
      code,
      new RegExp(String.raw`this\.info \?\?= \{\s*label: 'hello',\s*metrics: \{\s*total: 1\s*\}\s*\};`)
    );
    assert.match(code, /this\.options \?\?= \{\};/);
    assert.match(code, /this\.items \?\?= \[\];/);
    assert.match(code, /this\.info\.label/);
    assert.match(code, /static properties = [\s\S]*?info: \{\s*type: Object\s*\}/);
    assert.match(code, /static properties = [\s\S]*?options: \{\s*type: Object\s*\}/);
    assert.match(
      code,
      new RegExp(String.raw`const \{[\s\S]*mode = 'auto',[\s\S]*retries = 3[\s\S]*\} = this\.options \?\? \{\};`)
    );
    assert.match(code, /return <pre>\{this\.info\.label\}\{this\.info\.metrics\.total\}\{mode\}\{retries\}\{this\.items\.length\}<\/pre>;/);
  });

  it("handles deep object and array defaults", () => {
    const source = `
      const WithDeepDefaults = ({
        config: {
          theme: { palette: [primary = 'blue', secondary = 'green'] = [] } = {},
          options = { contrast: 'high' }
        } = { theme: { palette: ['blue'] }, options: { contrast: 'high' } },
        settings: { retries = 2, network: { throttle = 100 } = {} } = {},
      }) => {
        return <div>{primary}{secondary}{options.contrast}{retries}{throttle}</div>;
      };
    `;

    const inputAst = parser.parse(source, { sourceType: "module" });
    const { code } = transformFromAstSync(inputAst, source, {
      configFile: false,
      babelrc: false,
      presets: [[nativePreset, { jsxTemplate: false }]],
    });

    assert.match(code, /static properties = [\s\S]*?config: \{\s*type: Object\s*\}/);
    assert.match(code, /static properties = [\s\S]*?settings: \{\s*type: Object\s*\}/);
    assert.match(code, /constructor\(\)\s*{\s*super\(\);/);
    assert.match(
      code,
      new RegExp(String.raw`this\.config \?\?= \{[\s\S]*?palette: \['blue'\][\s\S]*?options: \{\s*contrast: 'high'\s*\}[\s\S]*?\};`)
    );
    assert.match(code, /this\.settings \?\?= \{\};/);
    assert.match(
      code,
      new RegExp(String.raw`const \{[\s\S]*palette: \[primary = 'blue',[\s\S]*secondary = 'green'[\s\S]*\] = \[\][\s\S]*options = \{\s*contrast: 'high'\s*\}[\s\S]*\} = this\.config \?\? \{[\s\S]*?\};`)
    );
    assert.match(
      code,
      new RegExp(String.raw`const \{[\s\S]*retries = 2,[\s\S]*network: \{\s*throttle = 100\s*\} = \{\}[\s\S]*\} = this\.settings \?\? \{\};`)
    );
    assert.match(code, /return <div>\{primary\}\{secondary\}\{options\.contrast\}\{retries\}\{throttle\}<\/div>;/);
  });

  it("infers TypeScript alias property shapes from type aliases", () => {
    const source = `
      type Props = {
        label: string;
        count: number;
      };

      const AliasComponent = ({ label, count }: Props) => {
        return <span>{label} {count}</span>;
      };
    `;

    const inputAst = parser.parse(source, {
      sourceType: "module",
      plugins: ["typescript"],
    });
    const { code } = transformFromAstSync(inputAst, source, {
      configFile: false,
      babelrc: false,
      presets: [[nativePreset, { jsxTemplate: false }]],
    });

    assert.match(code, /static properties = \{\s*label: \{\s*type: String\s*\},\s*count: \{\s*type: Number\s*\}\s*\};/s);
    assert.match(code, /this\.label/);
    assert.match(code, /this\.count/);
  });

  it("handles nested object destructuring defaults with alias properties", () => {
    const source = `
      const NestedDefaults = ({
        user: { name = 'unknown', preferences: { theme = 'light' } = {} } = {},
        tags = []
      }) => {
        return <div>{name} {theme} {tags.length}</div>;
      };
    `;

    const inputAst = parser.parse(source, { sourceType: "module" });
    const { code } = transformFromAstSync(inputAst, source, {
      configFile: false,
      babelrc: false,
      presets: [[nativePreset, { jsxTemplate: false }]],
    });

    assert.match(code, /static properties = \{\s*user: \{\s*type: Object\s*\},\s*tags: \{\s*type: Array\s*\}\s*\};/s);
    assert.match(
      code,
      /const \{[\s\S]*?name = 'unknown',[\s\S]*?preferences: \{[\s\S]*?theme = 'light'[\s\S]*?\} = \{\}[\s\S]*?\} = this\.user \?\? \{\};/s
    );
    assert.match(code, /return <div>\{name\} \{theme\} \{this\.tags\.length\}<\/div>;/);
  });

  it("converts named exported arrow functions", () => {
    const source = `
      export const Banner = ({ title }) => {
        return <section>{title}</section>;
      };
    `;

    const inputAst = parser.parse(source, { sourceType: "module" });
    const { code } = transformFromAstSync(inputAst, source, {
      configFile: false,
      babelrc: false,
      presets: [[nativePreset, { jsxTemplate: false }]],
    });

    assert.match(code, /export class Banner extends LitElement/);
    assert.match(code, /this\.title/);
  });

  it("infers String properties from opaque props member access", () => {
    const source = `
      export function Banner(props) {
        return <section>{props.title} {props.count}</section>;
      }
    `;

    const inputAst = parser.parse(source, { sourceType: "module" });
    const { code } = transformFromAstSync(inputAst, source, {
      configFile: false,
      babelrc: false,
      presets: [[nativePreset, { jsxTemplate: false }]],
    });

    assert.match(code, /static properties = \{[\s\S]*title: \{\s*type: String\s*\}[\s\S]*count: \{\s*type: String\s*\}[\s\S]*\};/);
    assert.match(code, /return <section>\{this\.title\} \{this\.count\}<\/section>;/);
    assert.doesNotMatch(code, /this\.props/);
  });

  it("emits warnings when opaque props access falls back to String metadata", () => {
    const source = `
      export function Banner(props) {
        return <section>{props.title}</section>;
      }
    `;

    const inputAst = parser.parse(source, { sourceType: "module" });
    const result = transformFromAstSync(inputAst, source, {
      configFile: false,
      babelrc: false,
      presets: [[nativePreset, { jsxTemplate: false }]],
    });

    assert.ok(Array.isArray(result.metadata.litsxWarnings));
    assert.strictEqual(result.metadata.litsxWarnings.length, 1);
    assert.strictEqual(result.metadata.litsxWarnings[0].code, 91018);
    assert.strictEqual(result.metadata.litsxWarnings[0].propName, "title");
    assert.match(result.metadata.litsxWarnings[0].message, /Falling back to String/);
  });

  it("emits warnings when native className is authored", () => {
    const source = `
      export function Banner() {
        return <section className="panel">panel</section>;
      }
    `;

    const inputAst = parser.parse(source, { sourceType: "module" });
    const result = transformFromAstSync(inputAst, source, {
      configFile: false,
      babelrc: false,
      presets: [[nativePreset, { jsxTemplate: false }]],
    });

    assert.ok(Array.isArray(result.metadata.litsxWarnings));
    assert.strictEqual(result.metadata.litsxWarnings.length, 1);
    assert.strictEqual(result.metadata.litsxWarnings[0].code, "LITSX_NATIVE_CLASSNAME");
    assert.strictEqual(result.metadata.litsxWarnings[0].attributeName, "className");
    assert.match(result.metadata.litsxWarnings[0].message, /is not native LitSX syntax/);
  });

  it("rewrites shorthand object properties and JSX attribute bindings", () => {
    const source = `
      const Card = ({ label, info }) => {
        const payload = { label, info };
        return <child-card title={label} payload={payload}>{info.value}</child-card>;
      };
    `;

    const inputAst = parser.parse(source, { sourceType: "module" });
    const { code } = transformFromAstSync(inputAst, source, {
      configFile: false,
      babelrc: false,
      presets: [[nativePreset, { jsxTemplate: false }]],
    });

    assert.match(code, /const payload = \{\s*label: this\.label,\s*info: this\.info\s*\};/);
    assert.match(code, /title=\{this\.label\}/);
    assert.match(code, /payload=\{payload\}/);
    assert.match(code, /this\.info\.value/);
  });

  it("captures prop references for nested non-arrow functions", () => {
    const source = `
      function Worker({ filename }) {
        function compile() {
          return { filename };
        }

        return <pre>{compile().filename}</pre>;
      }
    `;

    const inputAst = parser.parse(source, { sourceType: "module" });
    const { code } = transformFromAstSync(inputAst, source, {
      configFile: false,
      babelrc: false,
      presets: [[nativePreset, { jsxTemplate: false }]],
    });

    assert.match(code, /const _filename\d* = this\.filename;/);
    assert.match(code, /function compile\(\)\s*\{\s*return \{\s*filename: _filename\d*\s*\};\s*\}/s);
    assert.doesNotMatch(code, /function compile\(\)[\s\S]*this\.filename/s);
  });

  it("propagates local aliases of props into nested non-arrow functions", () => {
    const source = `
      function Worker({ filename }) {
        const outputFilename = filename;

        function compile() {
          return { filename: outputFilename };
        }

        return <pre>{compile().filename}</pre>;
      }
    `;

    const inputAst = parser.parse(source, { sourceType: "module" });
    const { code } = transformFromAstSync(inputAst, source, {
      configFile: false,
      babelrc: false,
      presets: [[nativePreset, { jsxTemplate: false }]],
    });

    assert.match(code, /const outputFilename = this\.filename;/);
    assert.match(code, /const _filename\d* = this\.filename;/);
    assert.match(code, /function compile\(\)\s*\{\s*return \{\s*filename: _filename\d*\s*\};\s*\}/s);
  });

  it("rewrites prop shorthands inside object literals", () => {
    const source = `
      function Worker({ filename, exportName }) {
        const message = {
          filename,
          exportName,
        };

        return <pre>{message.filename} {message.exportName}</pre>;
      }
    `;

    const inputAst = parser.parse(source, { sourceType: "module" });
    const { code } = transformFromAstSync(inputAst, source, {
      configFile: false,
      babelrc: false,
      presets: [[nativePreset, { jsxTemplate: false }]],
    });

    assert.match(
      code,
      /const message = \{\s*filename: this\.filename,\s*exportName: this\.exportName\s*\};/s
    );
    assert.match(code, /message\.filename/);
    assert.match(code, /message\.exportName/);
  });

  it("supports typed rest parameters", () => {
    const source = `
      const Collector = (...entries: string[]) => {
        return <p>{entries.length}</p>;
      };
    `;

    const inputAst = parser.parse(source, {
      sourceType: "module",
      plugins: ["typescript"],
    });
    const { code } = transformFromAstSync(inputAst, source, {
      configFile: false,
      babelrc: false,
      presets: [[nativePreset, { jsxTemplate: false }]],
    });

    assert.match(code, /class Collector extends LitElement/);
    assert.match(code, /entries: \{\s*type: Array\s*\}/);
    assert.match(code, /this\.entries\.length/);
  });

  it("creates unique handler names when a method name already exists", () => {
    const source = `
      const Button = ({ label }) => {
        const handleClick = () => console.log('declared');
        return (
          <button onClick={() => console.log('inline')}>
            {label}
          </button>
        );
      };
    `;

    const inputAst = parser.parse(source, { sourceType: "module" });
    const { code } = transformFromAstSync(inputAst, source, {
      configFile: false,
      babelrc: false,
      presets: [[nativePreset, { jsxTemplate: false }]],
    });

    assert.match(code, /handleClick\(\)/);
    assert.match(code, /handleClick2\(\)/);
    assert.match(code, /onClick=\{this\.handleClick2\}/);
  });

  it("lifts ^styles(...) into a static Lit stylesheet", () => {
    const source = `
      const Panel = ({ accent }) => {
        ^styles(\`
          :host {
            display: block;
          }

          .panel {
            color: var(--accent);
          }
        \`);

        useStyle("--accent", accent);

        return <section class="panel">panel</section>;
      };
    `;

    const inputAst = parser.parse(source, { sourceType: "module" });
    const { code } = transformFromAstSync(inputAst, source, {
      configFile: false,
      babelrc: false,
      presets: [[nativePreset, { jsxTemplate: false }]],
    });

    assert.match(code, /import \{[^}]*LitElement[^}]*css[^}]*\} from ['"]lit['"]/);
    assert.match(code, /static get styles\(\)/);
    assert.match(code, /css`[\s\S]*:host \{[\s\S]*display: block;[\s\S]*\.panel \{[\s\S]*color: var\(--accent\);[\s\S]*`/);
    assert.doesNotMatch(code, /\^styles\(/);
    assert.match(code, /useStyle\(this, "--accent", this\.accent\);/);
  });

  it("hoists ^styles into a memoized static getter", () => {
    const source = `
      const Panel = ({ accent }) => {
        ^styles(\`
          :host {
            display: block;
          }

          .panel {
            color: var(--accent);
          }
        \`);

        useStyle("--accent", accent);

        return <section class="panel">panel</section>;
      };
    `;

    const inputAst = parser.parse(source, { sourceType: "module" });
    const { code } = transformFromAstSync(inputAst, source, {
      configFile: false,
      babelrc: false,
      presets: [[nativePreset, { jsxTemplate: false }]],
    });

    assert.match(code, /const _litsx_static_styles = Symbol\("litsx\.static\.styles"\);/);
    assert.match(code, /static get styles\(\)/);
    assert.match(code, /css`[\s\S]*display: block;[\s\S]*color: var\(--accent\);[\s\S]*`/);
    assert.doesNotMatch(code, /\^styles/);
  });

  it("hoists arbitrary ^name macros into memoized static getters", () => {
    const source = `
      function Card() {
        ^shadowRootOptions({
          delegatesFocus: true,
        });

        return <div>ready</div>;
      }
    `;

    const inputAst = parser.parse(source, { sourceType: "module", plugins: ["typescript"] });
    const { code } = transformFromAstSync(inputAst, source, {
      configFile: false,
      babelrc: false,
      presets: [[nativePreset, { jsxTemplate: false }]],
    });

    assert.match(code, /const _litsx_static_shadowRootOptions = Symbol\("litsx\.static\.shadowRootOptions"\);/);
    assert.match(code, /static get shadowRootOptions\(\)/);
    assert.match(code, /extends LitsxStaticHoistsMixin\(LitElement\)/);
    assert.match(code, /this\.__litsxStatic\(_litsx_static_shadowRootOptions,\s*\(\)\s*=>/);
    assert.match(code, /delegatesFocus: true/);
  });

  it("lowers ^lightDom() to LightDomMixin", () => {
    const source = `
      function Card() {
        ^lightDom();

        return <div>ready</div>;
      }
    `;

    const inputAst = parser.parse(source, { sourceType: "module", plugins: ["typescript"] });
    const { code } = transformFromAstSync(inputAst, source, {
      configFile: false,
      babelrc: false,
      presets: [[nativePreset, { jsxTemplate: false }]],
    });

    assert.match(code, /import \{ LightDomMixin \} from "@litsx\/litsx\/runtime-infrastructure";/);
    assert.match(code, /class Card extends LightDomMixin\(LitElement\)/);
    assert.doesNotMatch(code, /createRenderRoot\(\)\s*\{\s*return this;\s*\}/s);
    assert.doesNotMatch(code, /static get lightDom\(\)/);
  });

  it("rejects ^lightDom() when combined with ^shadowRootOptions(...)", () => {
    const source = `
      function Card() {
        ^lightDom();
        ^shadowRootOptions({ delegatesFocus: true });

        return <div>ready</div>;
      }
    `;

    const inputAst = parser.parse(source, { sourceType: "module", plugins: ["typescript"] });

    assert.throws(() => {
      transformFromAstSync(inputAst, source, {
        configFile: false,
        babelrc: false,
        presets: [[nativePreset, { jsxTemplate: false }]],
      });
    }, /\^lightDom\(\) cannot be combined with \^shadowRootOptions\(\.\.\.\)\./);
  });

  it("lowers ^expose object literals into static class methods", () => {
    const source = `
      function Registry() {
        ^expose({
          canHandle(type) {
            return type === "dialog";
          },
          createConfig() {
            return { modal: true };
          },
        });

        return <div>ready</div>;
      }
    `;

    const inputAst = parser.parse(source, { sourceType: "module", plugins: ["typescript"] });
    const { code } = transformFromAstSync(inputAst, source, {
      configFile: false,
      babelrc: false,
      presets: [[nativePreset, { jsxTemplate: false }]],
    });

    assert.match(code, /static canHandle\(type\)\s*\{/);
    assert.match(code, /return type === "dialog";/);
    assert.match(code, /static createConfig\(\)\s*\{/);
    assert.match(code, /return \{\s*modal: true\s*\};/s);
    assert.doesNotMatch(code, /LitsxStaticHoistsMixin/);
    assert.doesNotMatch(code, /runtime-infrastructure/);
    assert.doesNotMatch(code, /_litsx_static_expose/);
  });

  it("rejects parent-based ^expose factories", () => {
    const source = `
      function Registry() {
        ^expose((parent) => ({
          canHandle(type) {
            return parent.canHandle?.(type) || type === "dialog";
          },
        }));

        return <div>ready</div>;
      }
    `;

    const inputAst = parser.parse(source, { sourceType: "module", plugins: ["typescript"] });

    assert.throws(() => {
      transformFromAstSync(inputAst, source, {
        configFile: false,
        babelrc: false,
        presets: [[nativePreset, { jsxTemplate: false }]],
      });
    }, /\^expose\(\.\.\.\) only accepts an object literal\./);
  });

  it("rejects parent-based generic hoist factories", () => {
    const source = `
      function Card() {
        ^shadowRootOptions((parent) => ({
          ...parent.shadowRootOptions,
          delegatesFocus: true,
        }));
        return <div>ready</div>;
      }
    `;

    const inputAst = parser.parse(source, { sourceType: "module", plugins: ["typescript"] });

    assert.throws(() => {
      transformFromAstSync(inputAst, source, {
        configFile: false,
        babelrc: false,
        presets: [[nativePreset, { jsxTemplate: false }]],
      });
    }, /\^shadowRootOptions\(\.\.\.\) only accepts a direct static value\./);
  });

  it("does not require static hoists to be imported from litsx", () => {
    const source = `
      import { useState } from "@litsx/litsx";

      export function Card() {
        ^properties({
          title: String,
        });

        ^styles(\`
          :host {
            display: block;
          }
        \`);

        const [count] = useState(0);
        return <div>{count}</div>;
      }
    `;

    const inputAst = parser.parse(source, { sourceType: "module" });
    const { code } = transformFromAstSync(inputAst, source, {
      configFile: false,
      babelrc: false,
      presets: [[nativePreset, { jsxTemplate: false }]],
    });

    assert.doesNotMatch(code, /\^properties\(/);
    assert.doesNotMatch(code, /\^styles\(/);
    assert.match(code, /import \{[^}]*useState[^}]*\} from ['"]@litsx\/litsx['"]/);
  });

  it("rejects static hoists outside top-level component statements", () => {
    const source = `
      function Card({ ready }) {
        if (ready) {
          ^styles(\`:host { display: block; }\`);
        }

        return <div>ready</div>;
      }
    `;

    const inputAst = parser.parse(source, { sourceType: "module", plugins: ["typescript"] });

    assert.throws(() => {
      transformFromAstSync(inputAst, source, {
        configFile: false,
        babelrc: false,
        presets: [[nativePreset, { jsxTemplate: false }]],
      });
    }, /\^styles\(\.\.\.\) must appear as a top-level statement in the component body\./);
  });

  it("preserves static module-level interpolations inside css tagged styles", () => {
    const source = `
      const radius = "12px";
      const borderRule = "1px solid var(--border-color)";

      const Panel = () => {
        ^styles(\`
          .panel {
            border-radius: \${radius};
            border: \${borderRule};
          }
        \`);

        return <section class="panel">panel</section>;
      };
    `;

    const inputAst = parser.parse(source, { sourceType: "module" });
    const { code } = transformFromAstSync(inputAst, source, {
      configFile: false,
      babelrc: false,
      presets: [[nativePreset, { jsxTemplate: false }]],
    });

    assert.match(code, /import \{[^}]*unsafeCSS[^}]*\} from ['"]lit['"]/);
    assert.match(code, /static get styles\(\)/);
    assert.match(code, /border-radius: \$\{unsafeCSS\(radius\)\};[\s\S]*border: \$\{unsafeCSS\(borderRule\)\};/);
  });

  it("wraps static alias interpolations as css fragments", () => {
    const source = `
      import { gap } from "./styles";

      const hostStyles = \`gap: \${gap};\`;

      const Card = () => {
        ^styles(\`:host { \${hostStyles} }\`);
        return <section>card</section>;
      };
    `;

    const inputAst = parser.parse(source, { sourceType: "module" });
    const { code } = transformFromAstSync(inputAst, source, {
      configFile: false,
      babelrc: false,
      presets: [[nativePreset, { jsxTemplate: false }]],
    });

    assert.match(code, /import \{[^}]*unsafeCSS[^}]*\} from ['"]lit['"]/);
    assert.match(code, /static get styles\(\)/);
    assert.match(code, /css`:host \{ \$\{unsafeCSS\(hostStyles\)\} \}`/);
  });

  it("rejects ^styles interpolations that depend on component scope", () => {
    const source = `
      const Panel = ({ accent }) => {
        const borderRule = accent;

        ^styles(\`
          .panel {
            color: \${accent};
            border-color: \${borderRule};
          }
        \`);

        return <section class="panel">panel</section>;
      };
    `;

    const inputAst = parser.parse(source, { sourceType: "module" });

    assert.throws(() => {
      transformFromAstSync(inputAst, source, {
        configFile: false,
        babelrc: false,
        presets: [[nativePreset, { jsxTemplate: false }]],
      });
    }, /\^styles\(\.\.\.\) only accepts static values|\^styles\(\) only accepts static values/);
  });

  it("rejects ^styles interpolations that read props members directly", () => {
    const source = `
      export function Panel(props) {
        ^properties({
          accent: String,
        });

        ^styles(\`
          .panel {
            color: \${props.accent};
          }
        \`);

        return <section class="panel">{props.accent}</section>;
      }
    `;

    const inputAst = parser.parse(source, { sourceType: "module" });

    assert.throws(() => {
      transformFromAstSync(inputAst, source, {
        configFile: false,
        babelrc: false,
        presets: [[nativePreset, { jsxTemplate: false }]],
      });
    }, /\^styles\(\.\.\.\) only accepts static values|\^styles\(\) only accepts static values/);
  });

  it("rejects ^styles interpolations that read aliases from props members", () => {
    const source = `
      export function Panel(props) {
        const accentColor = props.accent;

        ^styles(\`
          .panel {
            color: \${accentColor};
          }
        \`);

        return <section class="panel">{props.accent}</section>;
      }
    `;

    const inputAst = parser.parse(source, { sourceType: "module" });

    assert.throws(() => {
      transformFromAstSync(inputAst, source, {
        configFile: false,
        babelrc: false,
        presets: [[nativePreset, { jsxTemplate: false }]],
      });
    }, /\^styles\(\.\.\.\) only accepts static values|\^styles\(\) only accepts static values/);
  });

  it("rejects locally constant aliases declared inside the component body", () => {
    const source = `
      const Panel = ({ radius }) => {
        const localRadius = \`\${radius}px\`;

        ^styles(\`
          .panel {
            border-radius: \${localRadius};
          }
        \`);

        return <section class="panel">panel</section>;
      };
    `;

    const inputAst = parser.parse(source, { sourceType: "module" });

    assert.throws(() => {
      transformFromAstSync(inputAst, source, {
        configFile: false,
        babelrc: false,
        presets: [[nativePreset, { jsxTemplate: false }]],
      });
    }, /\^styles\(\.\.\.\) only accepts static values|\^styles\(\) only accepts static values/);
  });

});
