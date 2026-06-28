import assert from "assert";
import * as babelParser from "@babel/parser";
import { parseWithLitsxVirtualization } from "../packages/authoring/src/parser.js";

function parse(code, options) {
  return parseWithLitsxVirtualization(babelParser.parse, code, options);
}

function parseExpression(code, options) {
  return parseWithLitsxVirtualization(babelParser.parseExpression, code, options);
}

describe("@litsx/authoring parser", () => {
  it("parses lit-html prefixed attributes", () => {
    const code = `
      const view = (
        <button .label={text} @click={handleClick} ?disabled={isDisabled}></button>
      );
    `;

    const ast = parse(code);
    const declaration = ast.program.body[0];
    const jsxElement = declaration.declarations[0].init;
    const attributes = jsxElement.openingElement.attributes;

    assert.strictEqual(attributes[0].name.name, ".label");
    assert.strictEqual(attributes[1].name.name, "@click");
    assert.strictEqual(attributes[2].name.name, "?disabled");

    attributes.forEach((attr) => {
      assert.strictEqual(attr.type, "JSXAttribute");
      assert.ok(attr.value == null || attr.value.type === "JSXExpressionContainer");
    });
  });

  it("infers JSX plugin when not explicitly passed", () => {
    const ast = parse("const tpl = <div ?hidden></div>;");
    const attrs = ast.program.body[0].declarations[0].init.openingElement.attributes;

    assert.strictEqual(attrs[0].name.name, "?hidden");
    assert.strictEqual(attrs[0].value, null);
  });

  it("parses TypeScript annotations alongside JSX", () => {
    const source = `
      const typed = (label: string, count: number) => (
        <button .label={label}>{count}</button>
      );
    `;

    const ast = parse(source, {
      sourceType: "module",
      plugins: ["typescript"],
    });

    const declaration = ast.program.body[0];
    const arrowFunction = declaration.declarations[0].init;

    const [labelParam, countParam] = arrowFunction.params;
    assert(labelParam.typeAnnotation, "expected label parameter to retain a type annotation");
    assert.strictEqual(
      labelParam.typeAnnotation.typeAnnotation.type,
      "TSStringKeyword",
      "label should parse as a string annotation",
    );
    assert(countParam.typeAnnotation, "expected count parameter to retain a type annotation");
    assert.strictEqual(
      countParam.typeAnnotation.typeAnnotation.type,
      "TSNumberKeyword",
      "count should parse as a number annotation",
    );

    const attributes = arrowFunction.body.openingElement.attributes;
    assert.strictEqual(attributes[0].name.name, ".label");
  });

  it("respects tuple-based JSX plugin entries", () => {
    const code = "const tpl = <span />;";

    assert.doesNotThrow(() => {
      parse(code, {
        sourceType: "module",
        plugins: [["jsx", { runtime: "classic" }]],
      });
    });
  });

  it("exposes parseExpression helper", () => {
    const expr = parseExpression("<button .label={value} />", {
      plugins: ["typescript"],
    });

    assert.strictEqual(expr.type, "JSXElement");
    assert.strictEqual(expr.openingElement.name.name, "button");
  });

  it("parses hoisted static macros after authored preprocessing", () => {
    const source = `
      function Card() {
        static styles = \`:host { display: block; }\`;
        static properties = { active: { reflect: true } };
        static shadowRootOptions = { delegatesFocus: true };
        static lightDom = true;
        return <div />;
      }
    `;

    const ast = parse(source, { sourceType: "module", plugins: ["typescript"] });
    const body = ast.program.body[0].body.body;

    assert.strictEqual(body[0].expression.callee.name, "__litsx_static_styles");
    assert.strictEqual(body[1].expression.callee.name, "__litsx_static_properties");
    assert.strictEqual(body[2].expression.callee.name, "__litsx_static_shadowRootOptions");
    assert.strictEqual(body[3].expression.callee.name, "__litsx_static_lightDom");
  });

  it("parses hoisted static macros after leading comments", () => {
    const source = `
      function Card() {
        // component-owned stylesheet
        static styles = \`:host { display: block; }\`;
        return <div />;
      }
    `;

    const ast = parse(source, { sourceType: "module", plugins: ["typescript"] });
    const body = ast.program.body[0].body.body;

    assert.strictEqual(body[0].expression.callee.name, "__litsx_static_styles");
  });

  it("does not virtualize removed authored mixin syntax", () => {
    const source = `
      mixin Selectable() {
        return <div />;
      }
    `;

    assert.throws(() => {
      parse(source, { sourceType: "module", plugins: ["typescript"] });
    });
  });

  it("supports plugin tuples for expressions", () => {
    const expr = parseExpression("<span />", {
      plugins: [["jsx", { runtime: "classic" }]],
    });

    assert.strictEqual(expr.type, "JSXElement");
    assert.strictEqual(expr.openingElement.name.name, "span");
  });
});
