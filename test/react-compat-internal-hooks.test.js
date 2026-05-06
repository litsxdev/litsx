import assert from "assert";
import babelCore from "@babel/core";
import parser from "../packages/babel-parser-litsx/src/index.js";
import { beforeAll, describe, it } from "vitest";
import { interopDefault } from "./helpers/interop-default.js";

const { transformFromAstSync } = babelCore;
let plugin;

beforeAll(async () => {
  const mod = await import(
    "../packages/babel-preset-react-compat/src/internal/react-hooks.js"
  );
  plugin = interopDefault(mod);
});

describe("react compat internal hooks", () => {
  function run(code) {
    const ast = parser.parse(code, { sourceType: "module" });
    const result = transformFromAstSync(ast, code, {
      configFile: false,
      babelrc: false,
      plugins: [plugin],
      generatorOpts: { decoratorsBeforeExport: true },
    });
    return result.code;
  }

  it("rewrites useTransition to the runtime helper", () => {
    const source = [
      "import { LitElement } from 'lit';",
      "import { useTransition } from 'react';",
      "",
      "class WithTransition extends LitElement {",
      "  render() {",
      "    const [isPending, startTransition] = useTransition();",
      "    startTransition(() => {});",
      "    return isPending ? 'pending' : 'done';",
      "  }",
      "}",
    ].join("\n");

    const code = run(source);

    assert.match(
      code,
      /import \{[^}]*prepareEffects[^}]*useTransition[^}]*\} from "@litsx\/litsx";/
    );
    assert.match(
      code,
      /const \[isPending, startTransition\] = useTransition\(this\);/
    );
  });

  it("rewrites startTransition calls to the runtime helper", () => {
    const source = [
      "import { LitElement } from 'lit';",
      "import { startTransition } from 'react';",
      "",
      "class WithTransitionStart extends LitElement {",
      "  render() {",
      "    const trigger = () => startTransition(() => this.requestUpdate());",
      "    return trigger;",
      "  }",
      "}",
    ].join("\n");

    const code = run(source);

    assert.match(
      code,
      /import \{[^}]*startTransition[^}]*\} from "@litsx\/litsx";/
    );
    assert.match(
      code,
      /const trigger = \(\) => startTransition\(this, \(\) => this\.requestUpdate\(\)\);/
    );
    assert.doesNotMatch(code, /from\s+['"]react['"]/);
  });

  it("rewrites useDeferredValue calls", () => {
    const source = [
      "import { LitElement } from 'lit';",
      "import { useDeferredValue } from 'react';",
      "",
      "class DeferredExample extends LitElement {",
      "  render() {",
      "    const deferred = useDeferredValue(this.value, { timeout: 200 });",
      "    return deferred;",
      "  }",
      "}",
    ].join("\n");

    const code = run(source);

    assert.match(
      code,
      /import \{[^}]*prepareEffects[^}]*useDeferredValue[^}]*\} from "@litsx\/litsx";/
    );
    assert.match(
      code,
      /const deferred = useDeferredValue\(this, this\.value, \{\s*timeout: 200\s*\}\);/
    );
  });

  it("rewrites useOptimistic to the native runtime helper", () => {
    const source = [
      "import { LitElement } from 'lit';",
      "import { useOptimistic } from 'react';",
      "",
      "class OptimisticExample extends LitElement {",
      "  render() {",
      "    const [optimisticItems, addOptimisticItem] = useOptimistic(this.items, (current, item) => [...current, item]);",
      "    return optimisticItems.length + Number(Boolean(addOptimisticItem));",
      "  }",
      "}",
    ].join("\n");

    const code = run(source);

    assert.match(
      code,
      /import \{[^}]*prepareEffects[^}]*useOptimistic[^}]*\} from "@litsx\/litsx";|import \{[^}]*useOptimistic[^}]*prepareEffects[^}]*\} from "@litsx\/litsx";/
    );
    assert.match(
      code,
      /const \[optimisticItems, addOptimisticItem\] = useOptimistic\(this, this\.items, \(current, item\) => \[\.\.\.current, item\]\);/
    );
    assert.doesNotMatch(code, /from\s+['"]react['"]/);
  });

  it("rewrites useSyncExternalStore to useExternalStore runtime helper", () => {
    const source = [
      "import { LitElement } from 'lit';",
      "import { useSyncExternalStore } from 'react';",
      "",
      "class StoreConsumer extends LitElement {",
      "  render() {",
      "    const value = useSyncExternalStore(subscribe, getSnapshot);",
      "    return value;",
      "  }",
      "}",
    ].join("\n");

    const code = run(source);

    assert.match(code, /import \{[^}]*useExternalStore[^}]*\} from "@litsx\/litsx";/);
    assert.match(
      code,
      /const value = useExternalStore\(this, subscribe, getSnapshot\);/
    );
    assert.doesNotMatch(code, /useSyncExternalStore/);
  });

  it("passes server snapshot getter when provided", () => {
    const source = [
      "import { LitElement } from 'lit';",
      "import { useSyncExternalStore } from 'react';",
      "",
      "class StoreConsumer extends LitElement {",
      "  render() {",
      "    return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);",
      "  }",
      "}",
    ].join("\n");

    const code = run(source);

    assert.match(
      code,
      /useExternalStore\(this, subscribe, getSnapshot, getServerSnapshot\)/
    );
  });

  it("rewrites useMemo into runtime helpers", () => {
    const source = [
      "import { LitElement, html } from 'lit';",
      "import { useMemo } from 'react';",
      "",
      "class MemoComponent extends LitElement {",
      "  render() {",
      "    const doubled = useMemo(() => this.count * 2, [this.count]);",
      "    return html`<span>${doubled}</span>`;",
      "  }",
      "}",
    ].join("\n");

    const code = run(source);

    assert.match(
      code,
      /import \{[^}]*prepareEffects[^}]*useMemoValue[^}]*\} from "@litsx\/litsx";/
    );
    assert.match(code, /prepareEffects\(this\);/);
    assert.match(
      code,
      /const doubled = useMemoValue\(this, \(\) => this\.count \* 2, \[this\.count\]\);/
    );
    assert.doesNotMatch(code, /from\s+['"]react['"]/);
  });

  it("rewrites useEffect and useLayoutEffect to native runtime hooks", () => {
    const source = [
      "import { LitElement } from 'lit';",
      "import { useEffect, useLayoutEffect } from 'react';",
      "",
      "class EffectsComponent extends LitElement {",
      "  render() {",
      "    useEffect(() => {",
      "      console.log(this.id);",
      "    }, [this.id]);",
      "    useLayoutEffect(() => {",
      "      console.log(this.title);",
      "    }, []);",
      "    return null;",
      "  }",
      "}",
    ].join("\n");

    const code = run(source);

    assert.match(
      code,
      /import \{[^}]*prepareEffects[^}]*useAfterUpdate[^}]*useOnCommit[^}]*\} from "@litsx\/litsx";/
    );
    assert.match(
      code,
      /useAfterUpdate\(this, \(\) => \{\s*console\.log\(this\.id\);\s*\}, \[this\.id\]\);/
    );
    assert.match(
      code,
      /useOnCommit\(this, \(\) => \{\s*console\.log\(this\.title\);\s*\}, \[\]\);/
    );
    assert.doesNotMatch(code, /useEffect/);
    assert.doesNotMatch(code, /useLayoutEffect/);
    assert.doesNotMatch(code, /from\s+['"]react['"]/);
  });

  it("rewrites useCallback keeping identity semantics", () => {
    const source = [
      "import { LitElement, html } from 'lit';",
      "import { useCallback } from 'react';",
      "",
      "class CallbackComponent extends LitElement {",
      "  render() {",
      "    const handler = useCallback(() => this.handle(), [this.handle]);",
      "    return html`<button @click=${handler}></button>`;",
      "  }",
      "}",
    ].join("\n");

    const code = run(source);

    assert.match(code, /import \{[^}]*useStableCallback[^}]*\} from "@litsx\/litsx";/);
    assert.match(
      code,
      /const handler = useStableCallback\(this, \(\) => this\.handle\(\), \[this\.handle\]\);/
    );
    assert.doesNotMatch(code, /from\s+['"]react['"]/);
  });

  it("rewrites useReducer calls", () => {
    const source = [
      "import { LitElement } from 'lit';",
      "import { useReducer } from 'react';",
      "",
      "const reducer = (state, action) => state + action;",
      "",
      "class ReducerComponent extends LitElement {",
      "  render() {",
      "    const [value, dispatch] = useReducer(reducer, 0);",
      "    return value;",
      "  }",
      "}",
    ].join("\n");

    const code = run(source);

    assert.match(code, /import \{[^}]*useReducedState[^}]*\} from "@litsx\/litsx";/);
    assert.match(
      code,
      /const \[value, dispatch\] = useReducedState\(this,\s*reducer,\s*0\);/
    );
    assert.doesNotMatch(code, /from\s+['"]react['"]/);
  });

  it("rewrites useId to a stable runtime helper", () => {
    const source = [
      "import { LitElement, html } from 'lit';",
      "import { useId } from 'react';",
      "",
      "class IdComponent extends LitElement {",
      "  render() {",
      "    const id = useId();",
      "    return html`<label for=${id}></label><input id=${id} />`;",
      "  }",
      "}",
    ].join("\n");

    const code = run(source);

    assert.match(code, /import \{[^}]*prepareEffects[^}]*useId[^}]*\} from "@litsx\/litsx";/);
    assert.match(code, /const id = useId\(this\);/);
    assert.doesNotMatch(code, /from\s+['"]react['"]/);
  });

  it("rewrites useImperativeHandle invocations", () => {
    const source = [
      "import { LitElement } from 'lit';",
      "import { useImperativeHandle } from 'react';",
      "",
      "class ImperativeComponent extends LitElement {",
      "  render() {",
      "    useImperativeHandle(this.ref, () => ({ focus: () => this.focus() }), [this.ref]);",
      "    return null;",
      "  }",
      "}",
    ].join("\n");

    const code = run(source);

    assert.match(code, /import \{[^}]*useExpose[^}]*\} from "@litsx\/litsx";/);
    assert.match(
      code,
      /useExpose\(this, this\.ref,[\s\S]*focus\(\)[\s\S]*\[this\.ref\]\);/
    );
    assert.doesNotMatch(code, /from\s+['"]react['"]/);
  });

  it("handles React namespace import member calls", () => {
    const source = [
      "import * as React from 'react';",
      "import { LitElement } from 'lit';",
      "",
      "class NamespaceImportExample extends LitElement {",
      "  render() {",
      "    const memo = React.useMemo(() => this.count * 2, [this.count]);",
      "    return React.useCallback(() => memo, [memo]);",
      "  }",
      "}",
    ].join("\n");

    const code = run(source);

    assert.match(
      code,
      /import \{[^}]*useMemoValue[^}]*useStableCallback[^}]*\} from "@litsx\/litsx";/
    );
    assert.match(
      code,
      /const memo = useMemoValue\(this, \(\) => this\.count \* 2, \[this\.count\]\);/
    );
    assert.match(
      code,
      /return useStableCallback\(this, \(\) => memo, \[memo\]\);/
    );
  });

  it("preserves authored hook order across React compatibility rewrites", () => {
    const source = [
      "import { LitElement, html } from 'lit';",
      "import { useMemo, useCallback, useDeferredValue } from 'react';",
      "",
      "class OrderedReactHooks extends LitElement {",
      "  render() {",
      "    const memo = useMemo(() => this.count * 2, [this.count]);",
      "    const deferred = useDeferredValue(this.query);",
      "    const handler = useCallback(() => memo + deferred, [memo, deferred]);",
      "    return html`<button @click=${handler}>ok</button>`;",
      "  }",
      "}",
    ].join("\n");

    const code = run(source);

    const prepareIndex = code.indexOf("prepareEffects(this);");
    const memoIndex = code.indexOf(
      "const memo = useMemoValue(this, () => this.count * 2, [this.count]);"
    );
    const deferredIndex = code.indexOf(
      "const deferred = useDeferredValue(this, this.query);"
    );
    const callbackIndex = code.indexOf(
      "const handler = useStableCallback(this, () => memo + deferred, [memo, deferred]);"
    );

    assert.ok(prepareIndex !== -1);
    assert.ok(memoIndex > prepareIndex);
    assert.ok(deferredIndex > memoIndex);
    assert.ok(callbackIndex > deferredIndex);
  });

  it("handles React namespace import useId member calls", () => {
    const source = [
      "import * as React from 'react';",
      "import { LitElement } from 'lit';",
      "",
      "class NamespaceIdExample extends LitElement {",
      "  render() {",
      "    const primaryId = React.useId();",
      "    const secondaryId = React.useId();",
      "    return `${primaryId}:${secondaryId}`;",
      "  }",
      "}",
    ].join("\n");

    const code = run(source);

    assert.match(code, /import \{[^}]*prepareEffects[^}]*useId[^}]*\} from "@litsx\/litsx";/);
    assert.match(code, /const primaryId = useId\(this\);/);
    assert.match(code, /const secondaryId = useId\(this\);/);
  });

  it("handles React namespace import startTransition member calls", () => {
    const source = [
      "import * as React from 'react';",
      "import { LitElement } from 'lit';",
      "",
      "class NamespaceTransitionExample extends LitElement {",
      "  render() {",
      "    return () => React.startTransition(() => this.requestUpdate());",
      "  }",
      "}",
    ].join("\n");

    const code = run(source);

    assert.match(
      code,
      /import \{[^}]*startTransition[^}]*\} from "@litsx\/litsx";/
    );
    assert.match(
      code,
      /return \(\) => startTransition\(this, \(\) => this\.requestUpdate\(\)\);/
    );
  });

  it("extends an existing litsx runtime import instead of adding a second one", () => {
    const source = [
      "import { LitElement } from 'lit';",
      "import { useMemoValue } from '@litsx\/litsx';",
      "import { useEffect } from 'react';",
      "",
      "class ExistingRuntimeImport extends LitElement {",
      "  render() {",
      "    useEffect(() => this.requestUpdate(), []);",
      "    return useMemoValue;",
      "  }",
      "}",
    ].join("\n");

    const code = run(source);

    assert.match(
      code,
      /import \{ useMemoValue, prepareEffects, useAfterUpdate \} from ['"]@litsx\/litsx['"];|import \{ useMemoValue, useAfterUpdate, prepareEffects \} from ['"]@litsx\/litsx['"];|import \{ prepareEffects, useAfterUpdate, useMemoValue \} from ['"]@litsx\/litsx['"];|import \{ prepareEffects, useMemoValue, useAfterUpdate \} from ['"]@litsx\/litsx['"];|import \{ useAfterUpdate, prepareEffects, useMemoValue \} from ['"]@litsx\/litsx['"];|import \{ useAfterUpdate, useMemoValue, prepareEffects \} from ['"]@litsx\/litsx['"];/
    );
    assert.strictEqual((code.match(/from ['"]@litsx\/litsx['"];/g) || []).length, 1);
  });

  it("does not duplicate prepareEffects when it is already present", () => {
    const source = [
      "import { LitElement } from 'lit';",
      "import { useMemo } from 'react';",
      "",
      "class PreparedAlready extends LitElement {",
      "  render() {",
      "    prepareEffects(this);",
      "    return useMemo(() => this.value, [this.value]);",
      "  }",
      "}",
    ].join("\n");

    const code = run(source);

    assert.strictEqual((code.match(/prepareEffects\(this\);/g) || []).length, 1);
    assert.match(code, /return useMemoValue\(this, \(\) => this\.value, \[this\.value\]\);/);
  });

  it("rewrites local custom hooks and injects the host parameter once", () => {
    const source = [
      "import { LitElement } from 'lit';",
      "import { useMemo } from 'react';",
      "",
      "function useFancyCache(factory) {",
      "  return useMemo(factory, []);",
      "}",
      "",
      "class FancyCacheExample extends LitElement {",
      "  render() {",
      "    return useFancyCache(() => this.value);",
      "  }",
      "}",
    ].join("\n");

    const code = run(source);

    assert.match(code, /function useFancyCache\(_host, factory\) \{/);
    assert.match(code, /return useMemoValue\(_host, factory, \[\]\);/);
    assert.match(code, /return useFancyCache\(this, \(\) => this\.value\);/);
  });

  it("preserves existing host-like parameters in local custom hooks", () => {
    const source = [
      "import { LitElement } from 'lit';",
      "import { useMemo } from 'react';",
      "",
      "function useFancyCache(host, factory) {",
      "  return useMemo(factory, []);",
      "}",
      "",
      "class FancyCacheExample extends LitElement {",
      "  render() {",
      "    return useFancyCache(() => this.value);",
      "  }",
      "}",
    ].join("\n");

    const code = run(source);

    assert.doesNotMatch(code, /function useFancyCache\(_host,/);
    assert.match(code, /function useFancyCache\(host, factory\) \{/);
    assert.match(code, /return useMemoValue\(host, factory, \[\]\);/);
    assert.match(code, /return useFancyCache\(this, \(\) => this\.value\);/);
  });

  it("rewrites imported custom hooks from named and namespace imports", () => {
    const source = [
      "import { LitElement } from 'lit';",
      "import { useRemoteThing } from './hooks';",
      "import * as remoteHooks from './more-hooks';",
      "",
      "class ImportedHooksExample extends LitElement {",
      "  render() {",
      "    const first = useRemoteThing(this.value);",
      "    const second = remoteHooks.useNamespacedThing(this.other);",
      "    return `${first}:${second}`;",
      "  }",
      "}",
    ].join("\n");

    const code = run(source);

    assert.match(code, /const first = useRemoteThing\(this, this\.value\);/);
    assert.match(code, /const second = remoteHooks\.useNamespacedThing\(this, this\.other\);/);
  });

  it("rewrites compat useContext imports from @litsx/litsx/context", () => {
    const source = [
      "import { LitElement } from 'lit';",
      "import { useContext } from '@litsx/litsx/context';",
      "",
      "class ContextConsumer extends LitElement {",
      "  render() {",
      "    return useContext(ThemeContext);",
      "  }",
      "}",
    ].join("\n");

    const code = run(source);

    assert.match(code, /return useContext\(this, ThemeContext\);/);
    assert.match(code, /import \{ prepareEffects \} from "@litsx\/litsx";/);
  });

  it("leaves unsupported dependency arrays untouched", () => {
    const source = [
      "import { LitElement } from 'lit';",
      "import { useMemo } from 'react';",
      "",
      "class UnsupportedDeps extends LitElement {",
      "  render() {",
      "    return useMemo(() => this.value, [this.value, ...extraDeps]);",
      "  }",
      "}",
    ].join("\n");

    const code = run(source);

    assert.match(code, /return useMemo\(\(\) => this\.value, \[this\.value, \.\.\.extraDeps\]\);/);
    assert.doesNotMatch(code, /useMemoValue/);
    assert.doesNotMatch(code, /prepareEffects\(this\);/);
    assert.match(code, /from 'react';|from "react";/);
  });

  it("rewrites namespace effect hooks and leaves native runtime calls untouched", () => {
    const source = [
      "import * as React from 'react';",
      "import { LitElement } from 'lit';",
      "import { useAfterUpdate } from '@litsx/litsx';",
      "",
      "class NamespaceEffects extends LitElement {",
      "  render() {",
      "    React.useEffect(() => this.requestUpdate(), [this.value]);",
      "    useAfterUpdate(this, () => this.requestUpdate(), [this.value]);",
      "    return null;",
      "  }",
      "}",
    ].join("\n");

    const code = run(source);

    assert.match(code, /useAfterUpdate\(this, \(\) => this\.requestUpdate\(\), \[this\.value\]\);/);
    assert.strictEqual((code.match(/useAfterUpdate\(this, \(\) => this\.requestUpdate\(\), \[this\.value\]\);/g) || []).length, 2);
    assert.match(code, /prepareEffects\(this\);/);
  });

  it("leaves unsupported runtime-like hook calls untouched when their arguments are invalid", () => {
    const source = [
      "import { LitElement } from 'lit';",
      "import { useEffect, useMemo } from 'react';",
      "",
      "class InvalidRuntimeCalls extends LitElement {",
      "  render() {",
      "    useEffect(() => this.requestUpdate(), deps);",
      "    return useMemo();",
      "  }",
      "}",
    ].join("\n");

    const code = run(source);

    assert.match(code, /useEffect\(\(\) => this\.requestUpdate\(\), deps\);/);
    assert.match(code, /return useMemo\(\);/);
    assert.doesNotMatch(code, /useAfterUpdate\(this,/);
    assert.doesNotMatch(code, /useMemoValue\(this,/);
  });
});
