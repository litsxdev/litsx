import assert from "assert";
import { describe, it } from "vitest";
import {
  defineHook,
  STRUCTURAL_HOOK_ENTRIES,
  HostMiddlewareMixin,
  HostMiddlewareRuntime,
  createHostMiddlewareRuntime,
  isStructuralHook,
  resolveStructuralProps,
  resolveStructuralEntry,
  resolveStructuralStaticEntry,
} from "../packages/core/src/index.js";

function entry(id, middlewares = {}, extras = {}) {
  return {
    id,
    definition: extras.definition ?? {},
    args: extras.args ?? [],
    meta: extras.meta ?? {},
    state: extras.state ?? { id },
    middlewares,
  };
}

describe("HostMiddlewareRuntime", () => {
  it("exposes only the supported host lifecycle middleware surface", () => {
    const runtime = new HostMiddlewareRuntime({}, []);

    [
      "connectedCallback",
      "disconnectedCallback",
      "attributeChangedCallback",
      "formAssociatedCallback",
      "formDisabledCallback",
      "formResetCallback",
      "formStateRestoreCallback",
      "scheduleUpdate",
      "shouldUpdate",
      "willUpdate",
      "update",
      "updated",
      "firstUpdated",
      "getUpdateComplete",
    ].forEach((methodName) => {
      assert.strictEqual(typeof runtime[methodName], "function");
    });
    assert.strictEqual(runtime.render, undefined);
    assert.strictEqual(runtime.createRenderRoot, undefined);
  });

  it("composes sync middleware in entry order with base last", () => {
    const calls = [];
    const runtime = new HostMiddlewareRuntime({}, [
      entry("a", {
        connectedCallback(_host, state, next) {
          calls.push(`${state.id}:before`);
          const result = next();
          calls.push(`${state.id}:after`);
          return result;
        },
      }),
      entry("b", {
        connectedCallback(_host, state, next) {
          calls.push(`${state.id}:before`);
          const result = next();
          calls.push(`${state.id}:after`);
          return result;
        },
      }),
    ]);

    const result = runtime.connectedCallback(() => {
      calls.push("base");
      return "done";
    });

    assert.strictEqual(result, "done");
    assert.deepStrictEqual(calls, [
      "a:before",
      "b:before",
      "base",
      "b:after",
      "a:after",
    ]);
  });

  it("composes async middleware with async base", async () => {
    const calls = [];
    const runtime = new HostMiddlewareRuntime({}, [
      entry("a", {
        async scheduleUpdate(_host, state, next) {
          calls.push(`${state.id}:before`);
          const result = await next();
          calls.push(`${state.id}:after`);
          return result;
        },
      }),
      entry("b", {
        async scheduleUpdate(_host, state, next) {
          calls.push(`${state.id}:before`);
          const result = await next();
          calls.push(`${state.id}:after`);
          return result;
        },
      }),
    ]);

    const result = await runtime.scheduleUpdate(async () => {
      calls.push("base");
      return "scheduled";
    });

    assert.strictEqual(result, "scheduled");
    assert.deepStrictEqual(calls, [
      "a:before",
      "b:before",
      "base",
      "b:after",
      "a:after",
    ]);
  });

  it("allows middleware to continue after next", () => {
    const calls = [];
    const runtime = new HostMiddlewareRuntime({}, [
      entry("around", {
        updated(_host, _state, next) {
          calls.push("before");
          const result = next();
          calls.push("after");
          return result;
        },
      }),
    ]);

    runtime.updated([new Map()], () => {
      calls.push("base");
    });

    assert.deepStrictEqual(calls, ["before", "base", "after"]);
  });

  it("throws clearly when next is called twice", () => {
    const runtime = new HostMiddlewareRuntime({}, [
      entry("bad", {
        connectedCallback(_host, _state, next) {
          next();
          next();
        },
      }),
    ]);

    assert.throws(
      () => runtime.connectedCallback(() => undefined),
      /called next\(\) more than once.*connectedCallback/,
    );
  });

  it("reads render-time values through definition.use with the entry state", () => {
    const host = { name: "host" };
    const runtime = new HostMiddlewareRuntime(host, [
      entry("reader", {}, {
        args: ["en"],
        meta: { source: "test" },
        state: { count: 2 },
        definition: {
          use(host, state, args, meta, nextEntry) {
            return {
              host: host.name,
              state: state.count,
              arg: args[0],
              source: meta.source,
              id: nextEntry.id,
              callsiteIndex: nextEntry.callsiteIndex,
              callsiteId: nextEntry.callsiteId,
            };
          },
        },
      }),
    ]);

    assert.deepStrictEqual(runtime.read(0), {
      host: "host",
      state: 2,
      arg: "en",
      source: "test",
      id: "reader",
      callsiteIndex: 0,
      callsiteId: "reader",
    });
  });

  it("does not deduplicate identical structural hook callsites", () => {
    const calls = [];
    const sharedDefinition = {
      use(_host, state) {
        return state.value;
      },
    };
    const sharedArgs = ["same-loader"];
    const runtime = new HostMiddlewareRuntime({}, [
      {
        callsiteId: "callsite-0",
        definition: sharedDefinition,
        args: sharedArgs,
        state: { value: "first" },
        middlewares: {
          connectedCallback(_host, state, next, _args, _meta, nextEntry) {
            calls.push([nextEntry.callsiteIndex, nextEntry.callsiteId, state.value]);
            return next();
          },
        },
      },
      {
        callsiteId: "callsite-1",
        definition: sharedDefinition,
        args: sharedArgs,
        state: { value: "second" },
        middlewares: {
          connectedCallback(_host, state, next, _args, _meta, nextEntry) {
            calls.push([nextEntry.callsiteIndex, nextEntry.callsiteId, state.value]);
            return next();
          },
        },
      },
    ]);

    runtime.connectedCallback(() => {
      calls.push("base");
    });

    assert.strictEqual(runtime.entries.length, 2);
    assert.deepStrictEqual(calls, [
      [0, "callsite-0", "first"],
      [1, "callsite-1", "second"],
      "base",
    ]);
    assert.strictEqual(runtime.read(0), "first");
    assert.strictEqual(runtime.read(1), "second");
  });

  it("keeps multiple entries isolated for middleware state and read state", () => {
    const calls = [];
    const runtime = new HostMiddlewareRuntime({}, [
      entry("first", {
        willUpdate(_host, state, next) {
          calls.push(state.value);
          return next();
        },
      }, {
        state: { value: "first" },
        definition: {
          use(_host, state) {
            return state.value;
          },
        },
      }),
      entry("second", {
        willUpdate(_host, state, next) {
          calls.push(state.value);
          return next();
        },
      }, {
        state: { value: "second" },
        definition: {
          use(_host, state) {
            return state.value;
          },
        },
      }),
    ]);

    runtime.willUpdate([new Map()], () => {
      calls.push("base");
    });

    assert.deepStrictEqual(calls, ["first", "second", "base"]);
    assert.strictEqual(runtime.read(0), "first");
    assert.strictEqual(runtime.read(1), "second");
  });

  it("preserves shouldUpdate boolean results through the composed chain", () => {
    const calls = [];
    const changedProperties = new Map([["open", false]]);
    const runtime = new HostMiddlewareRuntime({}, [
      entry("a", {
        shouldUpdate(_host, _state, next, args) {
          calls.push(args[0]);
          return next();
        },
      }),
      entry("b", {
        shouldUpdate(_host, _state, next) {
          return next() && false;
        },
      }),
    ]);

    const result = runtime.shouldUpdate([changedProperties], () => true);

    assert.strictEqual(result, false);
    assert.strictEqual(calls[0], changedProperties);
  });

  it("passes attributeChangedCallback arguments through the chain", () => {
    const calls = [];
    const runtime = new HostMiddlewareRuntime({}, [
      entry("a", {
        attributeChangedCallback(_host, state, next, args) {
          calls.push([state.id, ...args]);
          return next();
        },
      }),
      entry("b", {
        attributeChangedCallback(_host, state, next, args) {
          calls.push([state.id, ...args]);
          return next();
        },
      }),
    ]);

    runtime.attributeChangedCallback(["aria-label", "old", "new"], () => {
      calls.push(["base", "aria-label", "old", "new"]);
    });

    assert.deepStrictEqual(calls, [
      ["a", "aria-label", "old", "new"],
      ["b", "aria-label", "old", "new"],
      ["base", "aria-label", "old", "new"],
    ]);
  });

  it("passes FACE callback arguments through the chain", () => {
    const calls = [];
    const runtime = new HostMiddlewareRuntime({}, [
      entry("a", {
        formAssociatedCallback(_host, state, next, args) {
          calls.push([state.id, "associated", ...args]);
          return next();
        },
        formDisabledCallback(_host, state, next, args) {
          calls.push([state.id, "disabled", ...args]);
          return next();
        },
        formResetCallback(_host, state, next) {
          calls.push([state.id, "reset"]);
          return next();
        },
        formStateRestoreCallback(_host, state, next, args) {
          calls.push([state.id, "restore", ...args]);
          return next();
        },
      }),
    ]);

    runtime.formAssociatedCallback(["form"], () => {
      calls.push(["base", "associated", "form"]);
    });
    runtime.formDisabledCallback([true], () => {
      calls.push(["base", "disabled", true]);
    });
    runtime.formResetCallback(() => {
      calls.push(["base", "reset"]);
    });
    runtime.formStateRestoreCallback(["state", "restore"], () => {
      calls.push(["base", "restore", "state", "restore"]);
    });

    assert.deepStrictEqual(calls, [
      ["a", "associated", "form"],
      ["base", "associated", "form"],
      ["a", "disabled", true],
      ["base", "disabled", true],
      ["a", "reset"],
      ["base", "reset"],
      ["a", "restore", "state", "restore"],
      ["base", "restore", "state", "restore"],
    ]);
  });

  it("composes getUpdateComplete and delegates to the base completion", async () => {
    const calls = [];
    const runtime = new HostMiddlewareRuntime({}, [
      entry("a", {
        async getUpdateComplete(_host, state, next) {
          calls.push(`${state.id}:before`);
          const result = await next();
          calls.push(`${state.id}:after`);
          return `${result}:a`;
        },
      }),
    ]);

    const result = await runtime.getUpdateComplete(async () => {
      calls.push("base");
      return "complete";
    });

    assert.strictEqual(result, "complete:a");
    assert.deepStrictEqual(calls, ["a:before", "base", "a:after"]);
  });

  it("creates entry state from definitions when no state is supplied", () => {
    const runtime = createHostMiddlewareRuntime({ host: true }, [
      {
        id: "created",
        args: ["arg"],
        meta: { key: "value" },
        definition: {
          createState(_host, args, _staticState, meta) {
            return { args, meta };
          },
          use(_host, state) {
            return state.instance;
          },
        },
      },
    ]);

    assert.deepStrictEqual(runtime.read(0), {
      args: ["arg"],
      meta: { key: "value", callsitePath: ["created"] },
    });
  });

  it("supports defineHook callables as structural entry definitions", () => {
    const structuralHook = defineHook({
      setup(_host, args, _staticState, meta, nextEntry) {
        return {
          value: args[0],
          path: meta.callsitePath,
          id: nextEntry.callsiteId,
        };
      },
      use(_host, state) {
        return state.instance;
      },
    });

    const runtime = new HostMiddlewareRuntime({}, [
      {
        callsiteId: "callsite-a",
        callsitePath: ["Component", "useThing"],
        definition: structuralHook,
        args: ["ready"],
      },
    ]);

    assert.strictEqual(isStructuralHook(structuralHook), true);
    assert.deepStrictEqual(runtime.read(0), {
      value: "ready",
      path: ["Component", "useThing"],
      id: "callsite-a",
    });
  });

  it("installs structural host accessors on the host instance", () => {
    const host = {};
    const structuralHook = defineHook({
      setup(_host, args) {
        return { value: args[0] };
      },
      accessors(_host, state) {
        return {
          value: {
            get: () => state.instance.value,
            set: (next) => {
              state.instance.value = String(next);
            },
          },
        };
      },
      use(_host, state) {
        return state.instance.value;
      },
    });

    const runtime = new HostMiddlewareRuntime(host, [
      {
        callsiteId: "field",
        callsitePath: ["Field", "useValue"],
        definition: structuralHook,
        args: ["draft"],
      },
    ]);

    assert.strictEqual(host.value, "draft");
    host.value = "ready";
    assert.strictEqual(host.value, "ready");
    assert.strictEqual(runtime.read(0), "ready");
  });

  it("lets later structural entries override accessors and restores earlier accessors when needed", () => {
    const host = {};
    const firstHook = defineHook({
      accessors() {
        return {
          current: {
            get: () => "first",
          },
        };
      },
      use() {
        return "first";
      },
    });
    const secondHook = defineHook({
      accessors(_host, _state, _meta, entry) {
        return entry.args[0]
          ? {
            current: {
              get: () => "second",
            },
          }
          : {};
      },
      use() {
        return "second";
      },
    });

    const runtime = new HostMiddlewareRuntime(host, [
      {
        callsiteIndex: 0,
        callsiteId: "first",
        definition: firstHook,
      },
      {
        callsiteIndex: 1,
        callsiteId: "second",
        definition: secondHook,
        args: [true],
      },
    ]);

    assert.strictEqual(host.current, "second");

    runtime.ensureEntry(1, {
      callsiteIndex: 1,
      callsiteId: "second",
      definition: secondHook,
      args: [false],
      meta: { callsitePath: ["second"] },
    });

    assert.strictEqual(host.current, "first");
  });

  it("rejects structural accessors that conflict with existing host own properties", () => {
    const host = { value: "taken" };
    const structuralHook = defineHook({
      accessors() {
        return {
          value: {
            get: () => "next",
          },
        };
      },
      use() {
        return "next";
      },
    });

    assert.throws(() => {
      new HostMiddlewareRuntime(host, [
        {
          callsiteId: "field",
          definition: structuralHook,
        },
      ]);
    }, /cannot install accessor "value" because the host already defines that own property/);
  });

  it("resolves structural props from structural entries", () => {
    const useMessages = defineHook({
      props() {
        return {
          messages: {
            type: Object,
            attribute: false,
          },
        };
      },
      use() {
        return null;
      },
    });
    const usePriority = defineHook({
      props(args) {
        return {
          messages: {
            reflect: Boolean(args[0]),
          },
          locale: {
            type: String,
          },
        };
      },
      use() {
        return null;
      },
    });

    class PropsHost {}
    PropsHost.structuralEntries = [
      {
        callsiteIndex: 0,
        callsiteId: "messages",
        definition: useMessages,
        args: [],
        meta: { callsitePath: ["messages"] },
      },
    ];
    PropsHost.structuralStaticEntries = [
      {
        callsiteIndex: 1,
        callsiteId: "priority",
        definition: usePriority,
        args: [true],
        meta: { callsitePath: ["priority"] },
      },
    ];

    assert.deepStrictEqual(
      resolveStructuralProps(PropsHost, {
        messages: { reflect: false },
      }),
      {
        messages: {
          reflect: true,
          type: Object,
          attribute: false,
        },
        locale: {
          type: String,
        },
      },
    );
  });

  it("lets later structural props override earlier ones for the same key", () => {
    const useBase = defineHook({
      props() {
        return {
          messages: {
            type: Object,
            attribute: false,
          },
        };
      },
      use() {
        return null;
      },
    });
    const useOverride = defineHook({
      props() {
        return {
          messages: {
            reflect: true,
          },
        };
      },
      use() {
        return null;
      },
    });

    class PropsHost {}
    PropsHost.structuralEntries = [
      {
        callsiteIndex: 0,
        callsiteId: "base",
        definition: useBase,
        args: [],
        meta: { callsitePath: ["base"] },
      },
      {
        callsiteIndex: 1,
        callsiteId: "override",
        definition: useOverride,
        args: [],
        meta: { callsitePath: ["override"] },
      },
    ];

    assert.deepStrictEqual(resolveStructuralProps(PropsHost), {
      messages: {
        type: Object,
        attribute: false,
        reflect: true,
      },
    });
  });

  it("supports static-only hooks without host lifecycle middleware", () => {
    const calls = [];
    class StaticOwner {}
    const structuralHook = defineHook({
      static(name, meta) {
        calls.push(["static", name, meta.callsitePath]);
        return { label: name.toUpperCase() };
      },
      use(_owner, state, args, meta) {
        const [name] = args;
        return {
          name,
          label: state.static.label,
          path: meta.callsitePath,
          instance: state.instance,
        };
      },
    });

    StaticOwner.structuralStaticEntries = [
      {
        callsiteIndex: 0,
        callsiteId: "static-callsite",
        callsitePath: ["static-callsite"],
        definition: structuralHook,
        args: ["catalog"],
      },
    ];

    const first = resolveStructuralStaticEntry(
      StaticOwner,
      0,
      "static-callsite",
      structuralHook,
      ["catalog"],
      { callsitePath: ["static-callsite"] },
    );
    const second = resolveStructuralStaticEntry(
      StaticOwner,
      0,
      "static-callsite",
      structuralHook,
      ["catalog"],
      { callsitePath: ["static-callsite"] },
    );

    assert.deepStrictEqual(first, {
      name: "catalog",
      label: "CATALOG",
      path: ["static-callsite"],
      instance: undefined,
    });
    assert.deepStrictEqual(second, first);
    assert.deepStrictEqual(calls, [["static", "catalog", ["static-callsite"]]]);
    const runtime = new HostMiddlewareRuntime(new StaticOwner(), []);
    assert.deepStrictEqual(runtime.entries, []);
  });

  it("supports mixed static, setup, middleware, and use phases", () => {
    const calls = [];
    function Host() {}
    const structuralHook = defineHook({
      static(name, meta) {
        calls.push(["static", name, meta.callsitePath]);
        return { staticLabel: `static:${name}` };
      },
      setup(_host, args, staticState, meta) {
        const [name] = args;
        calls.push(["setup", name, staticState.staticLabel, meta.callsitePath]);
        return { connected: false, instanceLabel: `instance:${name}` };
      },
      middlewares: {
        connectedCallback(_host, state, next, _args, meta) {
          calls.push(["middleware", state.static.staticLabel, state.instance.instanceLabel, meta.callsitePath]);
          state.instance.connected = true;
          return next();
        },
      },
      use(_host, state, args, meta) {
        const [name] = args;
        return {
          name,
          staticLabel: state.static.staticLabel,
          instanceLabel: state.instance.instanceLabel,
          connected: state.instance.connected,
          path: meta.callsitePath,
        };
      },
    });
    Host.structuralEntries = [
      {
        callsiteIndex: 0,
        callsiteId: "mixed-callsite",
        callsitePath: ["mixed-callsite"],
        definition: structuralHook,
        args: ["catalog"],
      },
    ];

    const host = new Host();
    const runtime = new HostMiddlewareRuntime(host, Host.structuralEntries);

    assert.deepStrictEqual(runtime.read(0, ["catalog"]), {
      name: "catalog",
      staticLabel: "static:catalog",
      instanceLabel: "instance:catalog",
      connected: false,
      path: ["mixed-callsite"],
    });
    runtime.connectedCallback(() => calls.push(["base"]));
    assert.deepStrictEqual(runtime.read(0, ["catalog"]), {
      name: "catalog",
      staticLabel: "static:catalog",
      instanceLabel: "instance:catalog",
      connected: true,
      path: ["mixed-callsite"],
    });
    assert.deepStrictEqual(calls, [
      ["static", "catalog", ["mixed-callsite"]],
      ["setup", "catalog", "static:catalog", ["mixed-callsite"]],
      ["middleware", "static:catalog", "instance:catalog", ["mixed-callsite"]],
      ["base"],
    ]);
  });

  it("passes structural metadata to lifecycle middlewares", () => {
    const calls = [];
    const structuralHook = defineHook({
      setup(_host, args, _staticState, meta) {
        return {
          value: args[0],
          setupPath: meta.callsitePath,
        };
      },
      middlewares: {
        connectedCallback(_host, state, next, args, meta, nextEntry) {
          calls.push({
            args,
            value: state.instance.value,
            setupPath: state.instance.setupPath,
            middlewarePath: meta.callsitePath,
            id: nextEntry.callsiteId,
          });
          return next();
        },
      },
      use(_host, state) {
        return state.instance.value;
      },
    });
    const runtime = new HostMiddlewareRuntime({}, [
      {
        callsiteId: "callsite-meta",
        callsitePath: ["Component", "useMeta"],
        definition: structuralHook,
        args: ["ready"],
      },
    ]);

    runtime.connectedCallback(["host-arg"], () => calls.push({ base: true }));

    assert.deepStrictEqual(calls, [
      {
        args: ["host-arg"],
        value: "ready",
        setupPath: ["Component", "useMeta"],
        middlewarePath: ["Component", "useMeta"],
        id: "callsite-meta",
      },
      { base: true },
    ]);
  });

  it("lazily creates and refreshes structural entries from compiled reads", () => {
    const host = {};
    const structuralHook = defineHook({
      setup(_host, args) {
        return { initial: args[0] };
      },
      use(_host, state, args, meta, nextEntry) {
        return {
          initial: state.instance.initial,
          current: args[0],
          id: nextEntry.callsiteId,
          path: meta.callsitePath,
        };
      },
    });

    const first = resolveStructuralEntry(
      host,
      0,
      "structural-a",
      structuralHook,
      ["first"],
      { callsitePath: ["Host", "structural-a"] },
    );
    const second = resolveStructuralEntry(
      host,
      0,
      "structural-a",
      structuralHook,
      ["second"],
      { callsitePath: ["Host", "structural-a"] },
    );

    assert.deepStrictEqual(first, {
      initial: "first",
      current: "first",
      id: "structural-a",
      path: ["Host", "structural-a"],
    });
    assert.deepStrictEqual(second, {
      initial: "first",
      current: "second",
      id: "structural-a",
      path: ["Host", "structural-a"],
    });
    assert.strictEqual(host.__litsxHostMiddlewareRuntime.entries.length, 1);
  });

  it("creates deterministic structural state for matching SSR and client plans", () => {
    const structuralHook = defineHook({
      setup(_host, args, _staticState, meta, nextEntry) {
        return {
          initial: args[0],
          id: nextEntry.callsiteId,
          path: meta.callsitePath,
        };
      },
      use(_host, state, args, meta) {
        return {
          initial: state.instance.initial,
          current: args[0],
          path: meta.callsitePath,
        };
      },
    });
    const entries = [
      {
        callsiteIndex: 0,
        callsiteId: "outer",
        callsitePath: ["outer"],
        definition: structuralHook,
        args: ["outer-initial"],
      },
      {
        callsiteIndex: 1,
        callsiteId: "nested",
        callsitePath: ["useOuter", "use", "nested"],
        definition: structuralHook,
        args: ["nested-initial"],
      },
    ];
    const createRuntime = () => new HostMiddlewareRuntime({}, entries);
    const serverRuntime = createRuntime();
    const clientRuntime = createRuntime();

    assert.deepStrictEqual(
      serverRuntime.entries.map((entry) => ({
        id: entry.callsiteId,
        path: entry.callsitePath,
        state: entry.state,
      })),
      clientRuntime.entries.map((entry) => ({
        id: entry.callsiteId,
        path: entry.callsitePath,
        state: entry.state,
      })),
    );
    assert.deepStrictEqual(clientRuntime.read(1, ["nested-current"]), {
      initial: "nested-initial",
      current: "nested-current",
      path: ["useOuter", "use", "nested"],
    });
    assert.deepStrictEqual(clientRuntime.read(0, ["outer-current"]), {
      initial: "outer-initial",
      current: "outer-current",
      path: ["outer"],
    });
  });

  it("resolves compiled reads by callsite id when module-local indexes collide", () => {
    const host = {};
    const firstHook = defineHook({
      use(_host, _state, args) {
        return `first:${args[0]}`;
      },
    });
    const secondHook = defineHook({
      use(_host, _state, args) {
        return `second:${args[0]}`;
      },
    });
    host.constructor = {
      structuralEntries: [
        {
          callsiteIndex: 0,
          callsiteId: "first",
          definition: firstHook,
          args: [],
          meta: { callsitePath: ["first"] },
        },
        {
          callsiteIndex: 0,
          callsiteId: "second",
          definition: secondHook,
          args: [],
          meta: { callsitePath: ["second"] },
        },
      ],
    };

    assert.strictEqual(
      resolveStructuralEntry(host, 0, "second", secondHook, ["value"], { callsitePath: ["second"] }),
      "second:value",
    );
    assert.strictEqual(
      resolveStructuralEntry(host, 0, "first", firstHook, ["value"], { callsitePath: ["first"] }),
      "first:value",
    );
  });

  it("attaches structural entries metadata to custom hook functions", () => {
    function useCustomHook() {}
    const entries = [{ callsiteId: "nested", definition: {} }];

    useCustomHook[STRUCTURAL_HOOK_ENTRIES] = entries;

    assert.strictEqual(useCustomHook[STRUCTURAL_HOOK_ENTRIES], entries);
    assert.strictEqual((() => undefined)[STRUCTURAL_HOOK_ENTRIES], undefined);
  });
});

describe("HostMiddlewareMixin", () => {
  it("delegates host lifecycle methods through structural middleware", async () => {
    const calls = [];

    class BaseHost {
      static structuralEntries = [
        entry("a", {
          connectedCallback(_host, state, next) {
            calls.push(`${state.id}:connected`);
            return next();
          },
          formResetCallback(_host, state, next) {
            calls.push(`${state.id}:reset`);
            return next();
          },
          shouldUpdate(_host, _state, next) {
            return next() && false;
          },
          async getUpdateComplete(_host, state, next) {
            calls.push(`${state.id}:complete`);
            return `${await next()}:middleware`;
          },
        }),
      ];

      connectedCallback() {
        calls.push("base:connected");
      }

      formResetCallback() {
        calls.push("base:reset");
      }

      shouldUpdate() {
        return true;
      }

      async getUpdateComplete() {
        return "base";
      }
    }

    const Host = HostMiddlewareMixin(BaseHost);
    const host = new Host();

    host.connectedCallback();
    host.formResetCallback();
    const shouldUpdate = host.shouldUpdate(new Map());
    const complete = await host.getUpdateComplete();

    assert.strictEqual(shouldUpdate, false);
    assert.strictEqual(complete, "base:middleware");
    assert.deepStrictEqual(calls, [
      "a:connected",
      "base:connected",
      "a:reset",
      "base:reset",
      "a:complete",
    ]);
  });
});
