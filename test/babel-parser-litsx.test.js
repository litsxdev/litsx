import assert from "assert";
import fs from "fs";
import os from "os";
import path from "path";
import { spawnSync } from "child_process";
import parser from "../packages/babel-parser-litsx/src/index.js";

describe("@litsx/babel-parser", () => {
  it("parses lit-html prefixed attributes", () => {
    const code = `
      const view = (
        <button .label={text} @click={handleClick} ?disabled={isDisabled}></button>
      );
    `;

    const ast = parser.parse(code);
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
    const ast = parser.parse("const tpl = <div ?hidden></div>;");
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

    const ast = parser.parse(source, {
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
      parser.parse(code, {
        sourceType: "module",
        plugins: [["jsx", { runtime: "classic" }]],
      });
    });
  });

  it("exposes parseExpression helper", () => {
    const expr = parser.parseExpression("<button .label={value} />", {
      plugins: ["typescript"],
    });

    assert.strictEqual(expr.type, "JSXElement");
    assert.strictEqual(expr.openingElement.name.name, "button");
  });

  it("parses hoisted static macros after authored preprocessing", () => {
    const source = `
      function Card() {
        ^styles(\`:host { display: block; }\`);
        ^properties({ active: { reflect: true } });
        ^shadowRootOptions({ delegatesFocus: true });
        ^lightDom();
        return <div />;
      }
    `;

    const ast = parser.parse(source, { sourceType: "module", plugins: ["typescript"] });
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
        ^styles(\`:host { display: block; }\`);
        return <div />;
      }
    `;

    const ast = parser.parse(source, { sourceType: "module", plugins: ["typescript"] });
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
      parser.parse(source, { sourceType: "module", plugins: ["typescript"] });
    });
  });

  it("exposes parser token types and supports plugin tuples", () => {
    assert.ok(parser.tokTypes, "parser should expose token types");

    const expr = parser.parseExpression("<span />", {
      plugins: [["jsx", { runtime: "classic" }]],
    });

    assert.strictEqual(expr.type, "JSXElement");
    assert.strictEqual(expr.openingElement.name.name, "span");
  });

  it("exposes the adapter default export", () => {
    assert.strictEqual(parser.default ?? parser, parser);

    const ast = parser.parse("const view = <main />;", {});
    assert.strictEqual(ast.program.body[0].declarations[0].init.openingElement.name.name, "main");
  });

  it("runs the CLI and prints parsed AST JSON for a valid file", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "litsx-parser-cli-"));
    const filePath = path.join(tempDir, "view.litsx");

    try {
      fs.writeFileSync(filePath, "const view = <button .label={text} />;\n");

      const result = spawnSync(process.execPath, [
        path.resolve("packages/babel-parser-litsx/src/cli.js"),
        filePath,
      ], {
        cwd: process.cwd(),
        encoding: "utf8",
      });

      assert.strictEqual(result.status, 0, result.stderr);
      assert.strictEqual(result.stderr, "");

      const parsed = JSON.parse(result.stdout);
      const declaration = parsed.program.body[0];
      assert.strictEqual(declaration.type, "VariableDeclaration");
      assert.strictEqual(
        declaration.declarations[0].init.openingElement.attributes[0].name.name,
        ".label",
      );
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("fails the CLI when no filename is provided", () => {
    const result = spawnSync(process.execPath, [
      path.resolve("packages/babel-parser-litsx/src/cli.js"),
    ], {
      cwd: process.cwd(),
      encoding: "utf8",
    });

    assert.strictEqual(result.status, 1);
    assert.match(result.stderr, /no filename specified/);
  });

});
