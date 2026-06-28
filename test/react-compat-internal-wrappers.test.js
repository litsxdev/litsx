import assert from "assert";
import babelTraverse from "@babel/traverse";
import * as t from "@babel/types";
import parser from "./helpers/litsx-parser.js";
import {
  getReactWrapperMetadata,
  setReactWrappersBabelTypes,
} from "../packages/babel-preset-react-compat/src/internal/react-wrappers.js";

const traverse = babelTraverse.default || babelTraverse;

function getCallExpressions(source) {
  const ast = parser.parse(source, { sourceType: "module", plugins: ["jsx"] });
  const calls = [];

  traverse(ast, {
    CallExpression(path) {
      calls.push(path);
    },
  });

  return calls;
}

setReactWrappersBabelTypes(t);

describe("react compat internal wrappers", () => {
  it("collects forwardRef metadata from direct imports", () => {
    const [callPath] = getCallExpressions(`
      import { forwardRef } from "react";
      const Card = forwardRef(function Card(props, ref) {
        return <div>{props.title}</div>;
      });
    `);

    const meta = getReactWrapperMetadata(callPath);

    assert.ok(meta);
    assert.strictEqual(meta.helperKind, "forward");
    assert.strictEqual(meta.functionPath.node.id.name, "Card");
    assert.deepStrictEqual(meta.options, {
      forwardRef: {
        paramIndex: 1,
        propName: "ref",
      },
    });
    assert.strictEqual(meta.cleanups.length, 1);
    assert.strictEqual(meta.warnings.length, 0);
  });

  it("collects memo warnings and nested forwardRef cleanup metadata", () => {
    const [outerCall] = getCallExpressions(`
      import { forwardRef, memo } from "react";
      const Card = memo(
        forwardRef(function Card(props, forwardedRef) {
          return <div>{props.title}</div>;
        }),
        areEqual
      );
    `);

    const meta = getReactWrapperMetadata(outerCall);

    assert.ok(meta);
    assert.strictEqual(meta.helperKind, "forward");
    assert.deepStrictEqual(meta.options, {
      forwardRef: {
        paramIndex: 1,
        propName: "ref",
      },
    });
    assert.strictEqual(meta.cleanups.length, 2);
    assert.strictEqual(meta.warnings.length, 2);
    assert.deepStrictEqual(
      meta.warnings.map((warning) => warning.code),
      [91016, 91017]
    );
  });

  it("supports React.memo and React.forwardRef member expressions", () => {
    const [outerCall] = getCallExpressions(`
      import * as React from "react";
      const Card = React.memo(
        React.forwardRef((props, ref) => {
          return <div>{props.title}</div>;
        })
      );
    `);

    const meta = getReactWrapperMetadata(outerCall);

    assert.ok(meta);
    assert.strictEqual(meta.helperKind, "forward");
    assert.deepStrictEqual(meta.options, {
      forwardRef: {
        paramIndex: 1,
        propName: "ref",
      },
    });
    assert.strictEqual(meta.cleanups.length, 2);
    assert.strictEqual(meta.warnings.length, 1);
    assert.strictEqual(meta.warnings[0].code, 91016);
  });

  it("supports default React imports and forwardRef wrappers without explicit ref params", () => {
    const [callPath] = getCallExpressions(`
      import React from "react";
      const Card = React.forwardRef(function Card(props) {
        return <div>{props.title}</div>;
      });
    `);

    const meta = getReactWrapperMetadata(callPath);

    assert.ok(meta);
    assert.strictEqual(meta.helperKind, "forward");
    assert.deepStrictEqual(meta.options, {});
    assert.strictEqual(meta.cleanups.length, 1);
    assert.strictEqual(meta.warnings.length, 0);
  });

  it("supports direct memo wrappers around function expressions", () => {
    const [callPath] = getCallExpressions(`
      import { memo } from "react";
      const Card = memo(function Card(props) {
        return <div>{props.title}</div>;
      });
    `);

    const meta = getReactWrapperMetadata(callPath);

    assert.ok(meta);
    assert.strictEqual(meta.helperKind, "memo");
    assert.deepStrictEqual(meta.options, {});
    assert.strictEqual(meta.cleanups.length, 1);
    assert.strictEqual(meta.warnings.length, 1);
    assert.strictEqual(meta.warnings[0].code, 91016);
  });

  it("returns null for unsupported wrapper shapes", () => {
    const calls = getCallExpressions(`
      import { memo, forwardRef } from "react";
      const One = memo(Component);
      const Two = forwardRef(Component);
      const Three = memo(Factory());
    `);

    const [memoComponent, forwardComponent, memoFactory, factoryCall] = calls;

    assert.strictEqual(getReactWrapperMetadata(memoComponent), null);
    assert.strictEqual(getReactWrapperMetadata(forwardComponent), null);
    assert.strictEqual(getReactWrapperMetadata(memoFactory), null);
    assert.strictEqual(getReactWrapperMetadata(factoryCall), null);
  });

  it("returns null for wrappers that are not imported from React or use unsupported member syntax", () => {
    const calls = getCallExpressions(`
      import { memo as preactMemo } from "preact/compat";
      import React from "react";
      import * as Preact from "preact/compat";

      const One = preactMemo(function One(props) {
        return <div>{props.title}</div>;
      });

      const Two = React["memo"](function Two(props) {
        return <div>{props.title}</div>;
      });

      const Three = Preact.memo(function Three(props) {
        return <div>{props.title}</div>;
      });
    `);

    const [preactMemoCall, computedMemberCall, preactNamespaceCall] = calls;

    assert.strictEqual(getReactWrapperMetadata(preactMemoCall), null);
    assert.strictEqual(getReactWrapperMetadata(computedMemberCall), null);
    assert.strictEqual(getReactWrapperMetadata(preactNamespaceCall), null);
  });

  it("returns null for helper calls without component arguments", () => {
    const [memoCall, reactMemoCall, forwardCall, reactForwardCall] = getCallExpressions(`
      import React, { memo, forwardRef } from "react";
      const One = memo();
      const Two = React.memo();
      const Three = forwardRef();
      const Four = React.forwardRef();
    `);

    assert.strictEqual(getReactWrapperMetadata(memoCall), null);
    assert.strictEqual(getReactWrapperMetadata(reactMemoCall), null);
    assert.strictEqual(getReactWrapperMetadata(forwardCall), null);
    assert.strictEqual(getReactWrapperMetadata(reactForwardCall), null);
  });
});
