import assert from "assert";
import babelTraverse from "@babel/traverse";
import * as t from "@babel/types";
import { describe, it } from "vitest";
import parser from "./helpers/litsx-parser.js";
import {
  collectNativeClassNameWarnings,
  createHandlerClassMember,
  processHandlers,
  setHandlersBabelTypes,
} from "../packages/babel-preset-litsx/src/internal/transform-litsx-handlers.js";
import {
  createComponentInstanceRefSyncStatement,
  hasExplicitRefForwarding,
  hasRefProp,
  lowerForwardedElementRefs,
  setRefsBabelTypes,
} from "../packages/babel-preset-litsx/src/internal/transform-litsx-refs.js";

const traverse = babelTraverse.default ?? babelTraverse;

function getFunctionPath(source) {
  const ast = parser.parse(source, { sourceType: "module", plugins: ["jsx"] });
  let functionPath;
  traverse(ast, {
    FunctionDeclaration(path) {
      functionPath ??= path;
    },
  });
  return functionPath;
}

setHandlersBabelTypes(t);
setRefsBabelTypes(t);

describe("native handlers and refs internals", () => {
  it("hoists declared and inline event handlers while preserving handler metadata", () => {
    const functionPath = getFunctionPath(`
      function Card() {
        const save = async (event) => event.type;
        return <button onClick={(event) => event.defaultPrevented} onFocus={save}>Save</button>;
      }
    `);
    const handlers = processHandlers(functionPath, new Set(["handleClick"]));

    assert.deepStrictEqual(handlers.map((handler) => handler.name), ["save", "handleClick2"]);
    assert.strictEqual(handlers[0].async, true);
    assert.strictEqual(handlers[0].body.type, "BlockStatement");
    assert.match(functionPath.toString(), /this\.save/);
    assert.match(functionPath.toString(), /this\.handleClick2/);

    const member = createHandlerClassMember(handlers[0]);
    assert.strictEqual(member.key.name, "save");
    assert.strictEqual(member.async, true);
  });

  it("reports native className without treating style as handler syntax", () => {
    const functionPath = getFunctionPath(`
      function Card() {
        const style = { color: "red" };
        return <section className="card" style={style} />;
      }
    `);
    const warnings = [];

    collectNativeClassNameWarnings(functionPath, (warning) => warnings.push(warning));
    assert.deepStrictEqual(warnings.map((warning) => warning.code), ["LITSX_NATIVE_CLASSNAME"]);
    assert.strictEqual(warnings[0].tagName, "section");
  });

  it("detects forwarded refs and preserves native targets for Lit directive lowering", () => {
    const functionPath = getFunctionPath(`
      function Card({ ref }) {
        const forward = (node) => this.ref?.(node);
        return <><input ref={this.ref} /><Widget ref={this.ref} /><button ref={forward} /></>;
      }
    `);

    assert.strictEqual(hasRefProp(functionPath), true);
    assert.strictEqual(hasExplicitRefForwarding(functionPath, "ref"), true);
    const statements = lowerForwardedElementRefs(functionPath, "ref");

    assert.strictEqual(statements.length, 0);
    assert.doesNotMatch(functionPath.toString(), /data-ref=/);
    assert.match(functionPath.toString(), /<input ref=\{this\.ref\}/);
    assert.match(functionPath.toString(), /<Widget \.ref=\{this\.ref\}/);
    assert.deepStrictEqual(lowerForwardedElementRefs(functionPath, ""), []);
    assert.strictEqual(createComponentInstanceRefSyncStatement().expression.callee.name, "useCallbackRef");
  });
});
