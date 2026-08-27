import assert from "assert";
import * as babelCore from "@babel/core";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import parser from "./helpers/litsx-parser.js";
import { beforeAll } from 'vitest';
import { interopDefault } from "./helpers/interop-default.js";

const { transformFromAstSync } = babelCore;
let plugin;
let nativePreset;
let reactCompatPreset;

beforeAll(async () => {
  const [scopedMod, presetMod, reactCompatMod] = await Promise.all([
    import("../packages/babel-plugin-transform-litsx-scoped-elements/src/index.js"),
    import("../packages/babel-preset-litsx/src/index.js"),
    import("../packages/babel-preset-react-compat/src/index.js"),
  ]);
  plugin = interopDefault(scopedMod);
  nativePreset = interopDefault(presetMod);
  reactCompatPreset = interopDefault(reactCompatMod);
});

function transformWithNativePreset(source, options = {}) {
  const {
    filename,
    parserPlugins = [],
    plugins = [],
    ssr,
  } = options;

  const inputAst = parser.parse(source, {
    sourceType: "module",
    plugins: parserPlugins,
  });

  return transformFromAstSync(inputAst, source, {
    configFile: false,
    babelrc: false,
    filename,
    presets: [[nativePreset, { jsxTemplate: false, ssr }]],
    plugins,
  });
}

function transformWithReactCompatPreset(source, options = {}) {
  const {
    filename,
    parserPlugins = [],
  } = options;

  const inputAst = parser.parse(source, {
    sourceType: "module",
    plugins: parserPlugins,
  });

  return transformFromAstSync(inputAst, source, {
    configFile: false,
    babelrc: false,
    filename,
    presets: [[reactCompatPreset, { jsxTemplate: false }]],
  });
}

describe("@litsx/babel-plugin-transform-litsx-scoped-elements", () => {

  it("wraps LitElement with ShadowDomMixin and registers tags", () => {
    const source = `
      import { LitElement, html } from 'lit';
      import FancyButton from './FancyButton.js';

      class MyElement extends LitElement {
        render() {
          return <FancyButton>Click me</FancyButton>;
        }
      }
    `;

    const inputAst = parser.parse(source, { sourceType: "module" });
    const { code } = transformFromAstSync(inputAst, source, {
      configFile: false,
      babelrc: false,
      plugins: [plugin],
    });

    const ast = parser.parse(code, { sourceType: "module" });

    const mixinImport = ast.program.body.find(
      (node) =>
        node.type === "ImportDeclaration" &&
        node.source.value === "@litsx/core/elements"
    );
    assert(mixinImport, "expected ShadowDomMixin import");

    const classDecl = ast.program.body.find((node) => node.type === "ClassDeclaration");
    assert(classDecl, "expected transformed class declaration");
    assert.strictEqual(classDecl.superClass.type, "CallExpression");
    assert.strictEqual(classDecl.superClass.callee.name, "ShadowDomMixin");

    const elementsField = classDecl.body.body.find(
      (member) => member.type === "ClassProperty" && member.key.name === "elements"
    );
    assert(elementsField, "expected elements static field");
    assert(elementsField.static, "elements field should be static");

    const elementEntry = elementsField.value.properties.find(
      (prop) => prop.type === "ObjectProperty" && prop.key.value === "fancy-button"
    );
    assert(elementEntry, "expected fancy-button entry in elements");
  });

  it("merges detected tags after inherited and before authored elements", () => {
    const source = `
      import { LitElement } from 'lit';
      import FancyButton from './FancyButton.js';
      class OwnButton extends HTMLElement {}

      class MyElement extends LitElement {
        static elements = { "own-button": OwnButton };
        render() {
          return <FancyButton />;
        }
      }
    `;

    const inputAst = parser.parse(source, {
      sourceType: "module",
      plugins: ["classProperties"],
    });
    const { code } = transformFromAstSync(inputAst, source, {
      configFile: false,
      babelrc: false,
      plugins: [plugin],
    });

    assert.match(
      code,
      /static elements = \{\s*\.\.\.\(super\.elements \?\? \{\}\),\s*"fancy-button": FancyButton,\s*"own-button": OwnButton\s*\}/,
    );
  });

  it("handles React-style function components with useRef", () => {
    const source = `
      import { useRef, useEffect } from 'react';
      import PropTypes from 'prop-types';
      import FancyButton from './FancyButton.js';

      const FancyForm = (props) => {
        const buttonRef = useRef(null);

        useEffect(() => {
          buttonRef.current.focus();
        }, []);

        return (
          <div>
            <FancyButton ref={buttonRef} .label={props.label} />
          </div>
        );
      };

      FancyForm.propTypes = {
        label: PropTypes.string,
      };

      export const TestAlert = (message) => {
        const lower = message.toLowerCase();
        return <p>{lower}</p>;
      };
    `;

    const { code } = transformWithReactCompatPreset(source);

    const outputAst = parser.parse(code, { sourceType: "module" });

    const mixinImport = outputAst.program.body.find(
      (node) =>
        node.type === "ImportDeclaration" &&
        node.source.value === "@litsx/core/elements"
    );
    assert(mixinImport, "expected LightDomMixin import to be added");

    const fancyFormClass = outputAst.program.body.find(
      (node) => node.type === "ClassDeclaration" && node.id.name === "FancyForm"
    );
    assert(fancyFormClass, "expected FancyForm to become a class");
    assert.strictEqual(
      fancyFormClass.superClass.type,
      "CallExpression",
      "FancyForm should extend LightDomMixin(LitElement)"
    );
    assert.strictEqual(
      fancyFormClass.superClass.callee.name,
      "LightDomMixin"
    );

    const elementsField = fancyFormClass.body.body.find(
      (member) => member.type === "ClassProperty" && member.key.name === "elements"
    );
    assert(elementsField, "expected elements static field");
    assert(elementsField.static, "elements should be static");

    const fancyButtonEntry = elementsField.value.properties.find(
      (prop) => prop.type === "ObjectProperty" && prop.key.value === "fancy-button"
    );
    assert(fancyButtonEntry, "expected fancy-button entry in elements");

    const renderMethod = fancyFormClass.body.body.find(
      (member) => member.type === "ClassMethod" && member.key.name === "render"
    );
    assert(renderMethod, "expected render method to exist");

    const containsComponentRef = code.includes(".ref={buttonRef}");
    assert(containsComponentRef, "expected FancyButton ref to become a component ref property");
  });

  it("detects scoped usage inside html tagged templates", () => {
    const source = `
      import { LitElement, html } from 'lit';
      import FancyButton from './FancyButton.js';

      class TemplateElement extends LitElement {
        render() {
          return html\`<section><FancyButton></FancyButton></section>\`;
        }
      }
    `;

    const ast = parser.parse(source, { sourceType: "module" });
    const { code } = transformFromAstSync(ast, source, {
      configFile: false,
      babelrc: false,
      plugins: [plugin],
    });

    assert.match(code, /ShadowDomMixin\(LitElement\)/);
    assert.match(code, /"fancy-button": FancyButton/);
  });

  it("emits symmetric light-DOM boundaries for server and client templates", () => {
    const filename = path.join(
      import.meta.dirname,
      "fixtures/lit-interoperability/src/light-boundary-parent.tsx",
    );
    const source = `
      import { PlainLitContextBridge } from "./matrix-lit-elements.ts";

      export function LightBoundaryParent() {
        return <PlainLitContextBridge />;
      }
    `;

    const client = transformWithNativePreset(source, {
      filename,
      parserPlugins: ["typescript"],
    }).code;
    const server = transformWithNativePreset(source, {
      filename,
      parserPlugins: ["typescript"],
      ssr: true,
    }).code;

    assert.match(
      client,
      /import \{[^}]*__litsxRenderLight[^}]*\} from "@litsx\/core\/elements";/,
    );
    assert.match(
      client,
      /<plain-lit-context-bridge>\{__litsxRenderLight\(\)\}<\/plain-lit-context-bridge>/,
    );
    assert.match(
      server,
      /import \{[^}]*__litsxRenderLight[^}]*\} from "@litsx\/core\/elements";/,
    );
    assert.match(
      server,
      /<plain-lit-context-bridge>\{__litsxRenderLight\(\)\}<\/plain-lit-context-bridge>/,
    );
  });

  it("infers a light-DOM boundary from an independently compiled LitSX class", () => {
    const filename = path.join(
      import.meta.dirname,
      "fixtures/lit-interoperability/src/compiled-light-parent.ts",
    );
    const source = `
      import { LitElement, html } from "lit";
      import { CompiledLightChild } from "./compiled-light-child.js";

      export class CompiledLightParent extends LitElement {
        static elements = { "compiled-light-child": CompiledLightChild };
        render() {
          return html\`<compiled-light-child></compiled-light-child>\`;
        }
      }
    `;

    const { code } = transformWithNativePreset(source, {
      filename,
      parserPlugins: ["typescript"],
    });

    assert.match(
      code,
      /html`<compiled-light-child>\$\{__litsxRenderLight\(\)\}<\/compiled-light-child>`/,
    );
  });

  it("leaves react-compat light-DOM ownership to its compatibility runtime", () => {
    const source = `
      function NestedValue() {
        return <span>value</span>;
      }

      export function CompatRoot() {
        return <NestedValue />;
      }
    `;

    const { code } = transformWithReactCompatPreset(source, {
      filename: "/virtual/react-light-boundary.tsx",
      parserPlugins: ["typescript"],
    });

    assert.doesNotMatch(code, /__litsxRenderLight/);
    assert.match(code, /<nested-value \/>/);
  });

  it("registers scoped element aliases created from namespace imports cast as any", () => {
    const source = `
      import * as VdsIcon from './icons.js';

      const MyComponent = (VdsIcon as any).VdsIcon;

      function IconButton() {
        return <MyComponent size="sm" />;
      }
    `;

    const { code } = transformWithNativePreset(source, {
      parserPlugins: ["typescript"],
    });

    assert.match(code, /class IconButton extends ShadowDomMixin\(LitElement\)/);
    assert.match(code, /static elements = \{\s*\.\.\.\(super\.elements \?\? \{\}\),\s*"my-component": MyComponent\s*\};/);
    assert.match(code, /return <my-component size="sm"\s*\/>;/);
  });

  it("inserts elements after existing properties", () => {
    const source = `
      import { LitElement, html } from 'lit';
      import FancyButton from './FancyButton.js';

      class WithProperties extends LitElement {
        static properties = {
          label: { type: String }
        };

        render() {
          return <FancyButton label={this.label} />;
        }
      }
    `;

    const ast = parser.parse(source, { sourceType: "module" });
    const { code } = transformFromAstSync(ast, source, {
      configFile: false,
      babelrc: false,
      plugins: [plugin],
    });

    const propertiesIndex = code.indexOf('static properties');
    const scopedIndex = code.indexOf('static elements');

    assert(propertiesIndex !== -1 && scopedIndex !== -1 && scopedIndex > propertiesIndex);
  });

  it("leaves classes without scoped usage untouched", () => {
    const source = `
      import { LitElement, html } from 'lit';

      class PlainElement extends LitElement {
        render() {
          return html\`<div>No scoped elements here</div>\`;
        }
      }
    `;

    const ast = parser.parse(source, { sourceType: "module" });
    const { code } = transformFromAstSync(ast, source, {
      configFile: false,
      babelrc: false,
      plugins: [plugin],
    });

    assert.doesNotMatch(code, /ShadowDomMixin/);
    assert.doesNotMatch(code, /static elements/);
  });

  it("registers scoped elements in light DOM components", () => {
    const source = `
      import FancyButton from './FancyButton.js';

      function LightScreen() {
        return <FancyButton />;
      }

      LightScreen.lightDom = true;
    `;

    const { code } = transformWithNativePreset(source, {
      parserPlugins: ["typescript"],
    });
    assert.match(code, /class LightScreen extends LightDomMixin\(LitElement\)/);
    assert.match(code, /static elements = \{\s*\.\.\.\(super\.elements \?\? \{\}\),\s*"fancy-button": FancyButton\s*\}/);
  });

  it("uses LightDomMixin for light DOM components without element dependencies", () => {
    const source = `
      function LightCard() {
        return <div>ready</div>;
      }

      LightCard.lightDom = true;
    `;

    const { code } = transformWithNativePreset(source, {
      parserPlugins: ["typescript"],
    });

    assert.match(code, /import \{[^}]*LightDomMixin[^}]*\} from "@litsx\/core\/elements";/);
    assert.match(code, /class LightCard extends LightDomMixin\(LitElement\)/);
    assert.doesNotMatch(code, /static elements\s*=/);
  });

  it("reads light DOM metadata from an imported component through a barrel", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "litsx-light-dom-metadata-"));
    const dependencyDir = path.join(tempDir, "node_modules", "light-dom-package");
    const filename = path.join(tempDir, "host.js");

    try {
      fs.mkdirSync(dependencyDir, { recursive: true });
      fs.writeFileSync(
        path.join(dependencyDir, "package.json"),
        JSON.stringify({
          name: "light-dom-package",
          type: "module",
          exports: "./index.js",
        }),
      );
      fs.writeFileSync(
        path.join(dependencyDir, "light-child.js"),
        [
          'import { LitElement } from "lit";',
          "export class LightChild extends LitElement {",
          '  static [Symbol.for("litsx.component")] = true;',
          '  static [Symbol.for("litsx.lightDom")] = true;',
          "}",
        ].join("\n"),
      );
      fs.writeFileSync(
        path.join(dependencyDir, "index.js"),
        'export { LightChild } from "./light-child.js";',
      );

      const source = `
        import { LitElement } from "lit";
        import { LightChild } from "light-dom-package";

        class HostElement extends LitElement {
          render() {
            return <LightChild />;
          }
        }
      `;
      const ast = parser.parse(source, { sourceType: "module" });
      const { code } = transformFromAstSync(ast, source, {
        configFile: false,
        babelrc: false,
        filename,
        plugins: [plugin],
      });

      assert.match(code, /<light-child>\{__litsxRenderLight\(\)\}<\/light-child>/);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("reuses an existing ShadowDomMixin import", () => {
    const source = `
      import { LitElement } from 'lit';
      import { ShadowDomMixin } from '@litsx/core/elements';
      import FancyButton from './FancyButton.js';

      class ReadyElement extends LitElement {
        render() {
          return <FancyButton />;
        }
      }
    `;

    const ast = parser.parse(source, { sourceType: "module" });
    const { code } = transformFromAstSync(ast, source, {
      configFile: false,
      babelrc: false,
      plugins: [plugin],
    });

    const mixinImports = code.match(/@litsx\/core\/elements/g) || [];
    assert.strictEqual(mixinImports.length, 1);
    assert.match(code, /class ReadyElement extends ShadowDomMixin\(LitElement\)/);
  });

  it("supports classes extending mixins around LitElement", () => {
    const source = `
      import FancyButton from './FancyButton.js';

      class MixedElement extends withTheme(LitElement) {
        render() {
          return <FancyButton></FancyButton>;
        }
      }
    `;

    const ast = parser.parse(source, { sourceType: "module" });
    const { code } = transformFromAstSync(ast, source, {
      configFile: false,
      babelrc: false,
      plugins: [plugin],
    });

    assert.match(code, /class MixedElement extends ShadowDomMixin\(withTheme\(LitElement\)\)/);
    assert.match(code, /static elements = \{\s*\.\.\.\(super\.elements \?\? \{\}\),\s*"fancy-button": FancyButton\s*\}/);
  });

  it("does not duplicate ShadowDomMixin when it is nested inside another mixin", () => {
    const source = `
      import { ShadowDomMixin } from '@litsx/core/elements';
      import FancyButton from './FancyButton.js';

      class MixedElement extends withTheme(ShadowDomMixin(LitElement)) {
        render() {
          return <FancyButton />;
        }
      }
    `;

    const ast = parser.parse(source, { sourceType: "module" });
    const { code } = transformFromAstSync(ast, source, {
      configFile: false,
      babelrc: false,
      plugins: [plugin],
    });

    const shadowMixinMatches = code.match(/ShadowDomMixin\(/g) || [];
    assert.strictEqual(shadowMixinMatches.length, 1);
    assert.match(code, /class MixedElement extends withTheme\(ShadowDomMixin\(LitElement\)\)/);
  });

  it("does not duplicate LightDomMixin when it is nested inside another mixin", () => {
    const source = `
      import { LightDomMixin } from '@litsx/core/elements';

      class MixedLightCard extends withTheme(LightDomMixin(LitElement)) {
        render() {
          return <div>ready</div>;
        }
      }
    `;

    const ast = parser.parse(source, { sourceType: "module" });
    const classDecl = ast.program.body.find((node) => node.type === "ClassDeclaration");
    classDecl._litsxStaticIr = {
      properties: {
        inferred: [],
        authored: [],
      },
      elements: {
        localCandidates: [],
        importedCandidates: [],
        needsRegistry: false,
      },
      lightDom: true,
    };

    const { code } = transformFromAstSync(ast, source, {
      configFile: false,
      babelrc: false,
      plugins: [plugin],
    });

    const lightMixinMatches = code.match(/LightDomMixin\(/g) || [];
    assert.strictEqual(lightMixinMatches.length, 1);
    assert.match(code, /class MixedLightCard extends withTheme\(LightDomMixin\(LitElement\)\)/);
  });

  it("consumes early static IR for element candidates and light DOM", () => {
    const source = `
      import { LitElement } from 'lit';
      import { ChildCard } from './child-card.tsx';

      class HostCard extends LitElement {
        render() {
          return <ChildCard />;
        }
      }
    `;

    const ast = parser.parse(source, { sourceType: "module" });
    const classDecl = ast.program.body.find((node) => node.type === "ClassDeclaration");
    classDecl._litsxStaticIr = {
      properties: {
        inferred: [],
        authored: [],
      },
      elements: {
        localCandidates: ["ChildCard"],
        importedCandidates: [],
        needsRegistry: false,
      },
      lightDom: true,
    };

    const { code } = transformFromAstSync(ast, source, {
      configFile: false,
      babelrc: false,
      plugins: [plugin],
    });
    assert.match(code, /class HostCard extends LightDomMixin\(LitElement\)/);
    assert.match(code, /static elements = \{\s*\.\.\.\(super\.elements \?\? \{\}\),\s*"child-card": ChildCard\s*\}/);
  });

  it("rewrites JSX opening tags with attributes to kebab-case consistently", () => {
    const source = `
      import { LitElement } from 'lit';
      import FancyButton from './FancyButton.js';

      class AttributedElement extends LitElement {
        render() {
          return <FancyButton label={this.label}>Click</FancyButton>;
        }
      }
    `;

    const ast = parser.parse(source, { sourceType: "module" });
    const { code } = transformFromAstSync(ast, source, {
      configFile: false,
      babelrc: false,
      plugins: [plugin],
    });

    assert.match(code, /return <fancy-button label=\{this\.label\}>Click<\/fancy-button>;/);
    assert.match(code, /static elements = \{\s*\.\.\.\(super\.elements \?\? \{\}\),\s*"fancy-button": FancyButton\s*\}/);
  });

  it("registers locally defined sibling components used in JSX", () => {
    const source = `
      import { LitElement } from 'lit';

      export class ProfileChip extends LitElement {
        render() {
          return <article>chip</article>;
        }
      }

      export class ProfileScreen extends LitElement {
        render() {
          return <ProfileChip />;
        }
      }
    `;

    const ast = parser.parse(source, { sourceType: "module" });
    const { code } = transformFromAstSync(ast, source, {
      configFile: false,
      babelrc: false,
      plugins: [plugin],
    });

    assert.match(code, /export class ProfileScreen extends ShadowDomMixin\(LitElement\)/);
    assert.match(code, /static elements = \{\s*\.\.\.\(super\.elements \?\? \{\}\),\s*"profile-chip": ProfileChip\s*\}/);
    assert.match(code, /return <profile-chip\s*\/>;/);
  });

  it("registers the current class when it is used recursively as a JSX tag", () => {
    const source = `
      import { LitElement } from 'lit';

      export class TreeNode extends LitElement {
        render() {
          return (
            <section>
              <TreeNode />
            </section>
          );
        }
      }
    `;

    const ast = parser.parse(source, { sourceType: "module" });
    const { code } = transformFromAstSync(ast, source, {
      configFile: false,
      babelrc: false,
      plugins: [plugin],
    });

    assert.match(code, /export class TreeNode extends ShadowDomMixin\(LitElement\)/);
    assert.match(code, /static elements = \{\s*\.\.\.\(super\.elements \?\? \{\}\),\s*"tree-node": TreeNode\s*\}/);
    assert.match(code, /return <section>\s*<tree-node\s*\/>\s*<\/section>;/s);
  });

  it("emits the same base tag for light DOM components from different sources", () => {
    const sourceA = `
      import ProfileChip from './profile/ProfileChip.js';

      export function FirstScreen() {
        return <ProfileChip />;
      }

      FirstScreen.lightDom = true;
    `;

    const sourceB = `
      import ProfileChip from '../shared/ProfileChip.js';

      export function SecondScreen() {
        return <ProfileChip />;
      }

      SecondScreen.lightDom = true;
    `;

    const first = transformWithNativePreset(sourceA, {
      filename: "/app/screens/FirstScreen.tsx",
      parserPlugins: ["typescript"],
    }).code;
    const second = transformWithNativePreset(sourceB, {
      filename: "/app/screens/SecondScreen.tsx",
      parserPlugins: ["typescript"],
    }).code;
    assert.match(first, /"profile-chip": ProfileChip/);
    assert.match(second, /"profile-chip": ProfileChip/);
    assert.match(first, /LightDomMixin/);
    assert.match(second, /LightDomMixin/);
  }, 30000);

  it("supports repeated light DOM components that require scoped elements from the same source", () => {
    const source = `
      import ProfileChip from './profile/ProfileChip.js';

      export function FirstScreen() {
        return <ProfileChip />;
      }

      export function SecondScreen() {
        return <ProfileChip />;
      }

      FirstScreen.lightDom = true;
      SecondScreen.lightDom = true;
    `;

    const { code } = transformWithNativePreset(source, {
      filename: "/app/screens/SharedScreens.tsx",
      parserPlugins: ["typescript"],
    });
    assert.strictEqual((code.match(/"profile-chip": ProfileChip/g) || []).length, 2);
    assert.strictEqual((code.match(/extends LightDomMixin\(LitElement\)/g) || []).length, 2);
  }, 30000);

  it("still rewrites scoped tags when candidates were precomputed by transform-litsx", () => {
    const source = `
      import { SuspenseBoundary } from '@litsx\/core';

      export function TestScreen() {
        return (
          <section>
            <SuspenseBoundary fallback={<span>loading</span>}>
              <span>ready</span>
            </SuspenseBoundary>
          </section>
        );
      }
    `;

    const { code } = transformWithNativePreset(source);

    assert.match(code, /class TestScreen extends ShadowDomMixin\(LitElement\)/);
    assert.match(
      code,
      /return <section>\s*<suspense-boundary \.fallback=\{\(\) => <span>loading<\/span>\} \.content=\{\(\) => <span>ready<\/span>\}>\{__litsxRenderLight\(\)\}<\/suspense-boundary>\s*<\/section>;/s
    );
    assert.match(
      code,
      /static elements = \{\s*\.\.\.\(super\.elements \?\? \{\}\),\s*"suspense-boundary": SuspenseBoundary\s*\}/
    );
  });

  it("rewrites scoped tags nested inside keyed(...) expressions", () => {
    const source = `
      import { keyed } from 'lit/directives/keyed.js';
      import { SuspenseBoundary } from '@litsx\/core';

      export function TestScreen({ cycle }) {
        return (
          <section>
            {keyed(cycle, (
              <SuspenseBoundary fallback={<span>loading</span>}>
                <span>ready</span>
              </SuspenseBoundary>
            ))}
          </section>
        );
      }
    `;

    const { code } = transformWithNativePreset(source);

    assert.match(code, /class TestScreen extends ShadowDomMixin\(LitElement\)/);
    assert.match(
      code,
      /keyed\(this\.cycle,\s*<suspense-boundary \.fallback=\{\(\) => <span>loading<\/span>\} \.content=\{\(\) => <span>ready<\/span>\}>\{__litsxRenderLight\(\)\}<\/suspense-boundary>\s*\)/s
    );
    assert.match(
      code,
      /static elements = \{\s*\.\.\.\(super\.elements \?\? \{\}\),\s*"suspense-boundary": SuspenseBoundary\s*\}/
    );
  });

  it("rewrites scoped tags inside nested html templates under keyed(...) expressions", () => {
    const source = `
      import { LitElement, html } from 'lit';
      import { keyed } from 'lit/directives/keyed.js';
      import { SuspenseBoundary, SuspenseList } from '@litsx\/core';

      class TestScreen extends LitElement {
        render() {
          return html\`
            <SuspenseList reveal-order="forwards">
              \${keyed(this.cycle, html\`
                <SuspenseBoundary fallback=\${html\`<span>loading</span>\`}>
                  <span>ready</span>
                </SuspenseBoundary>
              \`)}
            </SuspenseList>
          \`;
        }
      }
    `;

    const ast = parser.parse(source, { sourceType: "module" });
    const { code } = transformFromAstSync(ast, source, {
      configFile: false,
      babelrc: false,
      plugins: [plugin],
    });

    assert.match(code, /<suspense-list reveal-order="forwards">/);
    assert.match(code, /keyed\(this\.cycle,\s*html`[\s\S]*<suspense-boundary fallback=\$\{html`<span>loading<\/span>`\}>/s);
    assert.match(
      code,
      /static elements = \{[\s\S]*"suspense-boundary": SuspenseBoundary[\s\S]*"suspense-list": SuspenseList[\s\S]*\}|static elements = \{[\s\S]*"suspense-list": SuspenseList[\s\S]*"suspense-boundary": SuspenseBoundary[\s\S]*\}/
    );
  });

});
