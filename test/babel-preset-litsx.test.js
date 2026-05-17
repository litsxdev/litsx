import assert from "assert";
import fs from "fs";
import os from "os";
import path from "path";
import babelCore from "@babel/core";
import { beforeAll, describe, it } from "vitest";

import parser from "../packages/babel-parser-litsx/src/index.js";
import { interopDefault } from "./helpers/interop-default.js";
import { PLAYGROUND_TYPE_FILES } from "./helpers/playground-virtual-types.js";
import { createLitsxTypecheckSession } from "../packages/typescript/src/typecheck.js";

const { transformFromAstSync } = babelCore;

let nativePreset;
let createLitsxPresetPlugins;
let detectLitsxSourceFeatures;

beforeAll(async () => {
  const [presetMod] = await Promise.all([
    import("../packages/babel-preset-litsx/src/index.js"),
  ]);

  nativePreset = interopDefault(presetMod);
  createLitsxPresetPlugins = presetMod.createLitsxPresetPlugins;
  detectLitsxSourceFeatures = presetMod.detectLitsxSourceFeatures;
});

describe("@litsx/babel-preset-litsx", () => {
  it("defaults to final html template lowering", () => {
    const source = [
      "export const Greeting = ({ label }) => {",
      "  return <button>{label}</button>;",
      "};",
    ].join("\n");

    const result = transformFromAstSync(parser.parse(source, { sourceType: "module" }), source, {
      configFile: false,
      babelrc: false,
      presets: [[nativePreset, {}]],
    });

    assert.match(result.code, /import \{ LitElement, html \} from "lit";/);
    assert.match(result.code, /return html`<button>\$\{this\.label\}<\/button>`;/);
  });

  it("matches the direct preset plugin factory", () => {
    const source = [
      "import FancyButton from './FancyButton.js';",
      "export const Greeting = ({ label = 'Save' }) => {",
      "  return <FancyButton .label={label} @click={save} />;",
      "};",
    ].join("\n");

    const presetResult = transformFromAstSync(parser.parse(source, { sourceType: "module" }), source, {
      configFile: false,
      babelrc: false,
      presets: [[nativePreset, {}]],
    });

    const pluginResult = transformFromAstSync(parser.parse(source, { sourceType: "module" }), source, {
      configFile: false,
      babelrc: false,
      plugins: createLitsxPresetPlugins({}),
    });

    assert.strictEqual(presetResult.code, pluginResult.code);
  });

  it("detects source features so the compiler can skip unnecessary native plugin passes", () => {
    const plainSource = [
      "export const Greeting = ({ label }) => {",
      "  return <button>{label}</button>;",
      "};",
    ].join("\n");
    const featureSource = [
      "import FancyButton from './FancyButton.js';",
      "import { useRef, useState } from '@litsx\/core';",
      "export function Greeting({ label }) {",
      "  const ref = useRef(null);",
      "  const [count] = useState(0);",
      "  return <FancyButton ref={ref}>{label}{count}</FancyButton>;",
      "}",
    ].join("\n");

    assert.deepStrictEqual(detectLitsxSourceFeatures(plainSource, {}), {
      hooks: false,
      domRefs: false,
      scopedElements: false,
    });

    assert.deepStrictEqual(detectLitsxSourceFeatures(featureSource, {}), {
      hooks: true,
      domRefs: true,
      scopedElements: true,
    });

    assert.deepStrictEqual(
      detectLitsxSourceFeatures(
        [
          "export function Greeting() {",
          "  static lightDom = true;",
          "  return <div>ready</div>;",
          "}",
        ].join("\n"),
        {},
      ),
      {
        hooks: false,
        domRefs: false,
        scopedElements: true,
      },
    );

    assert.strictEqual(
      createLitsxPresetPlugins({}, detectLitsxSourceFeatures(plainSource, {})).length,
      5,
    );
    assert.strictEqual(
      createLitsxPresetPlugins({}, detectLitsxSourceFeatures(featureSource, {})).length,
      8,
    );
  });

  it("can disable final template lowering", () => {
    const source = [
      "export const Greeting = ({ label }) => {",
      "  return <button @click={save}>{label}</button>;",
      "};",
    ].join("\n");

    const result = transformFromAstSync(parser.parse(source, { sourceType: "module" }), source, {
      configFile: false,
      babelrc: false,
      presets: [[nativePreset, { jsxTemplate: false }]],
    });

    assert.match(result.code, /class Greeting extends LitElement/);
    assert.match(result.code, /return <button @click=\{save\}>\{this\.label\}<\/button>;/);
    assert.doesNotMatch(result.code, /html`/);
  });

  it("keeps top-level lowercase helpers as plain functions and only lowers their JSX", () => {
    const source = [
      "function renderHelperWithArgs(alpha, beta, gamma) {",
      "  return <p>{alpha}{beta}{gamma}</p>;",
      "}",
      "export const Demo = () => {",
      "  return <section>{renderHelperWithArgs('a', 'b', 'c')}</section>;",
      "};",
    ].join("\n");

    const result = transformFromAstSync(parser.parse(source, { sourceType: "module" }), source, {
      configFile: false,
      babelrc: false,
      presets: [[nativePreset, {}]],
    });

    assert.match(result.code, /function renderHelperWithArgs\(alpha, beta, gamma\) \{\s*return html`<p>\$\{alpha\}\$\{beta\}\$\{gamma\}<\/p>`;\s*\}/);
    assert.match(result.code, /class Demo extends LitElement/);
    assert.doesNotMatch(result.code, /class renderHelperWithArgs extends/);
  });

  it("does not promote named lowercase exports to authored components", () => {
    const source = [
      "export function renderHelper() {",
      "  return <p>ok</p>;",
      "}",
    ].join("\n");

    const result = transformFromAstSync(parser.parse(source, { sourceType: "module" }), source, {
      configFile: false,
      babelrc: false,
      presets: [[nativePreset, {}]],
    });

    assert.match(result.code, /export function renderHelper\(\) \{\s*return html`<p>ok<\/p>`;\s*\}/);
    assert.doesNotMatch(result.code, /class renderHelper extends/);
  });

  it("can be consumed through createLitsxPresetPlugins directly", () => {
    const source = [
      "export const Greeting = ({ label }) => {",
      "  return <button @click={save}>{label}</button>;",
      "};",
    ].join("\n");

    const presetResult = transformFromAstSync(
      parser.parse(source, { sourceType: "module" }),
      source,
      {
        configFile: false,
        babelrc: false,
        presets: [[nativePreset, { jsxTemplate: false }]],
      }
    );

    const pluginFactoryResult = transformFromAstSync(
      parser.parse(source, { sourceType: "module" }),
      source,
      {
        configFile: false,
        babelrc: false,
        plugins: createLitsxPresetPlugins({ jsxTemplate: false }),
      }
    );

    assert.strictEqual(pluginFactoryResult.code, presetResult.code);
  });

  it("covers typed props, scoped elements, and final template lowering through the preset", () => {
    const source = [
      "import FancyButton from './FancyButton.js';",
      "type Props = { label: string; count: number };",
      "export const TypedForm = ({ label, count }: Props) => {",
      "  return <FancyButton .label={label}>{count}</FancyButton>;",
      "};",
    ].join("\n");

    const result = transformFromAstSync(
      parser.parse(source, {
        sourceType: "module",
        plugins: ["typescript"],
      }),
      source,
      {
        configFile: false,
        babelrc: false,
        filename: "/virtual/TypedForm.tsx",
        presets: [[nativePreset, { ssr: true }]],
      }
    );

    assert.match(result.code, /class TypedForm extends ShadowDomMixin\(LitElement\)/);
    assert.match(
      result.code,
      /static properties = \{[\s\S]*label: \{[\s\S]*type: String[\s\S]*count: \{[\s\S]*type: Number/s
    );
    assert.match(result.code, /static elements = \{\s*"fancy-button": FancyButton/s);
    assert.match(result.code, /html`/);
    assert.match(result.code, /static \[LITSX_MODULE_ID\] = "\/virtual\/TypedForm\.tsx";/);
  }, 20000);

  it("rewrites renderToString roots into scoped templates", () => {
    const source = [
      "import { renderToString } from '@litsx/ssr';",
      "import ProductCard from './ProductCard.js';",
      "export async function renderProduct(product) {",
      "  return renderToString(<ProductCard .product={product} />);",
      "}",
    ].join("\n");

    const result = transformFromAstSync(
      parser.parse(source, { sourceType: "module" }),
      source,
      {
        configFile: false,
        babelrc: false,
        presets: [[nativePreset, {}]],
      },
    );

    assert.match(result.code, /import \{ __litsxScopedTemplate \} from "@litsx\/core\/elements";/);
    assert.match(result.code, /renderToString\(__litsxScopedTemplate\(html`<product-card \.product=\$\{product\}><\/product-card>`\, \{\s*"product-card": ProductCard\s*\}\)\)/);
  });

  it("rewrites renderToStream roots into scoped templates", () => {
    const source = [
      "import { renderToStream } from '@litsx/ssr';",
      "import ProductCard from './ProductCard.js';",
      "export async function renderProduct(product) {",
      "  return renderToStream(<ProductCard .product={product} />);",
      "}",
    ].join("\n");

    const result = transformFromAstSync(
      parser.parse(source, { sourceType: "module" }),
      source,
      {
        configFile: false,
        babelrc: false,
        presets: [[nativePreset, {}]],
      },
    );

    assert.match(result.code, /import \{ __litsxScopedTemplate \} from "@litsx\/core\/elements";/);
    assert.match(result.code, /renderToStream\(__litsxScopedTemplate\(html`<product-card \.product=\$\{product\}><\/product-card>`\, \{\s*"product-card": ProductCard\s*\}\)\)/);
  });

  it("keeps default async PascalCase exports out of the LitElement lowering path", () => {
    const source = [
      "export default async function ProductPage({ slug }) {",
      "  return <main>{slug}</main>;",
      "}",
    ].join("\n");

    const result = transformFromAstSync(
      parser.parse(source, { sourceType: "module" }),
      source,
      {
        configFile: false,
        babelrc: false,
        presets: [[nativePreset, {}]],
      },
    );

    assert.doesNotMatch(result.code, /class ProductPage extends LitElement/);
    assert.match(result.code, /return __litsxScopedTemplate\(html`<main>\$\{slug\}<\/main>`\, \{\}\);/);
    assert.match(result.code, /ProductPage\[LITSX_SERVER_COMPONENT\] = true;/);
  });

  it("keeps default exports that resolve to async PascalCase bindings out of LitElement lowering", () => {
    const source = [
      "const ProductPage = async ({ slug }) => {",
      "  return <main>{slug}</main>;",
      "};",
      "export default ProductPage;",
    ].join("\n");

    const result = transformFromAstSync(
      parser.parse(source, { sourceType: "module" }),
      source,
      {
        configFile: false,
        babelrc: false,
        presets: [[nativePreset, {}]],
      },
    );

    assert.doesNotMatch(result.code, /class ProductPage extends LitElement/);
    assert.match(result.code, /const ProductPage = async \(\{\s*slug\s*\}\) => \{\s*return __litsxScopedTemplate\(html`<main>\$\{slug\}<\/main>`\, \{\}\);\s*\};/);
    assert.match(result.code, /export default ProductPage;/);
    assert.match(result.code, /ProductPage\[LITSX_SERVER_COMPONENT\] = true;/);
  });

  it("does not treat named async exports as server-side components", () => {
    const source = [
      "export async function ProductPage({ slug }) {",
      "  return <main>{slug}</main>;",
      "}",
    ].join("\n");

    const result = transformFromAstSync(
      parser.parse(source, { sourceType: "module" }),
      source,
      {
        configFile: false,
        babelrc: false,
        presets: [[nativePreset, {}]],
      },
    );

    assert.doesNotMatch(result.code, /class ProductPage extends LitElement/);
    assert.match(result.code, /export async function ProductPage\(\{\s*slug\s*\}\) \{\s*return html`<main>\$\{slug\}<\/main>`;\s*\}/);
  });

  it("fails when an async PascalCase binding is used as an SSR root without being the default export", () => {
    const source = [
      "import { renderToString } from '@litsx/ssr';",
      "async function ProductPage({ slug }) {",
      "  return <main>{slug}</main>;",
      "}",
      "export async function renderPage(slug) {",
      "  return renderToString(<ProductPage .slug={slug} />);",
      "}",
    ].join("\n");

    assert.throws(
      () =>
        transformFromAstSync(
          parser.parse(source, { sourceType: "module" }),
          source,
          {
            configFile: false,
            babelrc: false,
            presets: [[nativePreset, {}]],
          },
        ),
      /Server component "ProductPage" must be the module default export/,
    );
  });

  it("fails when a server component module is imported through a non-default binding", () => {
    const fixtureDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "litsx-server-invalid-import-"));
    const importedFilename = path.join(fixtureDirectory, "ProductPage.js");
    const entryFilename = path.join(fixtureDirectory, "entry.js");

    fs.writeFileSync(
      importedFilename,
      [
        "export default async function ProductPage({ slug }) {",
        "  return <main>{slug}</main>;",
        "}",
      ].join("\n"),
    );

    const source = [
      "import { renderToString } from '@litsx/ssr';",
      "import { ProductPage } from './ProductPage.js';",
      "export async function renderPage(slug) {",
      "  return renderToString(<ProductPage .slug={slug} />);",
      "}",
    ].join("\n");

    assert.throws(
      () =>
        transformFromAstSync(
          parser.parse(source, { sourceType: "module" }),
          source,
          {
            configFile: false,
            babelrc: false,
            filename: entryFilename,
            presets: [[nativePreset, {}]],
          },
        ),
      /must be imported as a default binding/,
    );
  });

  it("does not treat default async PascalCase exports without a renderable return as server-side components", () => {
    const source = [
      "export default async function ProductPage({ slug }) {",
      "  return slug.length;",
      "}",
    ].join("\n");

    const result = transformFromAstSync(
      parser.parse(source, { sourceType: "module" }),
      source,
      {
        configFile: false,
        babelrc: false,
        presets: [[nativePreset, {}]],
      },
    );

    assert.doesNotMatch(result.code, /class ProductPage extends LitElement/);
    assert.doesNotMatch(result.code, /import \{ html \} from "lit";/);
    assert.match(result.code, /export default async function ProductPage\(\{\s*slug\s*\}\) \{\s*return slug\.length;\s*\}/);
  });

  it("lowers default async PascalCase exports with scoped JSX returns into server-side components", () => {
    const source = [
      "import ProductCard from './ProductCard.js';",
      "export default async function ProductPage({ product }) {",
      "  return <main><ProductCard .product={product} /></main>;",
      "}",
    ].join("\n");

    const result = transformFromAstSync(
      parser.parse(source, { sourceType: "module" }),
      source,
      {
        configFile: false,
        babelrc: false,
        presets: [[nativePreset, {}]],
      },
    );

    assert.doesNotMatch(result.code, /class ProductPage extends LitElement/);
    assert.match(result.code, /import \{ __litsxScopedTemplate, LITSX_SERVER_COMPONENT \} from "@litsx\/core\/elements";|import \{ LITSX_SERVER_COMPONENT, __litsxScopedTemplate \} from "@litsx\/core\/elements";/);
    assert.match(result.code, /return __litsxScopedTemplate\(html`<main><product-card \.product=\$\{product\}><\/product-card><\/main>`\, \{\s*"product-card": ProductCard\s*\}\);/);
    assert.match(result.code, /ProductPage\[LITSX_SERVER_COMPONENT\] = true;/);
  });

  it("rewrites renderToString server-component roots into awaited function calls", () => {
    const source = [
      "import { renderToString } from '@litsx/ssr';",
      "export default async function ProductPage({ slug }) {",
      "  return <main>{slug}</main>;",
      "}",
      "export async function renderPage(slug) {",
      "  return renderToString(<ProductPage .slug={slug} />);",
      "}",
    ].join("\n");

    const result = transformFromAstSync(
      parser.parse(source, { sourceType: "module" }),
      source,
      {
        configFile: false,
        babelrc: false,
        presets: [[nativePreset, {}]],
      },
    );

    assert.match(result.code, /import \{[\s\S]*__litsxServerComponentCall[\s\S]*\} from "@litsx\/core\/elements";/);
    assert.match(result.code, /return renderToString\(__litsxServerComponentCall\(ProductPage, \{\s*slug: slug\s*\}\)\);/);
    assert.doesNotMatch(result.code, /renderToString\(__litsxScopedTemplate/);
  });

  it("rewrites imported server-component roots into runtime call markers", () => {
    const fixtureDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "litsx-server-root-"));
    const importedFilename = path.join(fixtureDirectory, "ProductPage.js");
    const entryFilename = path.join(fixtureDirectory, "entry.js");

    fs.writeFileSync(
      importedFilename,
      [
        "export default async function ProductPage({ slug }) {",
        "  return <main>{slug}</main>;",
        "}",
      ].join("\n"),
    );

    const source = [
      "import { renderToString } from '@litsx/ssr';",
      "import ProductPage from './ProductPage.js';",
      "export async function renderPage(slug) {",
      "  return renderToString(<ProductPage .slug={slug} />);",
      "}",
    ].join("\n");

    const result = transformFromAstSync(
      parser.parse(source, { sourceType: "module" }),
      source,
      {
        configFile: false,
        babelrc: false,
        filename: entryFilename,
        presets: [[nativePreset, {}]],
      },
    );

    assert.match(result.code, /renderToString\(__litsxServerComponentCall\(ProductPage, \{\s*slug: slug\s*\}\)\);/);
    assert.doesNotMatch(result.code, /renderToString\(__litsxScopedTemplate/);
  });

  it("rewrites aliased imported server-component roots through shared import resolution", () => {
    const fixtureDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "litsx-server-root-alias-"));

    try {
      const srcDirectory = path.join(fixtureDirectory, "src");
      fs.mkdirSync(path.join(srcDirectory, "pages"), { recursive: true });
      const importedFilename = path.join(srcDirectory, "pages", "ProductPage.js");
      const entryFilename = path.join(srcDirectory, "entry.js");
      const tsconfigPath = path.join(fixtureDirectory, "tsconfig.json");

      fs.writeFileSync(tsconfigPath, JSON.stringify({
        compilerOptions: {
          baseUrl: ".",
          paths: {
            "@/*": ["src/*"],
          },
          allowJs: true,
          jsx: "preserve",
          module: "esnext",
          target: "esnext",
        },
        include: ["src/**/*"],
      }));

      fs.writeFileSync(
        importedFilename,
        [
          "export default async function ProductPage({ slug }) {",
          "  return <main>{slug}</main>;",
          "}",
        ].join("\n"),
      );

      const source = [
        "import { renderToString } from '@litsx/ssr';",
        'import ProductPage from "@/pages/ProductPage.js";',
        "export async function renderPage(slug) {",
        "  return renderToString(<ProductPage .slug={slug} />);",
        "}",
      ].join("\n");

      const session = createLitsxTypecheckSession(["--project", tsconfigPath]);
      try {
        const result = transformFromAstSync(
          parser.parse(source, { sourceType: "module" }),
          source,
          {
            configFile: false,
            babelrc: false,
            filename: entryFilename,
            presets: [[nativePreset, {
              typescriptSession: session.projectSession,
            }]],
          },
        );

        assert.match(result.code, /renderToString\(__litsxServerComponentCall\(ProductPage, \{\s*slug: slug\s*\}\)\);/);
        assert.doesNotMatch(result.code, /renderToString\(__litsxScopedTemplate/);
      } finally {
        session.projectSession.dispose?.();
      }
    } finally {
      fs.rmSync(fixtureDirectory, { recursive: true, force: true });
    }
  });

  it("dedupes scoped entries across fragment SSR roots", () => {
    const source = [
      "import { renderToString } from '@litsx/ssr';",
      "import ProductCard from './ProductCard.js';",
      "export async function renderProducts(a, b) {",
      "  return renderToString(<>",
      "    <main><ProductCard .product={a} /></main>",
      "    <ProductCard .product={b} />",
      "  </>);",
      "}",
    ].join("\n");

    const result = transformFromAstSync(
      parser.parse(source, { sourceType: "module" }),
      source,
      {
        configFile: false,
        babelrc: false,
        presets: [[nativePreset, {}]],
      },
    );

    const matches = result.code.match(/"product-card": ProductCard/g) || [];
    assert.strictEqual(matches.length, 1);
    assert.match(result.code, /renderToString\(__litsxScopedTemplate\(html`/);
  });

  it("lowers nested imported server components inside server-side component returns", () => {
    const fixtureDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "litsx-server-nested-"));
    const importedFilename = path.join(fixtureDirectory, "ProductSection.js");
    const entryFilename = path.join(fixtureDirectory, "ProductPage.js");

    fs.writeFileSync(
      importedFilename,
      [
        "export default async function ProductSection({ product }) {",
        "  return <section>{product.name}</section>;",
        "}",
      ].join("\n"),
    );

    const source = [
      "import ProductSection from './ProductSection.js';",
      "export default async function ProductPage({ product }) {",
      "  return <main><ProductSection .product={product} /></main>;",
      "}",
    ].join("\n");

    const result = transformFromAstSync(
      parser.parse(source, { sourceType: "module" }),
      source,
      {
        configFile: false,
        babelrc: false,
        filename: entryFilename,
        presets: [[nativePreset, {}]],
      },
    );

    assert.match(result.code, /import \{[\s\S]*__litsxServerComponentCall[\s\S]*\} from "@litsx\/core\/elements";/);
    assert.match(result.code, /return __litsxScopedTemplate\(html`<main>\$\{__litsxServerComponentCall\(ProductSection, \{\s*product: product\s*\}\)\}<\/main>`\, \{\}\);/);
    assert.doesNotMatch(result.code, /"product-section": ProductSection/);
  });

  it("allows nested async PascalCase bindings inside a default-export server component", () => {
    const source = [
      "async function ProductSection({ product }) {",
      "  return <section>{product.name}</section>;",
      "}",
      "export default async function ProductPage({ product }) {",
      "  return <main><ProductSection .product={product} /></main>;",
      "}",
    ].join("\n");

    const result = transformFromAstSync(
      parser.parse(source, { sourceType: "module" }),
      source,
      {
        configFile: false,
        babelrc: false,
        presets: [[nativePreset, {}]],
      },
    );

    assert.match(
      result.code,
      /return __litsxScopedTemplate\(html`<main>\$\{__litsxServerComponentCall\(ProductSection, \{\s*product: product\s*\}\)\}<\/main>`\, \{\}\);/,
    );
  });

  it("lowers nested async PascalCase bindings inside fragment returns for default-export server components", () => {
    const source = [
      "async function ProductSection({ product }) {",
      "  return <section>{product.name}</section>;",
      "}",
      "export default async function ProductPage({ product }) {",
      "  return <>",
      "    <ProductSection .product={product} />",
      "    <footer>done</footer>",
      "  </>;",
      "}",
    ].join("\n");

    const result = transformFromAstSync(
      parser.parse(source, { sourceType: "module" }),
      source,
      {
        configFile: false,
        babelrc: false,
        presets: [[nativePreset, {}]],
      },
    );

    assert.match(
      result.code,
      /return __litsxScopedTemplate\(html`\$\{__litsxServerComponentCall\(ProductSection, \{\s*product: product\s*\}\)\}<footer>done<\/footer>`\, \{\}\);/,
    );
  });

  it("keeps nested server-component projection inside Lit component light-dom children", () => {
    const fixtureDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "litsx-server-lit-projection-"));
    const importedFilename = path.join(fixtureDirectory, "ProductActions.js");
    const entryFilename = path.join(fixtureDirectory, "ProductPage.js");

    fs.writeFileSync(
      importedFilename,
      [
        "export default async function ProductActions({ product }) {",
        "  return <p>{product.copy}</p>;",
        "}",
      ].join("\n"),
    );

    const source = [
      "import ProductCard from './ProductCard.js';",
      "import ProductActions from './ProductActions.js';",
      "export default async function ProductPage({ product }) {",
      "  return <ProductCard .product={product}><ProductActions .product={product} /></ProductCard>;",
      "}",
    ].join("\n");

    const result = transformFromAstSync(
      parser.parse(source, { sourceType: "module" }),
      source,
      {
        configFile: false,
        babelrc: false,
        filename: entryFilename,
        presets: [[nativePreset, {}]],
      },
    );

    assert.match(
      result.code,
      /return __litsxScopedTemplate\(html`<product-card \.product=\$\{product\}>\$\{__litsxServerComponentCall\(ProductActions, \{\s*product: product\s*\}\)\}<\/product-card>`\, \{\s*"product-card": ProductCard\s*\}\);/,
    );
    assert.doesNotMatch(result.code, /"product-actions": ProductActions/);
  });

  it("does not lower React-only wrappers in the native preset", () => {
    const source = [
      "import { forwardRef, memo } from 'react';",
      "export const Card = memo(",
      "  forwardRef(function Card({ title }, ref) {",
      "    return <label ref={ref}>{title}</label>;",
      "  })",
      ");",
    ].join("\n");

    const result = transformFromAstSync(
      parser.parse(source, { sourceType: "module" }),
      source,
      {
        configFile: false,
        babelrc: false,
        presets: [[nativePreset, { jsxTemplate: false }]],
      }
    );

    assert.match(result.code, /\bmemo\(/);
    assert.match(result.code, /\bforwardRef\(/);
    assert.doesNotMatch(result.code, /useCallbackRef\(this,/);
  });

  it("does not lower React propTypes in the native preset anymore", () => {
    const source = [
      "import PropTypes from 'prop-types';",
      "export function Card(props) {",
      "  return <article>{props.title}</article>;",
      "}",
      "Card.propTypes = {",
      "  title: PropTypes.string,",
      "};",
    ].join("\n");

    const result = transformFromAstSync(
      parser.parse(source, { sourceType: "module" }),
      source,
      {
        configFile: false,
        babelrc: false,
        presets: [[nativePreset, { jsxTemplate: false }]],
      }
    );

    assert.match(result.code, /Card\.propTypes = \{/);
    assert.match(result.code, /import PropTypes from ['"]prop-types['"]/);
    assert.doesNotMatch(result.code, /__litsx_static_properties\(/);
  });

  it("covers a combined native preset path with static hoists, handlers, refs, and scoped elements", () => {
    const source = [
      "import FancyButton from './FancyButton.js';",
      "import { useRef, useState } from '@litsx\/core';",
      "type Props = { label: string; active: boolean };",
      "export function ActionCard({ label, active }: Props) {",
      "  const buttonRef = useRef(null);",
      "  const [count, setCount] = useState(0);",
      "  static styles = `:host { display: block; }`;",
      "  static properties = { active: { reflect: true } };",
      "  return <FancyButton ref={buttonRef} .label={label} @click={() => setCount(count + 1)}>{active ? count : 0}</FancyButton>;",
      "}",
    ].join("\n");

    const result = transformFromAstSync(
      parser.parse(source, {
        sourceType: "module",
        plugins: ["typescript"],
      }),
      source,
      {
        configFile: false,
        babelrc: false,
        filename: "/virtual/ActionCard.tsx",
        presets: [[nativePreset, {}]],
      }
    );

    assert.match(result.code, /extends ShadowDomMixin\(LitsxStaticHoistsMixin\(LitElement\)\)|extends LitsxStaticHoistsMixin\(ShadowDomMixin\(LitElement\)\)/);
    assert.match(result.code, /static get styles\(\)/);
    assert.match(result.code, /static get properties\(\)/);
    assert.match(result.code, /reflect: true/);
    assert.match(result.code, /static elements = \{\s*"fancy-button": FancyButton\s*\}/);
    assert.match(result.code, /const buttonRef = useRef\(this, null\);/);
    assert.match(result.code, /const \[count, setCount\] = useState\(this, 0\);/);
    assert.match(result.code, /html`<fancy-button \.ref=\$\{buttonRef\} \.label=\$\{this\.label\} @click=\$\{\(\) => setCount\(count \+ 1\)\}>/);
  }, 20_000);

  it("supports in-memory playground type resolution through the preset", () => {
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
        return <article>{props.title}</article>;
      }
    `;

    const result = transformFromAstSync(
      parser.parse(source, {
        sourceType: "module",
        plugins: ["typescript"],
      }),
      source,
      {
        configFile: false,
        babelrc: false,
        filename: "/virtual/Card.tsx",
        presets: [[nativePreset, {
          jsxTemplate: false,
          typeResolutionMode: "in-memory",
          inMemoryFiles: PLAYGROUND_TYPE_FILES,
        }]],
      }
    );

    assert.match(result.code, /title: \{\s*type: String\s*\}/);
    assert.match(result.code, /active: \{\s*type: Boolean\s*\}/);
    assert.match(result.code, /payload: \{\s*type: Object\s*\}/);
  });

  it("lowers native useState through the canonical preset", () => {
    const source = [
      "import { useState } from '@litsx\/core';",
      "export function Counter() {",
      "  const [count, setCount] = useState(1);",
      "  return <button @click={() => setCount(count + 1)}>{count}</button>;",
      "}",
    ].join("\n");

    const result = transformFromAstSync(
      parser.parse(source, { sourceType: "module" }),
      source,
      {
        configFile: false,
        babelrc: false,
        presets: [[nativePreset, { jsxTemplate: false }]],
      }
    );

    assert.match(result.code, /class Counter extends LitElement/);
    assert.match(
      result.code,
      /import \{[^}]*useState[^}]*prepareEffects[^}]*\} from ['"]@litsx\/core['"]|import \{[^}]*prepareEffects[^}]*useState[^}]*\} from ['"]@litsx\/core['"]/
    );
    assert.match(result.code, /prepareEffects\(this\);/);
    assert.match(result.code, /const \[count, setCount\] = useState\(this, 1\);/);
    assert.match(result.code, /return <button @click=\{\(\) => setCount\(count \+ 1\)\}>\{count\}<\/button>;/);
  });

  it("preserves sibling declarators around native useState through the preset", () => {
    const source = [
      "import { useState } from '@litsx\/core';",
      "export function Counter() {",
      "  const label = 'ok', [count, setCount] = useState(0);",
      "  setCount(count + 1);",
      "  return <div>{label}: {count}</div>;",
      "}",
    ].join("\n");

    const result = transformFromAstSync(
      parser.parse(source, { sourceType: "module" }),
      source,
      {
        configFile: false,
        babelrc: false,
        presets: [[nativePreset, { jsxTemplate: false }]],
      }
    );

    assert.match(result.code, /const label = 'ok',\s*\[count, setCount\] = useState\(this, 0\);/);
  });

  it("threads host through local custom hooks that call native useState", () => {
    const source = [
      "import { useState } from '@litsx\/core';",
      "function useCounter(initial) {",
      "  const [value, setValue] = useState(initial);",
      "  return [value, setValue];",
      "}",
      "export function Counter() {",
      "  const [value, setValue] = useCounter(0);",
      "  return <button @click={() => setValue(value + 1)}>{value}</button>;",
      "}",
    ].join("\n");

    const result = transformFromAstSync(
      parser.parse(source, { sourceType: "module" }),
      source,
      {
        configFile: false,
        babelrc: false,
        presets: [[nativePreset, { jsxTemplate: false }]],
      }
    );

    assert.match(result.code, /function useCounter\(_[A-Za-z0-9]+, initial\)/);
    assert.match(result.code, /const \[value, setValue\] = useState\(_[A-Za-z0-9]+, initial\);/);
    assert.match(result.code, /prepareEffects\(this\);/);
    assert.match(result.code, /const \[value, setValue\] = useCounter\(this, 0\);/);
  });

  it("injects prepareEffects and host args for native effect hooks through the preset", () => {
    const source = [
      "import { useAfterUpdate } from '@litsx\/core';",
      "export function Counter() {",
      "  useAfterUpdate(() => {",
      "    this.flag = true;",
      "  }, []);",
      "  return <p>{this.flag}</p>;",
      "}",
    ].join("\n");

    const result = transformFromAstSync(
      parser.parse(source, { sourceType: "module" }),
      source,
      {
        configFile: false,
        babelrc: false,
        presets: [[nativePreset, { jsxTemplate: false }]],
      }
    );

    assert.match(
      result.code,
      /import \{[^}]*useAfterUpdate[^}]*prepareEffects[^}]*\} from ['"]@litsx\/core['"]|import \{[^}]*prepareEffects[^}]*useAfterUpdate[^}]*\} from ['"]@litsx\/core['"]/
    );
    assert.match(result.code, /prepareEffects\(this\);/);
    assert.match(result.code, /useAfterUpdate\(this, \(\) => \{\s*this\.flag = true;\s*}, \[]\);/s);
  });

  it("threads host through native custom hooks in the preset", () => {
    const source = [
      "import { useStableCallback, useAfterUpdate } from '@litsx\/core';",
      "function useCustom(flag) {",
      "  const callback = useStableCallback(() => flag, [flag]);",
      "  useAfterUpdate(() => flag && callback(), [flag, callback]);",
      "  return callback;",
      "}",
      "export function Counter() {",
      "  const value = useCustom(this.flag);",
      "  return <button>{String(value && value())}</button>;",
      "}",
    ].join("\n");

    const result = transformFromAstSync(
      parser.parse(source, { sourceType: "module" }),
      source,
      {
        configFile: false,
        babelrc: false,
        presets: [[nativePreset, { jsxTemplate: false }]],
      }
    );

    assert.match(result.code, /function useCustom\(_host, flag\)/);
    assert.match(result.code, /const callback = useStableCallback\(_host, \(\) => flag, \[flag\]\);/);
    assert.match(result.code, /useAfterUpdate\(_host, \(\) => flag && callback\(\), \[flag, callback\]\);/);
    assert.match(result.code, /prepareEffects\(this\);/);
    assert.match(result.code, /const value = useCustom\(this, this\.flag\);/);
  });

  it("injects host for native useEmit through the preset", () => {
    const source = [
      "import { useEmit } from '@litsx\/core';",
      "export function Counter() {",
      "  const emit = useEmit();",
      "  emit('change', this.value, { cancelable: true });",
      "  return <div>{this.value}</div>;",
      "}",
    ].join("\n");

    const result = transformFromAstSync(
      parser.parse(source, { sourceType: "module" }),
      source,
      {
        configFile: false,
        babelrc: false,
        presets: [[nativePreset, { jsxTemplate: false }]],
      }
    );

    assert.match(result.code, /prepareEffects\(this\);/);
    assert.match(result.code, /const emit = useEmit\(this\);/);
    assert.match(result.code, /emit\('change', this\.value, \{\s*cancelable: true\s*\}\);/);
  });

  it("lowers native useRef DOM bindings through the canonical preset", () => {
    const source = [
      "import { useRef } from '@litsx\/core';",
      "export function Counter() {",
      "  const buttonRef = useRef(null);",
      "  return <button ref={buttonRef}>Click</button>;",
      "}",
    ].join("\n");

    const result = transformFromAstSync(
      parser.parse(source, { sourceType: "module" }),
      source,
      {
        configFile: false,
        babelrc: false,
        presets: [[nativePreset, { jsxTemplate: false }]],
      }
    );

    assert.match(result.code, /import \{[^}]*useRef[^}]*\} from ['"]@litsx\/core['"]/);
    assert.match(result.code, /import \{[^}]*useCallbackRef[^}]*\} from ['"]@litsx\/core['"]/);
    assert.match(result.code, /import \{[^}]*prepareEffects[^}]*\} from ['"]@litsx\/core['"]/);
    assert.match(result.code, /prepareEffects\(this\);/);
    assert.match(result.code, /const buttonRef = useRef\(this, null\);/);
    assert.match(result.code, /useCallbackRef\(this, \(\) => this\._buttonRefElement, node => buttonRef\.current = node\);/);
    assert.match(result.code, /get _buttonRefElement\(\)/);
    assert.match(result.code, /data-ref="_buttonRefElement"/);
  });

  it("keeps non-DOM native useRef bindings as mutable refs through the preset", () => {
    const source = [
      "import { useRef } from '@litsx\/core';",
      "export function Counter() {",
      "  const workerRef = useRef(null);",
      "  workerRef.current = 'ok';",
      "  return <div>{workerRef.current}</div>;",
      "}",
    ].join("\n");

    const result = transformFromAstSync(
      parser.parse(source, { sourceType: "module" }),
      source,
      {
        configFile: false,
        babelrc: false,
        presets: [[nativePreset, { jsxTemplate: false }]],
      }
    );

    assert.match(result.code, /const workerRef = useRef\(this, null\);/);
    assert.match(result.code, /workerRef\.current = 'ok';/);
    assert.doesNotMatch(result.code, /get workerRef\(\)/);
    assert.doesNotMatch(result.code, /data-ref="/);
  });

  it("does not follow external playground imports when using in-memory mode", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "litsx-playground-"));
    const typesPath = path.join(tempDir, "types.ts");
    const componentPath = path.join(tempDir, "Card.tsx");

    fs.writeFileSync(
      typesPath,
      [
        "export interface CardProps {",
        "  title: string;",
        "  active: boolean;",
        "}",
      ].join("\n")
    );

    const source = [
      "import type { CardProps } from './types';",
      "function Card({ title, active }: CardProps) {",
      "  return <article>{title} {active ? 'on' : 'off'}</article>;",
      "}",
    ].join("\n");

    const result = transformFromAstSync(
      parser.parse(source, {
        sourceType: "module",
        plugins: ["typescript"],
      }),
      source,
      {
        configFile: false,
        babelrc: false,
        filename: componentPath,
        presets: [[nativePreset, {
          jsxTemplate: false,
          typeResolutionMode: "in-memory",
          inMemoryFiles: PLAYGROUND_TYPE_FILES,
        }]],
      }
    );

    assert.match(result.code, /title: \{\s*type: String\s*\}/);
    assert.match(result.code, /active: \{\s*type: String\s*\}/);
  });
});
