import assert from "assert";
import * as t from "@babel/types";
import traverseModule from "@babel/traverse";
import { beforeAll } from "vitest";
import parser from "../packages/babel-parser-litsx/src/index.js";
import {
  collectNativeClassNameWarnings,
  createHandlerClassMember,
  processHandlers,
  setHandlersBabelTypes,
} from "../packages/babel-preset-litsx/src/internal/transform-litsx-handlers.js";

const traverse = traverseModule.default ?? traverseModule;

function getFunctionPath(source, plugins = ["jsx"]) {
  const ast = parser.parse(source, { sourceType: "module", plugins });
  let functionPath = null;

  traverse(ast, {
    FunctionDeclaration(path) {
      if (!functionPath) {
        functionPath = path;
      }
    },
    VariableDeclarator(path) {
      if (!functionPath) {
        const initPath = path.get("init");
        if (initPath.isArrowFunctionExpression() || initPath.isFunctionExpression()) {
          functionPath = initPath;
        }
      }
    },
  });

  return functionPath;
}

describe("native handlers internals", () => {
  beforeAll(() => {
    setHandlersBabelTypes(t);
  });

  it("hoists declared and inline handlers, but skips handlers that capture component bindings", () => {
    const source = `
      function Card() {
        const title = "hello";
        const localClick = () => "ok";
        const localBlocked = () => title;
        return (
          <button
            onClick={() => localClick()}
            onBlur={(event) => event.preventDefault()}
            onFocus={() => localBlocked()}
          />
        );
      }
    `;

    const functionPath = getFunctionPath(source);
    const usedNames = new Set(["render", "constructor"]);
    const handlerInfos = processHandlers(functionPath, usedNames);

    assert.deepStrictEqual(
      handlerInfos.map((entry) => entry.name).sort(),
      ["handleBlur", "handleClick", "localClick"]
    );

    const bodyStatements = functionPath.node.body.body;
    assert.strictEqual(bodyStatements.some((statement) =>
      t.isVariableDeclaration(statement) &&
      statement.declarations.some((decl) => t.isIdentifier(decl.id, { name: "localClick" }))
    ), false);
    assert.strictEqual(bodyStatements.some((statement) =>
      t.isVariableDeclaration(statement) &&
      statement.declarations.some((decl) => t.isIdentifier(decl.id, { name: "localBlocked" }))
    ), true);
  });

  it("returns no hoisted handlers for expression-bodied components and ignores nested scopes", () => {
    const exprFunctionPath = getFunctionPath(`const Card = () => <button onClick={() => save()} />;`);
    assert.deepStrictEqual(
      processHandlers(exprFunctionPath, new Set()).map((entry) => entry.name),
      ["handleClick"]
    );

    const nestedSource = `
      function Card() {
        function build() {
          const nested = () => "nope";
          return nested();
        }

        return <button onClick={() => build()} />;
      }
    `;
    const nestedFunctionPath = getFunctionPath(nestedSource);
    const handlerInfos = processHandlers(nestedFunctionPath, new Set());
    assert.deepStrictEqual(handlerInfos.map((entry) => entry.name), []);
  });

  it("collects className warnings only for native intrinsic JSX and preserves missing locations", () => {
    const source = `
      function Card() {
        return (
          <>
            <button className="cta" />
            <FancyButton className="ignored" />
          </>
        );
      }
    `;

    const functionPath = getFunctionPath(source);
    let openingElement = null;
    functionPath.traverse({
      JSXOpeningElement(path) {
        if (!openingElement && t.isJSXIdentifier(path.node.name, { name: "button" })) {
          openingElement = path.node;
        }
      },
    });
    openingElement.attributes[0].loc = null;

    const warnings = [];
    collectNativeClassNameWarnings(functionPath, (warning) => warnings.push(warning), {});

    assert.strictEqual(warnings.length, 1);
    assert.strictEqual(warnings[0].tagName, "button");
    assert.strictEqual(warnings[0].line, null);
    assert.strictEqual(warnings[0].column, null);
  });

  it("builds handler class members with async and generator flags", () => {
    const member = createHandlerClassMember({
      name: "handleSubmit",
      params: [t.identifier("event")],
      body: t.blockStatement([t.returnStatement(t.identifier("event"))]),
      async: true,
      generator: true,
    });

    assert.strictEqual(member.key.name, "handleSubmit");
    assert.strictEqual(member.async, true);
    assert.strictEqual(member.generator, true);
  });
});
