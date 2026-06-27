import assert from "assert";
import { describe, it } from "vitest";
import {
  HostMiddlewareMixin,
  HostMiddlewareRuntime,
  createHostMiddlewareRuntime,
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
          use(nextHost, state, args, meta, nextEntry) {
            return {
              host: nextHost.name,
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
          connectedCallback(_host, state, next, _args, nextEntry) {
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
          connectedCallback(_host, state, next, _args, nextEntry) {
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
          createState(_host, args, meta) {
            return { args, meta };
          },
          use(_host, state) {
            return state;
          },
        },
      },
    ]);

    assert.deepStrictEqual(runtime.read(0), {
      args: ["arg"],
      meta: { key: "value" },
    });
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
    const shouldUpdate = host.shouldUpdate(new Map());
    const complete = await host.getUpdateComplete();

    assert.strictEqual(shouldUpdate, false);
    assert.strictEqual(complete, "base:middleware");
    assert.deepStrictEqual(calls, [
      "a:connected",
      "base:connected",
      "a:complete",
    ]);
  });
});
