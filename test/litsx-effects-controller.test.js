import { beforeAll, afterAll } from 'vitest';
import assert from "assert";
import {
  ensureLazyElement,
  prepareEffects,
  useMemoValue,
  useEffect,
  useHost,
  useHostContent,
  useSlot,
  useTextContent,
  useRef,
  useOnConnect,
  useId,
  useLayoutEffect,
  useEvent,
  useEmit,
  usePrevious,
  useStableCallback,
  useStyle,
  useControlledState,
  useAsyncState,
  useOptimistic,
  useCallbackRef,
  useExpose,
} from "../packages/litsx/src/index.js";

class TestHost extends EventTarget {
  constructor() {
    super();
    this.controllers = [];
    this.updates = 0;
    this.isConnected = true;
    this.childNodes = [];
    this.textContent = "";
    this.styleAssignments = new Map();
    this.style = {
      setProperty: (name, value) => {
        this.styleAssignments.set(name, value);
      },
      removeProperty: (name) => {
        this.styleAssignments.delete(name);
      },
    };
    this.registry = {
      definitions: new Map(),
      define: (tag, ctor) => {
        this.registry.definitions.set(tag, ctor);
      },
      get: (tag) => this.registry.definitions.get(tag),
    };
  }

  addController(controller) {
    this.controllers.push(controller);
  }

  requestUpdate() {
    this.updates += 1;
  }

  disconnect() {
    this.isConnected = false;
    this.controllers.forEach((controller) => controller.hostDisconnected());
  }

  connect() {
    this.isConnected = true;
    this.controllers.forEach((controller) => controller.hostConnected());
  }
}

describe("litsx effects controller", () => {
  const originalRAF = globalThis.requestAnimationFrame;
  const originalMutationObserver = globalThis.MutationObserver;

  beforeAll(() => {
    globalThis.requestAnimationFrame = (cb) => {
      cb(0);
      return 0;
    };
  });

  afterAll(() => {
    globalThis.requestAnimationFrame = originalRAF;
    globalThis.MutationObserver = originalMutationObserver;
  });

  function update(host) {
    for (const controller of host.controllers) {
      controller.hostUpdated();
    }
  }

  it("runs effects registered with [] only once", () => {
    const host = new TestHost();
    let runs = 0;

    prepareEffects(host);
    useEffect(host, () => {
      runs += 1;
    }, []);
    update(host);

    assert.strictEqual(runs, 1);

    prepareEffects(host);
    useEffect(host, () => {
      runs += 1;
    }, []);
    update(host);

    assert.strictEqual(runs, 1);
  });

  it("always reruns effects when dependencies are omitted", () => {
    const host = new TestHost();
    let runs = 0;

    prepareEffects(host);
    useEffect(host, () => {
      runs += 1;
    });
    update(host);

    assert.strictEqual(runs, 1);

    prepareEffects(host);
    useEffect(host, () => {
      runs += 1;
    });
    update(host);

    assert.strictEqual(runs, 2);
  });

  it("keeps useEvent stable while updating the callback body", () => {
    const host = new TestHost();
    const target = {
      addCalls: 0,
      removeCalls: 0,
      current: null,
      addEventListener(_type, listener) {
        this.addCalls += 1;
        this.current = listener;
      },
      removeEventListener(_type, listener) {
        this.removeCalls += 1;
        if (this.current === listener) {
          this.current = null;
        }
      },
    };

    let open = false;

    prepareEffects(host);
    const firstHandler = useEvent(host, (event) => {
      if (event.key === "Escape" && open) {
        return "closed";
      }
      return "ignored";
    });
    useOnConnect(host, () => {
      target.addEventListener("keydown", firstHandler);
      return () => target.removeEventListener("keydown", firstHandler);
    }, []);
    update(host);

    assert.strictEqual(target.addCalls, 1);
    assert.strictEqual(firstHandler({ key: "Escape" }), "ignored");

    open = true;

    prepareEffects(host);
    const secondHandler = useEvent(host, (event) => {
      if (event.key === "Escape" && open) {
        return "closed";
      }
      return "ignored";
    });
    useOnConnect(host, () => {
      target.addEventListener("keydown", secondHandler);
      return () => target.removeEventListener("keydown", secondHandler);
    }, []);
    update(host);

    assert.strictEqual(secondHandler, firstHandler);
    assert.strictEqual(target.addCalls, 1);
    assert.strictEqual(firstHandler({ key: "Escape" }), "closed");
  });

  it("emits CustomEvent with public defaults and partial option overrides", () => {
    const host = new TestHost();
    const events = [];

    host.addEventListener("change", (event) => {
      events.push(event);
    });

    prepareEffects(host);
    const emit = useEmit(host);

    const firstResult = emit("change", { value: "alpha" });
    const secondResult = emit("change", { value: "beta" }, { composed: false, cancelable: true });

    assert.strictEqual(firstResult, true);
    assert.strictEqual(secondResult, true);
    assert.strictEqual(events.length, 2);

    assert.deepStrictEqual(events[0].detail, { value: "alpha" });
    assert.strictEqual(events[0].bubbles, true);
    assert.strictEqual(events[0].composed, true);
    assert.strictEqual(events[0].cancelable, false);

    assert.deepStrictEqual(events[1].detail, { value: "beta" });
    assert.strictEqual(events[1].bubbles, true);
    assert.strictEqual(events[1].composed, false);
    assert.strictEqual(events[1].cancelable, true);
  });

  it("returns the previous render value", () => {
    const host = new TestHost();

    prepareEffects(host);
    const first = usePrevious(host, "alpha");
    update(host);

    prepareEffects(host);
    const second = usePrevious(host, "beta");
    update(host);

    prepareEffects(host);
    const third = usePrevious(host, "gamma");
    update(host);

    assert.strictEqual(first, undefined);
    assert.strictEqual(second, "alpha");
    assert.strictEqual(third, "beta");
  });

  it("returns the provided initial value on the first render", () => {
    const host = new TestHost();

    prepareEffects(host);
    const first = usePrevious(host, 2, 0);
    update(host);

    prepareEffects(host);
    const second = usePrevious(host, 4, 0);
    update(host);

    assert.strictEqual(first, 0);
    assert.strictEqual(second, 2);
  });

  it("manages uncontrolled state and notifies on change", () => {
    const host = new TestHost();
    const changes = [];

    prepareEffects(host);
    let [value, setValue] = useControlledState(host, {
      defaultValue: false,
      onChange: (next) => changes.push(next),
    });
    assert.strictEqual(value, false);

    setValue(true);
    update(host);

    prepareEffects(host);
    [value, setValue] = useControlledState(host, {
      defaultValue: false,
      onChange: (next) => changes.push(next),
    });

    assert.strictEqual(value, true);
    assert.deepStrictEqual(changes, [true]);
  });

  it("reads controlled state without mutating local state", () => {
    const host = new TestHost();
    const changes = [];
    let controlledValue = false;

    prepareEffects(host);
    let [value, setValue] = useControlledState(host, {
      value: controlledValue,
      defaultValue: true,
      onChange: (next) => changes.push(next),
    });
    assert.strictEqual(value, false);

    setValue(true);
    update(host);

    prepareEffects(host);
    [value, setValue] = useControlledState(host, {
      value: controlledValue,
      defaultValue: true,
      onChange: (next) => changes.push(next),
    });
    assert.strictEqual(value, false);

    controlledValue = true;

    prepareEffects(host);
    [value] = useControlledState(host, {
      value: controlledValue,
      defaultValue: true,
      onChange: (next) => changes.push(next),
    });

    assert.strictEqual(value, true);
    assert.deepStrictEqual(changes, [true]);
  });

  it("applies uncontrolled updater functions against the latest state", () => {
    const host = new TestHost();

    prepareEffects(host);
    let [value, setValue] = useControlledState(host, {
      defaultValue: 1,
    });
    assert.strictEqual(value, 1);

    setValue((previous) => previous + 1);
    setValue((previous) => previous + 1);
    update(host);

    prepareEffects(host);
    [value] = useControlledState(host, {
      defaultValue: 1,
    });

    assert.strictEqual(value, 3);
  });

  it("resolves synchronous useAsyncState runs and clears pending", async () => {
    const host = new TestHost();

    prepareEffects(host);
    let [value, run, meta] = useAsyncState(host, 1, (current, step) => current + step);
    assert.strictEqual(value, 1);
    assert.strictEqual(meta.pending, false);
    assert.strictEqual(meta.error, null);

    const nextValue = await run(2);
    assert.strictEqual(nextValue, 3);
    update(host);

    prepareEffects(host);
    [value, run, meta] = useAsyncState(host, 1, (current, step) => current + step);
    assert.strictEqual(value, 3);
    assert.strictEqual(meta.pending, false);
    assert.strictEqual(meta.error, null);
  });

  it("tracks pending and commits async useAsyncState runs", async () => {
    const host = new TestHost();
    let resolveRun;
    const pendingResult = new Promise((resolve) => {
      resolveRun = resolve;
    });

    prepareEffects(host);
    let [value, run, meta] = useAsyncState(host, 1, (current, step) =>
      pendingResult.then(() => current + step)
    );
    assert.strictEqual(value, 1);
    assert.strictEqual(meta.pending, false);

    const completion = run(4);

    prepareEffects(host);
    [value, run, meta] = useAsyncState(host, 1, (current, step) =>
      pendingResult.then(() => current + step)
    );
    assert.strictEqual(meta.pending, true);

    resolveRun();
    const nextValue = await completion;
    assert.strictEqual(nextValue, 5);
    update(host);

    prepareEffects(host);
    [value, , meta] = useAsyncState(host, 1, (current, step) =>
      pendingResult.then(() => current + step)
    );
    assert.strictEqual(value, 5);
    assert.strictEqual(meta.pending, false);
    assert.strictEqual(meta.error, null);
  });

  it("captures the latest useAsyncState error without mutating state", async () => {
    const host = new TestHost();
    const failure = new Error("save failed");

    prepareEffects(host);
    let [value, run, meta] = useAsyncState(host, 2, async (current, shouldFail) => {
      if (shouldFail) {
        throw failure;
      }
      return current + 1;
    });

    await assert.rejects(() => run(true), failure);
    update(host);

    prepareEffects(host);
    [value, run, meta] = useAsyncState(host, 2, async (current, shouldFail) => {
      if (shouldFail) {
        throw failure;
      }
      return current + 1;
    });
    assert.strictEqual(value, 2);
    assert.strictEqual(meta.error, failure);
    assert.strictEqual(meta.pending, false);
  });

  it("lets only the latest started useAsyncState run commit state", async () => {
    const host = new TestHost();
    let resolveSlow;
    let resolveFast;
    const slow = new Promise((resolve) => {
      resolveSlow = resolve;
    });
    const fast = new Promise((resolve) => {
      resolveFast = resolve;
    });

    prepareEffects(host);
    let [value, run, meta] = useAsyncState(host, 0, (_current, label) => {
      if (label === "slow") {
        return slow.then(() => 1);
      }
      return fast.then(() => 2);
    });
    assert.strictEqual(value, 0);
    assert.strictEqual(meta.error, null);

    const slowRun = run("slow");
    const fastRun = run("fast");

    resolveFast();
    assert.strictEqual(await fastRun, 2);
    update(host);

    prepareEffects(host);
    [value, run, meta] = useAsyncState(host, 0, (_current, label) => {
      if (label === "slow") {
        return slow.then(() => 1);
      }
      return fast.then(() => 2);
    });
    assert.strictEqual(value, 2);
    assert.strictEqual(meta.error, null);

    resolveSlow();
    assert.strictEqual(await slowRun, 1);
    update(host);

    prepareEffects(host);
    [value, , meta] = useAsyncState(host, 0, (_current, label) => {
      if (label === "slow") {
        return slow.then(() => 1);
      }
      return fast.then(() => 2);
    });
    assert.strictEqual(value, 2);
    assert.strictEqual(meta.error, null);
  });

  it("resets useAsyncState and ignores stale completions after reset", async () => {
    const host = new TestHost();
    let resolveRun;
    const pendingResult = new Promise((resolve) => {
      resolveRun = resolve;
    });

    prepareEffects(host);
    let [value, run, meta] = useAsyncState(host, 10, (current) =>
      pendingResult.then(() => current + 5)
    );
    const completion = run();

    prepareEffects(host);
    [value, run, meta] = useAsyncState(host, 10, (current) =>
      pendingResult.then(() => current + 5)
    );
    assert.strictEqual(meta.pending, true);

    meta.reset();
    update(host);

    prepareEffects(host);
    [value, run, meta] = useAsyncState(host, 10, (current) =>
      pendingResult.then(() => current + 5)
    );
    assert.strictEqual(value, 10);
    assert.strictEqual(meta.error, null);

    resolveRun();
    assert.strictEqual(await completion, 15);
    update(host);

    prepareEffects(host);
    [value, , meta] = useAsyncState(host, 10, (current) =>
      pendingResult.then(() => current + 5)
    );
    assert.strictEqual(value, 10);
    assert.strictEqual(meta.error, null);
  });

  it("uses replacement semantics for useOptimistic by default", () => {
    const host = new TestHost();

    prepareEffects(host);
    let [optimisticValue, addOptimistic] = useOptimistic(host, "idle");
    assert.strictEqual(optimisticValue, "idle");

    addOptimistic("saving");
    update(host);

    prepareEffects(host);
    [optimisticValue, addOptimistic] = useOptimistic(host, "idle");
    assert.strictEqual(optimisticValue, "saving");
  });

  it("replays optimistic inputs and supports explicit reset", () => {
    const host = new TestHost();
    const baseItems = ["base"];

    prepareEffects(host);
    let [optimisticItems, addOptimistic, resetOptimistic] = useOptimistic(
      host,
      baseItems,
      (currentItems, optimisticItem) => [...currentItems, optimisticItem]
    );
    assert.deepStrictEqual(optimisticItems, ["base"]);

    addOptimistic("temp-1");
    addOptimistic("temp-2");
    update(host);

    prepareEffects(host);
    [optimisticItems, addOptimistic, resetOptimistic] = useOptimistic(
      host,
      baseItems,
      (currentItems, optimisticItem) => [...currentItems, optimisticItem]
    );
    assert.deepStrictEqual(optimisticItems, ["base", "temp-1", "temp-2"]);

    resetOptimistic();
    update(host);

    prepareEffects(host);
    [optimisticItems] = useOptimistic(
      host,
      baseItems,
      (currentItems, optimisticItem) => [...currentItems, optimisticItem]
    );
    assert.deepStrictEqual(optimisticItems, ["base"]);
  });

  it("clears the optimistic queue when the base state changes", () => {
    const host = new TestHost();
    let baseItems = ["base"];

    prepareEffects(host);
    let [optimisticItems, addOptimistic] = useOptimistic(
      host,
      baseItems,
      (currentItems, optimisticItem) => [...currentItems, optimisticItem]
    );
    assert.deepStrictEqual(optimisticItems, ["base"]);

    addOptimistic("temp-1");
    update(host);

    prepareEffects(host);
    [optimisticItems, addOptimistic] = useOptimistic(
      host,
      baseItems,
      (currentItems, optimisticItem) => [...currentItems, optimisticItem]
    );
    assert.deepStrictEqual(optimisticItems, ["base", "temp-1"]);

    baseItems = ["server"];

    prepareEffects(host);
    [optimisticItems] = useOptimistic(
      host,
      baseItems,
      (currentItems, optimisticItem) => [...currentItems, optimisticItem]
    );
    assert.deepStrictEqual(optimisticItems, ["server"]);
    assert.deepStrictEqual(baseItems, ["server"]);
  });

  it("re-runs effects when dependency values change", () => {
    const host = new TestHost();
    let runs = 0;
    let value = 1;
    const cleanups = [];

    const callback = () => {
      runs += 1;
      const captured = value;
      return () => cleanups.push(captured);
    };

    prepareEffects(host);
    useEffect(host, callback, [value]);
    update(host);
    assert.strictEqual(runs, 1);
    assert.deepStrictEqual(cleanups, []);

    prepareEffects(host);
    useEffect(host, callback, [value]);
    update(host);
    assert.strictEqual(runs, 1);
    assert.deepStrictEqual(cleanups, []);

    value = 2;
    prepareEffects(host);
    useEffect(host, callback, [value]);
    update(host);
    assert.strictEqual(runs, 2);
    assert.deepStrictEqual(cleanups, [1]);
  });

  it("executes layout effects before passive effects", () => {
    const host = new TestHost();
    const order = [];

    prepareEffects(host);
    useEffect(host, () => {
      order.push("passive");
    }, []);
    useLayoutEffect(host, () => {
      order.push("layout");
    }, []);
    update(host);

    assert.deepStrictEqual(order, ["layout", "passive"]);
  });

  it("runs cleanups on disconnect", () => {
    const host = new TestHost();
    const cleanups = [];

    prepareEffects(host);
    useEffect(host, () => () => cleanups.push("cleanup"), []);
    update(host);

    host.controllers.forEach((controller) => controller.hostDisconnected());

    assert.deepStrictEqual(cleanups, ["cleanup"]);
  });

  it("cleans up removed hooks and resets flags on disconnect", () => {
    const host = new TestHost();
    const events = [];

    prepareEffects(host);
    useEffect(host, () => () => events.push("first-cleanup"), []);
    useLayoutEffect(host, () => () => events.push("layout-cleanup"), []);
    update(host);

    prepareEffects(host);
    useEffect(host, () => () => events.push("second-cleanup"), []);
    update(host);

    assert.deepStrictEqual(events, ["layout-cleanup"]);

    host.controllers[0].hostDisconnected();
    assert.deepStrictEqual(events, ["layout-cleanup", "first-cleanup"]);
    assert.strictEqual(host.controllers[0].passiveScheduled, false);
  });

  it("handles null deps, host lifecycle no-ops, and unchanged passive scheduling", () => {
    const host = new TestHost();
    let runs = 0;

    prepareEffects(host);
    useEffect(host, () => {
      runs += 1;
      return undefined;
    }, null);
    update(host);

    prepareEffects(host);
    useEffect(host, () => {
      runs += 1;
    }, null);
    update(host);

    host.controllers[0].hostUpdate();
    host.controllers[0].hostConnected();
    host.controllers[0].schedulePassive();

    assert.strictEqual(runs, 2);
  });

  it("runs connection-scoped setup while the host stays connected", () => {
    const host = new TestHost();
    const events = [];

    prepareEffects(host);
    useOnConnect(host, () => {
      events.push("connect");
      return () => events.push("cleanup");
    }, []);
    update(host);

    assert.deepStrictEqual(events, ["connect"]);

    prepareEffects(host);
    useOnConnect(host, () => {
      events.push("connect");
      return () => events.push("cleanup");
    }, []);
    update(host);

    assert.deepStrictEqual(events, ["connect"]);

    host.disconnect();
    assert.deepStrictEqual(events, ["connect", "cleanup"]);

    host.connect();
    assert.deepStrictEqual(events, ["connect", "cleanup", "connect"]);
  });

  it("re-arms connection-scoped setup when dependencies change", () => {
    const host = new TestHost();
    const events = [];
    let topic = "alpha";

    prepareEffects(host);
    useOnConnect(host, () => {
      events.push(`connect:${topic}`);
      const captured = topic;
      return () => events.push(`cleanup:${captured}`);
    }, [topic]);
    update(host);

    prepareEffects(host);
    useOnConnect(host, () => {
      events.push(`connect:${topic}`);
      const captured = topic;
      return () => events.push(`cleanup:${captured}`);
    }, [topic]);
    update(host);

    topic = "beta";

    prepareEffects(host);
    useOnConnect(host, () => {
      events.push(`connect:${topic}`);
      const captured = topic;
      return () => events.push(`cleanup:${captured}`);
    }, [topic]);
    update(host);

    assert.deepStrictEqual(events, [
      "connect:alpha",
      "cleanup:alpha",
      "connect:beta",
    ]);
  });

  it("re-arms connection-scoped setup on adoptedCallback", () => {
    const host = new TestHost();
    const events = [];

    prepareEffects(host);
    useOnConnect(host, () => {
      events.push("connect");
      return () => events.push("cleanup");
    }, []);
    update(host);

    host.adoptedCallback();

    assert.deepStrictEqual(events, ["connect", "cleanup", "connect"]);
  });

  it("resolves the active host for custom-hook style calls during render", () => {
    const host = new TestHost();

    prepareEffects(host);
    const ref = useRef(null, 123);

    assert.strictEqual(ref.current, 123);
    assert.strictEqual(host.controllers.length, 1);
  });

  it("returns the active host for custom-hook style host access during render", () => {
    const host = new TestHost();

    prepareEffects(host);
    const current = useHost(null);

    assert.strictEqual(current, host);
  });

  it("keeps DOM targets when using callback refs without an imperative override", () => {
    const host = new TestHost();
    const node = { tagName: "INPUT" };
    let current = null;

    prepareEffects(host);
    useCallbackRef(host, () => node, (value) => {
      current = value;
    }, []);
    update(host);

    assert.strictEqual(current, node);
  });

  it("lets imperative handles override forwarded DOM targets on the same ref channel", () => {
    const host = new TestHost();
    const node = { tagName: "INPUT" };
    const ref = { current: null };
    const handle = {
      focus() {
        return "focus";
      },
    };

    prepareEffects(host);
    useCallbackRef(host, () => node, (value) => {
      ref.current = value;
    }, [ref]);
    useExpose(host, ref, () => handle, [ref]);
    update(host);

    assert.strictEqual(ref.current, handle);
    assert.strictEqual(ref.current.focus(), "focus");
  });

  it("observes host content reactively", () => {
    const host = new TestHost();
    const observerCallbacks = [];

    globalThis.MutationObserver = class MockMutationObserver {
      constructor(callback) {
        observerCallbacks.push(callback);
      }

      observe() {}

      disconnect() {}
    };

    host.childNodes = [{ nodeType: 3, textContent: "  alpha  " }];
    host.textContent = "  alpha  ";

    prepareEffects(host);
    const initialContent = useHostContent({ trim: true });
    update(host);

    assert.strictEqual(initialContent.text, "alpha");
    assert.strictEqual(initialContent.hasContent, true);
    assert.strictEqual(initialContent.nodes.length, 1);
    assert.deepStrictEqual(initialContent.slots.default, host.childNodes);

    host.childNodes = [
      { nodeType: 3, textContent: "beta" },
      {
        nodeType: 1,
        textContent: "Go",
        slot: "actions",
        getAttribute(name) {
          return name === "slot" ? "actions" : null;
        },
      },
    ];
    host.textContent = "betaGo";
    for (const callback of observerCallbacks) {
      callback();
    }

    prepareEffects(host);
    const nextContent = useHostContent({ trim: true });
    update(host);

    assert.strictEqual(nextContent.text, "betaGo");
    assert.strictEqual(nextContent.hasContent, true);
    assert.strictEqual(nextContent.nodes.length, 2);
    assert.deepStrictEqual(nextContent.slots.default, [host.childNodes[0]]);
    assert.deepStrictEqual(nextContent.slots.actions, [host.childNodes[1]]);
  });

  it("derives reactive text and slot helpers from host content", () => {
    const host = new TestHost();
    const observerCallbacks = [];

    globalThis.MutationObserver = class MockMutationObserver {
      constructor(callback) {
        observerCallbacks.push(callback);
      }

      observe() {}

      disconnect() {}
    };

    host.childNodes = [
      { nodeType: 3, textContent: "  hello  " },
      {
        nodeType: 1,
        textContent: "Save",
        slot: "actions",
        getAttribute(name) {
          return name === "slot" ? "actions" : null;
        },
      },
    ];
    host.textContent = "  hello  Save";

    prepareEffects(host);
    const initialText = useTextContent({ trim: true });
    const initialDefault = useSlot();
    const initialActions = useSlot("actions");
    update(host);

    assert.strictEqual(initialText, "hello  Save");
    assert.deepStrictEqual(initialDefault, [host.childNodes[0]]);
    assert.deepStrictEqual(initialActions, [host.childNodes[1]]);

    host.childNodes = [{ nodeType: 3, textContent: "bye" }];
    host.textContent = "bye";
    for (const callback of observerCallbacks) {
      callback();
    }

    prepareEffects(host);
    const nextText = useTextContent({ trim: true });
    const nextDefault = useSlot();
    const nextActions = useSlot("actions");
    update(host);

    assert.strictEqual(nextText, "bye");
    assert.deepStrictEqual(nextDefault, [host.childNodes[0]]);
    assert.deepStrictEqual(nextActions, []);
  });

  it("returns stable ids per host and call order", () => {
    const firstHost = new TestHost();
    const secondHost = new TestHost();

    prepareEffects(firstHost);
    const firstA = useId(firstHost);
    const firstB = useId(firstHost);

    prepareEffects(firstHost);
    const nextA = useId(firstHost);
    const nextB = useId(firstHost);

    prepareEffects(secondHost);
    const secondA = useId(secondHost);

    assert.strictEqual(firstA, nextA);
    assert.strictEqual(firstB, nextB);
    assert.notStrictEqual(firstA, firstB);
    assert.notStrictEqual(firstA, secondA);
  });

  it("registers direct custom element constructors in the scoped registry", () => {
    const host = new TestHost();
    class FancyButtonElement {}

    const registered = ensureLazyElement(
      host,
      "fancy-button",
      FancyButtonElement
    );

    assert.strictEqual(registered, FancyButtonElement);
    assert.strictEqual(host.registry.get("fancy-button"), FancyButtonElement);
    assert.strictEqual(host.updates, 0);
  });

  it("loads scoped elements lazily and requests an update once resolved", async () => {
    const host = new TestHost();
    class FancyButtonElement {}
    let loads = 0;
    const loader = () => {
      loads += 1;
      return Promise.resolve(FancyButtonElement);
    };

    const initial = ensureLazyElement(host, "fancy-button", loader);
    const pending = ensureLazyElement(host, "fancy-button", loader);

    assert.strictEqual(initial, null);
    assert.strictEqual(pending, null);
    assert.strictEqual(loads, 0);

    await new Promise((resolve) => setTimeout(resolve, 0));

    const resolved = ensureLazyElement(host, "fancy-button", loader);

    assert.strictEqual(resolved, FancyButtonElement);
    assert.strictEqual(host.registry.get("fancy-button"), FancyButtonElement);
    assert.strictEqual(loads, 1);
    assert.strictEqual(host.updates, 1);
  });

  it("applies dynamic host style properties after commit", () => {
    const host = new TestHost();

    prepareEffects(host);
    useStyle(host, "--accent", "tomato");
    update(host);

    assert.strictEqual(host.styleAssignments.get("--accent"), "tomato");

    prepareEffects(host);
    useStyle(host, "--accent", null);
    update(host);

    assert.strictEqual(host.styleAssignments.has("--accent"), false);
  });

  it("uses earlier hook results in the same authored render order", () => {
    const host = new TestHost();
    let gap = 12;
    let accent = "tomato";

    prepareEffects(host);
    const gapValue = useMemoValue(host, () => `${gap}px`, [gap]);
    const getAccent = useStableCallback(host, () => accent, [accent]);
    useStyle(host, "--panel-gap", gapValue);
    useStyle(host, "--panel-accent", getAccent());
    update(host);

    assert.strictEqual(host.styleAssignments.get("--panel-gap"), "12px");
    assert.strictEqual(host.styleAssignments.get("--panel-accent"), "tomato");

    gap = 20;
    accent = "royalblue";

    prepareEffects(host);
    const nextGapValue = useMemoValue(host, () => `${gap}px`, [gap]);
    const nextGetAccent = useStableCallback(host, () => accent, [accent]);
    useStyle(host, "--panel-gap", nextGapValue);
    useStyle(host, "--panel-accent", nextGetAccent());
    update(host);

    assert.strictEqual(host.styleAssignments.get("--panel-gap"), "20px");
    assert.strictEqual(host.styleAssignments.get("--panel-accent"), "royalblue");
  });

  it("supports computed style values with dependencies", () => {
    const host = new TestHost();
    let gap = 12;
    let computes = 0;

    prepareEffects(host);
    useStyle(host, "--panel-gap", () => {
      computes += 1;
      return `${gap}px`;
    }, [gap]);
    update(host);

    assert.strictEqual(host.styleAssignments.get("--panel-gap"), "12px");
    assert.strictEqual(computes, 1);

    prepareEffects(host);
    useStyle(host, "--panel-gap", () => {
      computes += 1;
      return `${gap}px`;
    }, [gap]);
    update(host);

    assert.strictEqual(host.styleAssignments.get("--panel-gap"), "12px");
    assert.strictEqual(computes, 1);

    gap = 20;

    prepareEffects(host);
    useStyle(host, "--panel-gap", () => {
      computes += 1;
      return `${gap}px`;
    }, [gap]);
    update(host);

    assert.strictEqual(host.styleAssignments.get("--panel-gap"), "20px");
    assert.strictEqual(computes, 2);
  });

  it("recomputes computed style values on every commit when deps are omitted", () => {
    const host = new TestHost();
    let gap = 12;
    let computes = 0;

    prepareEffects(host);
    useStyle(host, "--panel-gap", () => {
      computes += 1;
      return `${gap}px`;
    });
    update(host);

    assert.strictEqual(host.styleAssignments.get("--panel-gap"), "12px");
    assert.strictEqual(computes, 1);

    prepareEffects(host);
    useStyle(host, "--panel-gap", () => {
      computes += 1;
      return `${gap}px`;
    });
    update(host);

    assert.strictEqual(host.styleAssignments.get("--panel-gap"), "12px");
    assert.strictEqual(computes, 2);

    gap = 20;

    prepareEffects(host);
    useStyle(host, "--panel-gap", () => {
      computes += 1;
      return `${gap}px`;
    });
    update(host);

    assert.strictEqual(host.styleAssignments.get("--panel-gap"), "20px");
    assert.strictEqual(computes, 3);
  });
});
