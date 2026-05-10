import assert from "assert";
import babelCore from "@babel/core";
import * as t from "@babel/types";
import {
  createTransformFunctionToClassPlugin,
  isCapitalizedComponentName,
} from "../packages/babel-preset-litsx/src/internal/transform-litsx-components.js";

const { transformSync } = babelCore;

function getMemoWrapperMetadata(callPath) {
  if (!callPath.isCallExpression()) {
    return null;
  }

  if (!t.isIdentifier(callPath.node.callee, { name: "memo" })) {
    return null;
  }

  const functionPath = callPath.get("arguments.0");
  if (
    !functionPath?.isArrowFunctionExpression?.() &&
    !functionPath?.isFunctionExpression?.()
  ) {
    return null;
  }

  return {
    functionPath,
    options: {},
  };
}

function runNativeTransform(source, pluginOptions = {}, babelOptions = {}) {
  const factory = createTransformFunctionToClassPlugin();
  const plugin = factory(
    {
      assertVersion() {},
      types: t,
    },
    pluginOptions,
  );

  return transformSync(source, {
    configFile: false,
    babelrc: false,
    filename: "/virtual/Component.tsx",
    parserOpts: {
      sourceType: "module",
      plugins: ["jsx", "typescript"],
    },
    plugins: [plugin],
    ...babelOptions,
  }).code;
}

describe("native components internals", () => {
  it("classifies capitalized component names defensively", () => {
    assert.strictEqual(isCapitalizedComponentName("Card"), true);
    assert.strictEqual(isCapitalizedComponentName("button"), false);
    assert.strictEqual(isCapitalizedComponentName(""), false);
    assert.strictEqual(isCapitalizedComponentName(null), false);
  });

  it("handles pre/post lifecycle without a Babel file and normalizes warning metadata", () => {
    const factory = createTransformFunctionToClassPlugin();
    const plugin = factory({
      assertVersion() {},
      types: t,
    });

    assert.doesNotThrow(() => {
      plugin.pre.call({});
      plugin.post.call({});
    });

    const state = {
      file: { metadata: {} },
    };

    plugin.pre.call(state);
    delete state.__litsxWarnings;
    plugin.post.call(state);

    assert.deepStrictEqual(state.file.metadata.litsxWarnings, []);
  });

  it("transforms top-level capitalized arrow-function declarators into component classes", () => {
    const code = runNativeTransform(`
      const Card = ({ title }: { title: string }) => {
        __litsx_static_properties({ title: { reflect: true } });
        return <section>{title}</section>;
      };
    `);

    assert.match(code, /class Card extends LitsxStaticHoistsMixin\(LitElement\)/);
    assert.match(code, /static get properties\(\) \{[\s\S]*__litsxMergeProperties\(\{[\s\S]*type: String[\s\S]*reflect: true[\s\S]*\)\)\);[\s\S]*\}/);
    assert.match(code, /return <section>\{this\.title\}<\/section>;/);
  });

  it("transforms top-level capitalized function declarations into component classes", () => {
    const code = runNativeTransform(`
      function Card({ title }: { title: string }) {
        return <section>{title}</section>;
      }
    `);

    assert.match(code, /class Card extends LitElement/);
    assert.match(code, /static properties = \{[\s\S]*title: \{[\s\S]*type: String[\s\S]*\};/);
    assert.match(code, /return <section>\{this\.title\}<\/section>;/);
  });

  it("does not transform nested capitalized components inside other functions", () => {
    const code = runNativeTransform(`
      function makeCard() {
        const Card = () => <section>nested</section>;
        return Card;
      }
    `);

    assert.match(code, /const Card = \(\) => <section>nested<\/section>;/);
    assert.doesNotMatch(code, /class Card extends LitElement/);
  });

  it("transforms exported named arrow components", () => {
    const code = runNativeTransform(`
      export const Card = ({ title }: { title: string }) => {
        return <section>{title}</section>;
      };
    `);

    assert.match(code, /export class Card extends LitElement/);
    assert.match(code, /static properties = \{[\s\S]*title: \{[\s\S]*type: String[\s\S]*\};/);
  });

  it("transforms default-exported function components", () => {
    const code = runNativeTransform(`
      export default function Card({ title }: { title: string }) {
        return <section>{title}</section>;
      }
    `);

    assert.match(code, /export default class Card extends LitElement/);
    assert.match(code, /static properties = \{[\s\S]*title: \{[\s\S]*type: String[\s\S]*\};/);
  });

  it("falls back to AnonymousComponent for anonymous default-exported function components", () => {
    const code = runNativeTransform(`
      export default function ({ title }: { title: string }) {
        return <section>{title}</section>;
      }
    `);

    assert.match(code, /export default class AnonymousComponent extends LitElement/);
    assert.match(code, /static properties = \{[\s\S]*title: \{[\s\S]*type: String[\s\S]*\};/);
  });

  it("transforms wrapped component variable declarators through wrapper metadata", () => {
    const code = runNativeTransform(
      `
        const Card = memo(({ title }: { title: string }) => {
          return <section>{title}</section>;
        });
      `,
      { getWrapperMetadata: getMemoWrapperMetadata },
    );

    assert.match(code, /class Card extends LitElement/);
    assert.match(code, /static properties = \{[\s\S]*title: \{[\s\S]*type: String[\s\S]*\};/);
  });

  it("transforms default-exported wrapped components through wrapper metadata", () => {
    const code = runNativeTransform(
      `
        export default memo(function Card({ title }: { title: string }) {
          return <section>{title}</section>;
        });
      `,
      { getWrapperMetadata: getMemoWrapperMetadata },
    );

    assert.match(code, /export default class Card extends LitElement/);
    assert.match(code, /static properties = \{[\s\S]*title: \{[\s\S]*type: String[\s\S]*\};/);
  });

  it("ignores wrapped lowercase exports even when wrapper metadata exists", () => {
    const code = runNativeTransform(
      `
        export const card = memo(({ title }: { title: string }) => {
          return <section>{title}</section>;
        });
      `,
      { getWrapperMetadata: getMemoWrapperMetadata },
    );

    assert.match(code, /export const card = memo/);
    assert.doesNotMatch(code, /class card extends/);
  });
});
