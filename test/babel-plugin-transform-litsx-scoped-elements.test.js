import assert from "assert";
import babelCore from "@babel/core";
import parser from "../packages/babel-parser-litsx/src/index.js";
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
  } = options;

  const inputAst = parser.parse(source, {
    sourceType: "module",
    plugins: parserPlugins,
  });

  return transformFromAstSync(inputAst, source, {
    configFile: false,
    babelrc: false,
    filename,
    presets: [[nativePreset, { jsxTemplate: false }]],
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

  it("wraps LitElement with ShadowDomElementsMixin and registers tags", () => {
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
        node.source.value === "@litsx/litsx/runtime-infrastructure"
    );
    assert(mixinImport, "expected ShadowDomElementsMixin import");

    const classDecl = ast.program.body.find((node) => node.type === "ClassDeclaration");
    assert(classDecl, "expected transformed class declaration");
    assert.strictEqual(classDecl.superClass.type, "CallExpression");
    assert.strictEqual(classDecl.superClass.callee.name, "ShadowDomElementsMixin");

    const elementsField = classDecl.body.body.find(
      (member) => member.type === "ClassProperty" && member.key.name === "elements"
    );
    assert(elementsField, "expected elements static field");
    assert(elementsField.static, "elements field should be static");

    const elementEntry = elementsField.value.properties.find(
      (prop) => prop.key.value === "fancy-button"
    );
    assert(elementEntry, "expected fancy-button entry in elements");
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

      export const Alert = (message) => {
        const lower = message.toLowerCase();
        return <p>{lower}</p>;
      };
    `;

    const { code } = transformWithReactCompatPreset(source);

    const outputAst = parser.parse(code, { sourceType: "module" });

    const mixinImport = outputAst.program.body.find(
      (node) =>
        node.type === "ImportDeclaration" &&
        node.source.value === "@litsx/litsx/runtime-infrastructure"
    );
    assert(mixinImport, "expected ShadowDomElementsMixin import to be added");

    const fancyFormClass = outputAst.program.body.find(
      (node) => node.type === "ClassDeclaration" && node.id.name === "FancyForm"
    );
    assert(fancyFormClass, "expected FancyForm to become a class");
    assert.strictEqual(
      fancyFormClass.superClass.type,
      "CallExpression",
      "FancyForm should extend ShadowDomElementsMixin(LitElement)"
    );
    assert.strictEqual(
      fancyFormClass.superClass.callee.name,
      "ShadowDomElementsMixin"
    );

    const elementsField = fancyFormClass.body.body.find(
      (member) => member.type === "ClassProperty" && member.key.name === "elements"
    );
    assert(elementsField, "expected elements static field");
    assert(elementsField.static, "elements should be static");

    const fancyButtonEntry = elementsField.value.properties.find(
      (prop) => prop.key.value === "fancy-button"
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

    assert.match(code, /ShadowDomElementsMixin\(LitElement\)/);
    assert.match(code, /"fancy-button": FancyButton/);
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

    assert.doesNotMatch(code, /ShadowDomElementsMixin/);
    assert.doesNotMatch(code, /static elements/);
  });

  it("uses LightDomElementsMixin for light DOM dependencies", () => {
    const source = `
      import FancyButton from './FancyButton.js';

      function LightScreen() {
        ^lightDom();
        return <FancyButton />;
      }
    `;

    const { code } = transformWithNativePreset(source, {
      parserPlugins: ["typescript"],
    });

    assert.match(code, /LightDomElementsMixin\(LightDomMixin\(LitElement\)\)/);
    assert.match(code, /static elements = \{\s*"fancy-button": FancyButton\s*\};/);
    assert.match(code, /return <fancy-button\s*\/>;/);
  });

  it("uses LightDomMixin for light DOM components without element dependencies", () => {
    const source = `
      function LightCard() {
        ^lightDom();
        return <div>ready</div>;
      }
    `;

    const { code } = transformWithNativePreset(source, {
      parserPlugins: ["typescript"],
    });

    assert.match(code, /import \{ LightDomMixin \} from "@litsx\/litsx\/runtime-infrastructure";/);
    assert.match(code, /class LightCard extends LightDomMixin\(LitElement\)/);
    assert.doesNotMatch(code, /LightDomElementsMixin\(LitElement\)/);
  });

  it("reuses an existing ShadowDomElementsMixin import", () => {
    const source = `
      import { LitElement } from 'lit';
      import { ShadowDomElementsMixin } from '@litsx/litsx/runtime-infrastructure';
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

    const mixinImports = code.match(/@litsx\/litsx\/runtime-infrastructure/g) || [];
    assert.strictEqual(mixinImports.length, 1);
    assert.match(code, /class ReadyElement extends ShadowDomElementsMixin\(LitElement\)/);
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

    assert.match(code, /class MixedElement extends ShadowDomElementsMixin\(withTheme\(LitElement\)\)/);
    assert.match(code, /static elements = \{\s*"fancy-button": FancyButton\s*\}/);
  });

  it("does not duplicate ShadowDomElementsMixin when it is nested inside another mixin", () => {
    const source = `
      import { ShadowDomElementsMixin } from '@litsx/litsx/runtime-infrastructure';
      import FancyButton from './FancyButton.js';

      class MixedElement extends withTheme(ShadowDomElementsMixin(LitElement)) {
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

    const shadowMixinMatches = code.match(/ShadowDomElementsMixin\(/g) || [];
    assert.strictEqual(shadowMixinMatches.length, 1);
    assert.match(code, /class MixedElement extends withTheme\(ShadowDomElementsMixin\(LitElement\)\)/);
  });

  it("does not duplicate LightDomMixin when it is nested inside another mixin", () => {
    const source = `
      import { LightDomMixin } from '@litsx/litsx/runtime-infrastructure';

      class MixedLightCard extends withTheme(LightDomMixin(LitElement)) {
        render() {
          return <div>ready</div>;
        }
      }

      MixedLightCard._litsxLightDom = true;
    `;

    const ast = parser.parse(source, { sourceType: "module" });
    const classDecl = ast.program.body.find((node) => node.type === "ClassDeclaration");
    classDecl._litsxLightDom = true;

    const { code } = transformFromAstSync(ast, source, {
      configFile: false,
      babelrc: false,
      plugins: [plugin],
    });

    const lightMixinMatches = code.match(/LightDomMixin\(/g) || [];
    assert.strictEqual(lightMixinMatches.length, 1);
    assert.match(code, /class MixedLightCard extends withTheme\(LightDomMixin\(LitElement\)\)/);
    assert.doesNotMatch(code, /LightDomElementsMixin\(/);
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
    assert.match(code, /static elements = \{\s*"fancy-button": FancyButton\s*\}/);
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

    assert.match(code, /export class ProfileScreen extends ShadowDomElementsMixin\(LitElement\)/);
    assert.match(code, /static elements = \{\s*"profile-chip": ProfileChip\s*\}/);
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

    assert.match(code, /export class TreeNode extends ShadowDomElementsMixin\(LitElement\)/);
    assert.match(code, /static elements = \{\s*"tree-node": TreeNode\s*\}/);
    assert.match(code, /return <section>\s*<tree-node\s*\/>\s*<\/section>;/s);
  });

  it("emits the same base tag for light DOM components from different sources", () => {
    const sourceA = `
      import ProfileChip from './profile/ProfileChip.js';

      export function FirstScreen() {
        ^lightDom();
        return <ProfileChip />;
      }
    `;

    const sourceB = `
      import ProfileChip from '../shared/ProfileChip.js';

      export function SecondScreen() {
        ^lightDom();
        return <ProfileChip />;
      }
    `;

    const resultA = transformWithNativePreset(sourceA, {
      filename: "/app/screens/FirstScreen.tsx",
      parserPlugins: ["typescript"],
    });
    const resultB = transformWithNativePreset(sourceB, {
      filename: "/app/screens/SecondScreen.tsx",
      parserPlugins: ["typescript"],
    });

    assert.match(resultA.code, /static elements = \{\s*"profile-chip": ProfileChip\s*\}/);
    assert.match(resultB.code, /static elements = \{\s*"profile-chip": ProfileChip\s*\}/);
    assert.match(resultA.code, /return <profile-chip\s*\/>;/);
    assert.match(resultB.code, /return <profile-chip\s*\/>;/);
  }, 30000);

  it("keeps the same light DOM tag for the same imported constructor source", () => {
    const source = `
      import ProfileChip from './profile/ProfileChip.js';

      export function FirstScreen() {
        ^lightDom();
        return <ProfileChip />;
      }

      export function SecondScreen() {
        ^lightDom();
        return <ProfileChip />;
      }
    `;

    const { code } = transformWithNativePreset(source, {
      filename: "/app/screens/SharedScreens.tsx",
      parserPlugins: ["typescript"],
    });

    const tags = [...code.matchAll(/"(?<tag>profile-chip)": ProfileChip/g)].map(
      (match) => match.groups?.tag
    );

    assert.strictEqual(tags.length, 2);
    assert.strictEqual(tags[0], "profile-chip");
    assert.strictEqual(tags[1], "profile-chip");
  }, 30000);

  it("still rewrites scoped tags when candidates were precomputed by transform-litsx", () => {
    const source = `
      import { SuspenseBoundary } from '@litsx\/litsx';

      export function Screen() {
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

    assert.match(code, /class Screen extends ShadowDomElementsMixin\(LitElement\)/);
    assert.match(
      code,
      /return <section>\s*<suspense-boundary fallback=\{<span>loading<\/span>\}>\s*<span>ready<\/span>\s*<\/suspense-boundary>\s*<\/section>;/s
    );
    assert.match(
      code,
      /static elements = \{\s*"suspense-boundary": SuspenseBoundary\s*\}/
    );
  });

  it("rewrites scoped tags nested inside keyed(...) expressions", () => {
    const source = `
      import { keyed } from 'lit/directives/keyed.js';
      import { SuspenseBoundary } from '@litsx\/litsx';

      export function Screen({ cycle }) {
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

    assert.match(code, /class Screen extends ShadowDomElementsMixin\(LitElement\)/);
    assert.match(
      code,
      /keyed\(this\.cycle,\s*<suspense-boundary fallback=\{<span>loading<\/span>\}>\s*<span>ready<\/span>\s*<\/suspense-boundary>\s*\)/s
    );
    assert.match(
      code,
      /static elements = \{\s*"suspense-boundary": SuspenseBoundary\s*\}/
    );
  });

  it("rewrites scoped tags inside nested html templates under keyed(...) expressions", () => {
    const source = `
      import { LitElement, html } from 'lit';
      import { keyed } from 'lit/directives/keyed.js';
      import { SuspenseBoundary, SuspenseList } from '@litsx\/litsx';

      class Screen extends LitElement {
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
