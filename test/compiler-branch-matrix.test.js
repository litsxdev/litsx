import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { transformLitsxSync } from "../packages/compiler/src/index.js";

function compile(source, options = {}) {
  return transformLitsxSync(source, {
    filename: options.filename ?? "/virtual/branch-matrix.tsx",
    sourceMaps: false,
    ...options,
  });
}

describe("compiler branch matrix", () => {
  it("lowers diverse TypeScript parameter declarations and defaults", () => {
    const sources = [
      `type Props = { title?: string; count: number; active: boolean; items: string[]; payload: object; callback: () => void };
       export function TypedPanel({ title = "x", count, active, items, payload, callback, ...rest }: Props) {
         return <section title={title} data-count={count} hidden={!active} items={items} payload={payload} onclick={callback} {...rest} />;
       }`,
      `interface Base { label: string; optional?: number }
       interface Props extends Base { when: Date; tuple: [string, number] }
       export const AliasPanel = (props: Props = { label: "x", when: new Date(), tuple: ["x", 1] }) =>
         <div>{props.label}{props.optional}{props.when}{props.tuple}</div>;`,
      `export const RestOnly = (...values: string[]) => <p>{values.length}</p>;
       export const AssignedValue = (value: number = 1) => <p>{value}</p>;
       export const NestedPanel = ({ user: { name = "anon" } = {}, list: [first] = [] } = {}) => <p>{name}{first}</p>;`,
      `type Choice = "small" | "large"; type Mixed = string | number;
       export function UnionPanel({ choice, mixed, handler }: { choice: Choice; mixed: Mixed; handler: Function }) {
         return <button choice={choice} mixed={mixed} handler={handler} />;
       }`,
    ];
    for (const [index, source] of sources.entries()) {
      const result = compile(source, { filename: `/virtual/params-${index}.tsx` });
      assert.match(result.code, /class |customElement|html`/);
    }
  });

  it("lowers component wrappers and export shapes", () => {
    const sources = [
      `import { memo, forwardRef } from "react";
       const InnerComponent = function NamedComponent({ label }, ref) { return <button ref={ref}>{label}</button>; };
       export const WrappedComponent = memo(forwardRef(InnerComponent));`,
      `import React from "react";
       export default React.memo(React.forwardRef(function ({ value = 1 }, forwardedRef) {
         return <input ref={forwardedRef} value={value} />;
       }));`,
      `const LocalCard = ({ children }) => <article>{children}</article>;
       export { LocalCard as PublicCard };
       export const PublicScreen = function PublicScreen() { return <PublicCard><span /></PublicCard>; };`,
      `export function RecursiveTree({ depth = 0 }) { return depth ? <RecursiveTree depth={depth - 1} /> : <i />; }
       export const NamespaceView = () => <><UI.Card /><svg:path /></>;`,
    ];
    for (const [index, source] of sources.entries()) {
      const result = compile(source, {
        filename: `/virtual/wrappers-${index}.tsx`,
        reactCompat: index < 2,
      });
      assert.equal(typeof result.code, "string");
    }
  });

  it("lowers the complete hook family through local and namespace imports", () => {
    const result = compile(`
      import React, {
        useState, useRef, useEffect, useLayoutEffect, useMemo, useCallback,
        useReducer, useImperativeHandle, useSyncExternalStore,
        useOptimistic, useTransition, useDeferredValue,
      } from "react";
      const reducer = (state, action) => state + action;
      function useLocal(seed) {
        const [value, setValue] = useState(seed);
        const memo = useMemo(() => value * 2, [value]);
        return { value, setValue, memo };
      }
      export function HookMatrix({ store, forwardedRef, seed = 0 }) {
        const local = useLocal(seed);
        const node = useRef(null);
        const mutable = useRef(0);
        const [state, dispatch] = useReducer(reducer, 0, value => value + 1);
        const id = React.useId();
        const callback = useCallback(() => dispatch(1), [dispatch]);
        useEffect(() => () => callback(), [callback]);
        useLayoutEffect(() => {}, []);
        useImperativeHandle(forwardedRef, () => ({ focus: () => node.current?.focus() }), [node]);
        const external = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getServerSnapshot);
        const [optimistic, updateOptimistic] = useOptimistic(state, reducer);
        const [pending, start] = useTransition();
        const deferred = useDeferredValue(external, 0);
        mutable.current += 1;
        return <button ref={node} id={id} onClick={() => start(callback)}>{local.memo}{optimistic}{pending}{deferred}{updateOptimistic}</button>;
      }
    `, { filename: "/virtual/hooks.tsx", reactCompat: true });
    assert.match(result.code, /useExternalStore/);
    assert.match(result.code, /useTransition/);
    assert.match(result.code, /renderWithHooks/);
  });

  it("covers lazy resolution, aliases, branches, members, and suspense", () => {
    const result = compile(`
      import React, { lazy } from "react";
      const DirectPanel = lazy(() => import("./direct.js"));
      const NamedPanel = lazy(() => import("./named.js").then(module => ({ default: module.NamedPanel })));
      const Bag = { DirectPanel, NamedPanel };
      function choose(flag) { if (flag) return Bag.DirectPanel; else return Bag.NamedPanel; }
      export function LazyMatrix({ flag }) {
        const AliasComponent = DirectPanel;
        const ChosenPanel = choose(flag);
        return <section><AliasComponent /><ChosenPanel /><Bag.NamedPanel /></section>;
      }
    `, { filename: "/virtual/lazy.tsx", reactCompat: true });
    assert.match(result.code, /ensureLazyElement/);
  });

  it("covers SSR roots, noscript, property bindings, spreads, and void elements", () => {
    const result = compile(`
      import { html } from "lit";
      import RemotePanel from "./remote.tsx";
      export function ChildView({ value }) { return <strong>{value}</strong>; }
      export default function RootView({ title = "ready", props = {} }) {
        return <main data-root title={title}>
          <RemotePanel payload={{ title }} active on:save={() => {}} {...props} />
          <ChildView value={title} />
          <input disabled />
          <noscript><ChildView value="fallback" /></noscript>
          {html\`<aside>raw</aside>\`}
        </main>;
      }
    `, { filename: "/virtual/ssr-root.tsx", ssr: true });
    assert.match(result.code, /__litsxNoscript/);
    assert.match(result.code, /jsxSpreadElement/);
  });

  it("reports invalid structural authoring branches", () => {
    const failures = [
      [`import { useState } from "@litsx/core"; export function BadHook() { const x = 1; if (x) { const [v] = useState(0); } return <p />; }`, /hook/i],
      [`export function BadNoscript() { return <noscript><UI.Card /></noscript>; }`, /member-expression/],
    ];
    for (const [index, [source, pattern]] of failures.entries()) {
      assert.throws(
        () => compile(source, { filename: `/virtual/error-${index}.tsx`, ssr: index === 1 }),
        pattern,
      );
    }
  });
});
