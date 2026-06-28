import assert from "assert";
import babelCore from "@babel/core";
import fs from "fs";
import os from "os";
import path from "path";
import parser from "./helpers/litsx-parser.js";
import transformLitsxRendererProps from "../packages/babel-preset-litsx/src/internal/transform-litsx-renderer-props.js";
import { setElementCandidatesBabelTypes } from "../packages/babel-preset-litsx/src/internal/transform-litsx-element-candidates.js";

const { transformFromAstSync } = babelCore;

beforeAll(() => {
  setElementCandidatesBabelTypes(babelCore.types);
});

function transform(source, filename = "/virtual/Demo.litsx") {
  const ast = parser.parse(source, { sourceType: "module" });
  return transformFromAstSync(ast, source, {
    configFile: false,
    babelrc: false,
    filename,
    plugins: [[transformLitsxRendererProps, {}]],
  }).code;
}

describe("native renderer-props internals", () => {
  it("adds bindRendererContext to an existing runtime import without duplicating the import", () => {
    const source = [
      'import { renderRendererCall } from "@litsx/core/rendering";',
      'import { FancyButton } from "./fancy-button.litsx";',
      "const renderCard = () => <FancyButton />;",
      "export const Demo = () => <GuideCard .header={renderCard} />;",
    ].join("\n");

    const code = transform(source);

    assert.match(
      code,
      /import \{ renderRendererCall, bindRendererContext \} from "@litsx\/core\/rendering";/
    );
    assert.match(
      code,
      /\.header=\{bindRendererContext\(typeof this === "undefined" \? null : this,\s*renderCard,\s*\{\s*projected: true\s*\}\)\}/
    );
  });

  it("binds imported renderer helpers that transitively return component JSX", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "litsx-renderer-props-"));
    try {
      const rootFile = path.join(tempDir, "demo.litsx");
      const helperFile = path.join(tempDir, "renderers.js");
      const buttonFile = path.join(tempDir, "fancy-button.litsx");

      fs.writeFileSync(
        helperFile,
        [
          'import { FancyButton } from "./fancy-button.litsx";',
          "export function renderHeader() {",
          "  return <FancyButton />;",
          "}",
        ].join("\n")
      );
      fs.writeFileSync(buttonFile, 'export const FancyButton = () => <button />;');

      const source = [
        'import { renderHeader } from "./renderers.js";',
        "export const Demo = () => <GuideCard .header={renderHeader} />;",
      ].join("\n");

      const code = transform(source, rootFile);

      assert.match(
        code,
        /\.header=\{bindRendererContext\(typeof this === "undefined" \? null : this,\s*renderHeader,\s*\{\s*projected: true\s*\}\)\}/
      );
      assert.match(
        code,
        /import \{ bindRendererContext \} from "@litsx\/core\/rendering";/
      );
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("does not bind member-expression renderer props or intrinsic targets", () => {
    const source = [
      "const helpers = { renderHeader: () => <FancyButton /> };",
      'import { FancyButton } from "./fancy-button.litsx";',
      "export const Demo = () => (",
      "  <>",
      "    <GuideCard .header={helpers.renderHeader} />",
      "    <div .header={() => <FancyButton />} />",
      "  </>",
      ");",
    ].join("\n");

    const code = transform(source);

    assert.doesNotMatch(code, /helpers\.renderHeader\)\}/);
    assert.doesNotMatch(code, /<div \.header=\{bindRendererContext/);
  });

  it("binds inline renderers through fragments, arrays, conditionals, and helper calls that return component JSX", () => {
    const source = [
      'import { FancyButton } from "./fancy-button.litsx";',
      "const renderInner = () => <FancyButton />;",
      "export const Demo = () => (",
      "  <GuideCard",
      "    .fromFragment={() => <><span />{renderInner()}</>}",
      "    .fromConditional={() => (flag ? <span /> : <FancyButton />)}",
      "    .fromLogical={() => ready && <FancyButton />}",
      "    .fromArray={() => [null, <FancyButton />]}",
      "  />",
      ");",
    ].join("\n");

    const code = transform(source);

    assert.match(code, /\.fromFragment=\{bindRendererContext\(/);
    assert.match(code, /\.fromConditional=\{bindRendererContext\(/);
    assert.match(code, /\.fromLogical=\{bindRendererContext\(/);
    assert.match(code, /\.fromArray=\{bindRendererContext\(/);
  });

  it("skips inline renderers whose expressions never reach component JSX", () => {
    const source = [
      "const renderText = () => ['plain', maybe && value, condition ? 'a' : 'b'];",
      "export const Demo = () => <GuideCard .header={renderText} .footer={() => maybe && 'ok'} />;",
    ].join("\n");

    const code = transform(source);

    assert.doesNotMatch(code, /\.header=\{bindRendererContext\(/);
    assert.doesNotMatch(code, /\.footer=\{bindRendererContext\(/);
  });

  it("treats member-expression and namespaced tags as component-like surfaces", () => {
    const source = [
      'import { FancyButton } from "./fancy-button.litsx";',
      "const renderCard = () => <FancyButton />;",
      "export const Demo = () => (",
      "  <>",
      "    <UI.Card .header={renderCard} />",
      "    <svg:path .header={renderCard} />",
      "  </>",
      ");",
    ].join("\n");

    const code = transform(source);

    assert.match(code, /<UI\.Card \.header=\{bindRendererContext\(/);
    assert.match(code, /<svg:path \.header=\{bindRendererContext\(/);
  });
});
