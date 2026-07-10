import { beforeAll, afterAll } from 'vitest';
import assert from "assert";
import { nothing } from "lit";
import {
  collectSoftSuspenseThenables,
  EffectsController,
  ensureLazyElement,
  ErrorBoundary,
  isLitsxComponentClass,
  isLitsxHook,
  prepareEffects,
  SuspenseBoundary,
  SuspenseList,
  useMemoValue,
  useAfterUpdate,
  useHost,
  useHostTypeId,
  useHostContent,
  useSlot,
  useTextContent,
  useRef,
  useOnConnect,
  useId,
  useStableId,
  useOnCommit,
  useEvent,
  useEmit,
  useElementInternals,
  useFormValidity,
  useFormValue,
  usePrevious,
  useStableCallback,
  useStyle,
  useReducedState,
  resolveStructuralEntry,
  useState,
  useControlledState,
  useAsyncState,
  useOptimistic,
  useCallbackRef,
  useExpose,
  useExternalStore,
  renderWithSoftSuspense,
} from "../packages/core/src/index.js";
import { LITSX_COMPONENT, LITSX_HOST_TYPE_ID } from "../packages/core/src/elements/index.js";
import { LITSX_HOOK } from "../packages/core/src/index.js";
import { withSuspenseCapture } from "../packages/core/src/runtime-suspense.js";

const DEFAULT_VALIDITY = Object.freeze({
  badInput: false,
  customError: false,
  patternMismatch: false,
  rangeOverflow: false,
  rangeUnderflow: false,
  stepMismatch: false,
  tooLong: false,
  tooShort: false,
  typeMismatch: false,
  valid: true,
  valueMissing: false,
});

function createValiditySnapshot(flags = {}) {
  const snapshot = {
    ...DEFAULT_VALIDITY,
    ...Object.fromEntries(
      Object.entries(flags).map(([key, value]) => [key, value === true])
    ),
  };
  snapshot.valid = !Object.entries(snapshot).some(([key, value]) => key !== "valid" && value === true);
  return snapshot;
}

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
    this.__internalsCalls = [];
    this.__internalsValidityCalls = [];
    this.__internalsCheckCalls = 0;
    this.__internalsReportCalls = 0;
    this.__attachInternalsCalls = 0;
    this.__internalsDisabled = false;
    this.__internalsValidationMessage = "";
    this.__internalsValidity = createValiditySnapshot();
  }

  addController(controller) {
    this.controllers.push(controller);
  }

  requestUpdate() {
    this.updates += 1;
  }

  attachInternals() {
    this.__attachInternalsCalls += 1;
    if (!this.__internals) {
      this.__internals = {
        setFormValue: (value, state) => {
          this.__internalsCalls.push([value, state]);
        },
        setValidity: (flags = {}, message = "", anchor = null) => {
          this.__internalsValidity = createValiditySnapshot(flags);
          this.__internalsValidationMessage = this.__internalsValidity.valid ? "" : message;
          this.__internalsValidityCalls.push([
            this.__internalsValidity,
            this.__internalsValidationMessage,
            anchor,
          ]);
        },
        checkValidity: () => {
          this.__internalsCheckCalls += 1;
          return this.__internalsValidity.valid;
        },
        reportValidity: () => {
          this.__internalsReportCalls += 1;
          return this.__internalsValidity.valid;
        },
        get validity() {
          return this.__owner.__internalsValidity;
        },
        get validationMessage() {
          return this.__owner.__internalsValidationMessage;
        },
        get willValidate() {
          return !this.__owner.__internalsDisabled;
        },
        __owner: this,
      };
    }
    return this.__internals;
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

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
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
    useAfterUpdate(host, () => {
      runs += 1;
    }, []);
    update(host);

    assert.strictEqual(runs, 1);

    prepareEffects(host);
    useAfterUpdate(host, () => {
      runs += 1;
    }, []);
    update(host);

    assert.strictEqual(runs, 1);
  });

  it("always reruns effects when dependencies are omitted", () => {
    const host = new TestHost();
    let runs = 0;

    prepareEffects(host);
    useAfterUpdate(host, () => {
      runs += 1;
    });
    update(host);

    assert.strictEqual(runs, 1);

    prepareEffects(host);
    useAfterUpdate(host, () => {
      runs += 1;
    });
    update(host);

    assert.strictEqual(runs, 2);
  });

  it("handles adopted callbacks when hosts or controllers are partially missing", () => {
    const host = new TestHost();
    let adoptedRuns = 0;
    host.adoptedCallback = function (...args) {
      this.originalArgs = args;
    };

    prepareEffects(host);
    const controller = host.controllers[0];
    host[Symbol.for ? Symbol.for("unused") : "unused"] = true;
    host.controllers.push(null);
    host.controllers.push({ hostAdopted() {} });

    host.adoptedCallback("doc");

    assert.deepStrictEqual(host.originalArgs, ["doc"]);
    assert.equal(adoptedRuns, 0);

    controller.hostAdopted = (...args) => {
      adoptedRuns += args.length;
    };

    host.adoptedCallback("new-doc");

    assert.equal(adoptedRuns, 1);
  });

  it("cleans up disconnected imperative refs and external stores defensively", () => {
    const host = new TestHost();
    prepareEffects(host);
    const controller = host.controllers[0];
    let unsubscribed = 0;

    controller.imperatives.push({ ref: { current: { value: 1 } } }, null);
    controller.externalStores.push(
      { unsubscribe: () => { unsubscribed += 1; } },
      { unsubscribe: null },
    );
    controller.hostDisconnected();

    assert.equal(unsubscribed, 1);
    assert.strictEqual(controller.imperatives[0].ref.current, null);
    assert.equal(controller.externalStores.length, 0);
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

  it("keeps the emit helper stable across renders", () => {
    const host = new TestHost();

    prepareEffects(host);
    const firstEmit = useEmit(host);
    update(host);

    prepareEffects(host);
    const secondEmit = useEmit(host);
    update(host);

    assert.strictEqual(firstEmit, secondEmit);
  });

  it("manages form-associated value state through useFormValue", () => {
    const host = new TestHost();
    const form = { tagName: "FORM" };

    prepareEffects(host);
    let control = resolveStructuralEntry(
      host,
      0,
      "form-value",
      useFormValue,
      ["draft"],
      { callsitePath: ["form-value"] },
    );

    assert.strictEqual(control.value, "draft");
    assert.strictEqual(control.defaultValue, "draft");
    assert.strictEqual(control.form, null);
    assert.strictEqual(host.form, null);
    assert.strictEqual(control.disabled, false);
    assert.deepStrictEqual(host.__internalsCalls, [["draft", "draft"]]);

    control.setValue("ready");
    control.setDefaultValue("fallback");
    control.setFormValue("submit:ready", "restore:ready");

    assert.strictEqual(host.updates, 2);
    assert.deepStrictEqual(host.__internalsCalls.at(-2), ["ready", "ready"]);
    assert.deepStrictEqual(host.__internalsCalls.at(-1), ["submit:ready", "restore:ready"]);

    prepareEffects(host);
    control = resolveStructuralEntry(
      host,
      0,
      "form-value",
      useFormValue,
      ["draft"],
      { callsitePath: ["form-value"] },
    );

    assert.strictEqual(control.value, "ready");
    assert.strictEqual(control.defaultValue, "fallback");

    host.__litsxHostMiddlewareRuntime.formAssociatedCallback([form], () => undefined);
    host.__litsxHostMiddlewareRuntime.formDisabledCallback([true], () => undefined);

    prepareEffects(host);
    control = resolveStructuralEntry(
      host,
      0,
      "form-value",
      useFormValue,
      ["draft"],
      { callsitePath: ["form-value"] },
    );

    assert.strictEqual(control.form, form);
    assert.strictEqual(host.form, form);
    assert.strictEqual(control.disabled, true);

    host.__litsxHostMiddlewareRuntime.formStateRestoreCallback(["restored", "restore"], () => undefined);

    prepareEffects(host);
    control = resolveStructuralEntry(
      host,
      0,
      "form-value",
      useFormValue,
      ["draft"],
      { callsitePath: ["form-value"] },
    );

    assert.strictEqual(control.value, "restored");
    assert.strictEqual(control.restoreState, "restored");
    assert.strictEqual(control.restoreMode, "restore");
    assert.deepStrictEqual(host.__internalsCalls.at(-1), ["restored", "restored"]);

    host.__litsxHostMiddlewareRuntime.formResetCallback(() => undefined);

    prepareEffects(host);
    control = resolveStructuralEntry(
      host,
      0,
      "form-value",
      useFormValue,
      ["draft"],
      { callsitePath: ["form-value"] },
    );

    assert.strictEqual(control.value, "fallback");
    assert.strictEqual(control.defaultValue, "fallback");
    assert.strictEqual(control.restoreState, null);
    assert.strictEqual(control.restoreMode, null);
    assert.deepStrictEqual(host.__internalsCalls.at(-1), ["fallback", "fallback"]);
  });

  it("shares cached element internals across FACE hooks", () => {
    const host = new TestHost();

    prepareEffects(host);
    const handle = resolveStructuralEntry(
      host,
      0,
      "element-internals",
      useElementInternals,
      [],
      { callsitePath: ["element-internals"] },
    );
    const control = resolveStructuralEntry(
      host,
      1,
      "form-validity",
      useFormValidity,
      [],
      { callsitePath: ["form-validity"] },
    );

    assert.strictEqual(handle.supported, true);
    assert.strictEqual(handle.internals, host.__internals);
    assert.strictEqual(control.supported, true);
    assert.strictEqual(host.__attachInternalsCalls, 1);
    assert.strictEqual(host.form, null);
    assert.deepStrictEqual(host.validity, createValiditySnapshot());
    assert.strictEqual(host.validationMessage, "");
    assert.strictEqual(host.willValidate, true);
  });

  it("manages FACE validity state through useFormValidity", () => {
    const host = new TestHost();
    const anchor = { tagName: "INPUT" };

    prepareEffects(host);
    let control = resolveStructuralEntry(
      host,
      0,
      "form-validity",
      useFormValidity,
      [],
      { callsitePath: ["form-validity"] },
    );

    assert.strictEqual(control.supported, true);
    assert.strictEqual(control.willValidate, true);
    assert.deepStrictEqual(control.validity, createValiditySnapshot());
    assert.strictEqual(control.validationMessage, "");
    assert.strictEqual(host.willValidate, true);
    assert.deepStrictEqual(host.validity, createValiditySnapshot());
    assert.strictEqual(host.validationMessage, "");

    control.setValidity({ valueMissing: true }, "Required", anchor);

    assert.strictEqual(host.updates, 1);
    assert.deepStrictEqual(host.__internalsValidityCalls.at(-1), [
      createValiditySnapshot({ valueMissing: true }),
      "Required",
      anchor,
    ]);

    prepareEffects(host);
    control = resolveStructuralEntry(
      host,
      0,
      "form-validity",
      useFormValidity,
      [],
      { callsitePath: ["form-validity"] },
    );

    assert.strictEqual(control.validity.valid, false);
    assert.strictEqual(control.validity.valueMissing, true);
    assert.strictEqual(control.validationMessage, "Required");
    assert.strictEqual(host.validity.valid, false);
    assert.strictEqual(host.validity.valueMissing, true);
    assert.strictEqual(host.validationMessage, "Required");
    assert.strictEqual(control.checkValidity(), false);
    assert.strictEqual(control.reportValidity(), false);
    assert.strictEqual(host.__internalsCheckCalls, 1);
    assert.strictEqual(host.__internalsReportCalls, 1);
    assert.strictEqual(host.updates, 1);

    host.__internalsDisabled = true;
    host.__litsxHostMiddlewareRuntime.formDisabledCallback([true], () => undefined);

    prepareEffects(host);
    control = resolveStructuralEntry(
      host,
      0,
      "form-validity",
      useFormValidity,
      [],
      { callsitePath: ["form-validity"] },
    );

    assert.strictEqual(control.willValidate, false);
    assert.strictEqual(host.willValidate, false);
    assert.strictEqual(host.updates, 2);
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

  it("memoizes derived values until dependencies change", () => {
    const host = new TestHost();
    let memoRuns = 0;
    let uncachedRuns = 0;

    prepareEffects(host);
    const firstMemo = useMemoValue(host, () => {
      memoRuns += 1;
      return { value: "alpha" };
    }, ["alpha"]);
    const firstUncached = useMemoValue(host, () => {
      uncachedRuns += 1;
      return "first";
    });
    update(host);

    prepareEffects(host);
    const secondMemo = useMemoValue(host, () => {
      memoRuns += 1;
      return { value: "beta" };
    }, ["alpha"]);
    const secondUncached = useMemoValue(host, () => {
      uncachedRuns += 1;
      return "second";
    });
    update(host);

    prepareEffects(host);
    const thirdMemo = useMemoValue(host, () => {
      memoRuns += 1;
      return { value: "gamma" };
    }, ["gamma"]);
    update(host);

    assert.strictEqual(memoRuns, 2);
    assert.strictEqual(uncachedRuns, 2);
    assert.strictEqual(firstMemo, secondMemo);
    assert.notStrictEqual(secondMemo, thirdMemo);
    assert.strictEqual(firstUncached, "first");
    assert.strictEqual(secondUncached, "second");
  });

  it("keeps stable callbacks until dependencies change", () => {
    const host = new TestHost();

    prepareEffects(host);
    const first = useStableCallback(host, () => "alpha", ["same"]);
    update(host);

    prepareEffects(host);
    const second = useStableCallback(host, () => "beta", ["same"]);
    update(host);

    prepareEffects(host);
    const third = useStableCallback(host, () => "gamma", ["changed"]);
    update(host);

    assert.strictEqual(first, second);
    assert.notStrictEqual(second, third);
    assert.strictEqual(second(), "alpha");
    assert.strictEqual(third(), "gamma");
  });

  it("manages reducer state with optional initialization", () => {
    const host = new TestHost();
    const reducer = (state, action) => {
      if (action.type === "noop") {
        return state;
      }
      if (action.type === "add") {
        return state + action.value;
      }
      return action.value;
    };

    prepareEffects(host);
    const [firstValue, dispatch] = useReducedState(host, reducer, 2, (value) => value * 2);
    update(host);

    assert.strictEqual(firstValue, 4);
    assert.strictEqual(host.updates, 0);

    dispatch({ type: "noop" });
    assert.strictEqual(host.updates, 0);

    dispatch({ type: "add", value: 3 });
    assert.strictEqual(host.updates, 1);

    prepareEffects(host);
    const [secondValue] = useReducedState(host, reducer, 2, (value) => value * 100);
    update(host);

    assert.strictEqual(secondValue, 7);
  });

  it("initializes useState lazily only once and supports updater functions", () => {
    const host = new TestHost();
    let initializations = 0;

    prepareEffects(host);
    let [value, setValue] = useState(host, () => {
      initializations += 1;
      return 2;
    });
    update(host);

    assert.strictEqual(value, 2);
    assert.strictEqual(initializations, 1);

    setValue((previous) => previous + 3);
    update(host);

    prepareEffects(host);
    [value] = useState(host, () => {
      initializations += 1;
      return 99;
    });
    update(host);

    assert.strictEqual(value, 5);
    assert.strictEqual(initializations, 1);
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

  it("skips controlled-state notifications when the resolved value does not change", () => {
    const host = new TestHost();
    const changes = [];

    prepareEffects(host);
    let [value, setValue] = useControlledState(host, {
      value: 2,
      defaultValue: 1,
      onChange: (next) => changes.push(next),
    });
    assert.strictEqual(value, 2);

    setValue((current) => current);
    setValue(2);
    update(host);

    prepareEffects(host);
    [value] = useControlledState(host, {
      value: 2,
      defaultValue: 1,
      onChange: (next) => changes.push(next),
    });

    assert.strictEqual(value, 2);
    assert.deepStrictEqual(changes, []);
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

  it("ignores optimistic resets when no optimistic updates are queued", () => {
    const host = new TestHost();

    prepareEffects(host);
    const [optimisticItems, , resetOptimistic] = useOptimistic(
      host,
      ["base"],
      (currentItems, optimisticItem) => [...currentItems, optimisticItem]
    );

    assert.deepStrictEqual(optimisticItems, ["base"]);
    assert.strictEqual(host.updates, 0);

    resetOptimistic();
    update(host);

    assert.strictEqual(host.updates, 0);
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
    useAfterUpdate(host, callback, [value]);
    update(host);
    assert.strictEqual(runs, 1);
    assert.deepStrictEqual(cleanups, []);

    prepareEffects(host);
    useAfterUpdate(host, callback, [value]);
    update(host);
    assert.strictEqual(runs, 1);
    assert.deepStrictEqual(cleanups, []);

    value = 2;
    prepareEffects(host);
    useAfterUpdate(host, callback, [value]);
    update(host);
    assert.strictEqual(runs, 2);
    assert.deepStrictEqual(cleanups, [1]);
  });

  it("executes layout effects before passive effects", () => {
    const host = new TestHost();
    const order = [];

    prepareEffects(host);
    useAfterUpdate(host, () => {
      order.push("passive");
    }, []);
    useOnCommit(host, () => {
      order.push("layout");
    }, []);
    update(host);

    assert.deepStrictEqual(order, ["layout", "passive"]);
  });

  it("runs cleanups on disconnect", () => {
    const host = new TestHost();
    const cleanups = [];

    prepareEffects(host);
    useAfterUpdate(host, () => () => cleanups.push("cleanup"), []);
    update(host);

    host.controllers.forEach((controller) => controller.hostDisconnected());

    assert.deepStrictEqual(cleanups, ["cleanup"]);
  });

  it("forwards adopted callbacks to the original host callback without double-wrapping", () => {
    const adoptedArgs = [];
    const host = new TestHost();
    let originalCalls = 0;
    host.adoptedCallback = (...args) => {
      originalCalls += 1;
      adoptedArgs.push(["original", ...args]);
    };

    const first = new EffectsController(host);
    const second = new EffectsController(host);

    first.hostAdopted = (...args) => adoptedArgs.push(["first", ...args]);
    second.hostAdopted = (...args) => adoptedArgs.push(["second", ...args]);

    host.adoptedCallback("doc");

    assert.strictEqual(originalCalls, 1);
    assert.deepStrictEqual(adoptedArgs, [
      ["original", "doc"],
      ["first", "doc"],
      ["second", "doc"],
    ]);
  });

  it("cleans up removed connected hooks when fewer hooks are registered on a later render", () => {
    const host = new TestHost();
    const calls = [];

    prepareEffects(host);
    useOnConnect(host, () => () => calls.push("first-cleanup"), ["a"]);
    useOnConnect(host, () => () => calls.push("second-cleanup"), ["b"]);
    update(host);

    prepareEffects(host);
    useOnConnect(host, () => () => calls.push("first-next-cleanup"), ["a"]);
    update(host);

    assert.deepStrictEqual(calls, ["second-cleanup"]);
  });

  it("accepts option-only host content calls and trims the resulting text", () => {
    const host = new TestHost();
    host.textContent = "  hello world  ";
    host.childNodes = [{
      nodeType: 3,
      textContent: "  hello world  ",
    }];

    prepareEffects(host);
    const content = useHostContent({ trim: true });
    update(host);

    assert.strictEqual(content.text, "hello world");
    assert.strictEqual(content.hasContent, true);
  });

  it("validates useCallbackRef getters and ignores non-function callbacks", () => {
    const host = new TestHost();

    assert.throws(() => {
      useCallbackRef(host, null, () => {});
    }, /getter function/);

    prepareEffects(host);
    assert.doesNotThrow(() => {
      useCallbackRef(host, () => null, null);
    });
    update(host);
  });

  it("publishes imperative methods on the host instance", () => {
    const host = new TestHost();

    prepareEffects(host);
    useExpose(host, () => ({
      focus() {
        return "ok";
      },
    }));
    update(host);

    assert.strictEqual(typeof host.focus, "function");
    assert.strictEqual(host.focus(), "ok");

    host.disconnect();

    assert.strictEqual(typeof host.focus, "function");
    assert.strictEqual(host.focus(), "ok");
  });

  it("publishes imperative methods through a ref handle when explicitly targeted", () => {
    const host = new TestHost();
    const values = [];
    const ref = (value) => {
      values.push(value);
    };

    prepareEffects(host);
    useExpose(host, ref, () => ({
      focus() {
        return "ok";
      },
    }));
    update(host);

    assert.strictEqual(typeof values[0].focus, "function");
    assert.strictEqual(values[0].focus(), "ok");
    assert.strictEqual(host.focus, undefined);

    host.disconnect();

    assert.strictEqual(values.at(-1), null);
    assert.strictEqual(host.focus, undefined);
  });

  it("rejects non-method members in useExpose", () => {
    const host = new TestHost();

    prepareEffects(host);
    useExpose(host, () => ({
      value: "nope",
    }));

    assert.throws(() => {
      update(host);
    }, /useExpose only supports imperative methods/);
  });

  it("lets multiple useExpose calls publish distinct methods", () => {
    const host = new TestHost();

    prepareEffects(host);
    useExpose(host, () => ({
      focus() {
        return "focus";
      },
    }));
    useExpose(host, () => ({
      reset() {
        return "reset";
      },
    }));
    update(host);

    assert.strictEqual(host.focus(), "focus");
    assert.strictEqual(host.reset(), "reset");
  });

  it("lets later useExpose calls override the same host method and restores earlier publishers when needed", () => {
    const host = new TestHost();
    let includeOverride = true;

    prepareEffects(host);
    useExpose(host, () => ({
      focus() {
        return "first";
      },
    }));
    useExpose(host, () => ({
      focus() {
        return "second";
      },
    }), includeOverride ? ["override"] : ["base"]);
    update(host);

    assert.strictEqual(host.focus(), "second");

    includeOverride = false;
    prepareEffects(host);
    useExpose(host, () => ({
      focus() {
        return "first";
      },
    }));
    if (includeOverride) {
      useExpose(host, () => ({
        focus() {
          return "second";
        },
      }), ["override"]);
    }
    update(host);

    assert.strictEqual(host.focus(), "first");
  });

  it("cleans up removed hooks and resets flags on disconnect", () => {
    const host = new TestHost();
    const events = [];

    prepareEffects(host);
    useAfterUpdate(host, () => () => events.push("first-cleanup"), []);
    useOnCommit(host, () => () => events.push("layout-cleanup"), []);
    update(host);

    prepareEffects(host);
    useAfterUpdate(host, () => () => events.push("second-cleanup"), []);
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
    useAfterUpdate(host, () => {
      runs += 1;
      return undefined;
    }, null);
    update(host);

    prepareEffects(host);
    useAfterUpdate(host, () => {
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

  it("marks connected effects dirty when previous deps are non-array or change length", () => {
    const host = new TestHost();
    const controller = new EffectsController(host);

    controller.connectedEffects[0] = {
      callback: () => {},
      deps: null,
      cleanup: undefined,
      active: true,
      needsRun: false,
    };
    controller.connectedCursor = 0;

    controller.registerConnected(() => {}, ["alpha"]);

    assert.strictEqual(controller.connectedEffects[0].needsRun, true);

    controller.connectedEffects[0].deps = ["alpha"];
    controller.connectedEffects[0].active = true;
    controller.connectedEffects[0].needsRun = false;
    controller.connectedCursor = 0;

    controller.registerConnected(() => {}, ["alpha", "beta"]);

    assert.strictEqual(controller.connectedEffects[0].needsRun, true);
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

  it("ignores adopted host transitions while the host is disconnected", () => {
    const host = new TestHost();
    const controller = new EffectsController(host);
    let cleanups = 0;

    controller.connectedEffects.push({
      callback: () => {},
      deps: [],
      cleanup: () => {
        cleanups += 1;
      },
      active: true,
      needsRun: false,
    });
    controller.hostIsConnected = false;

    controller.hostAdopted();

    assert.strictEqual(cleanups, 0);
    assert.strictEqual(controller.connectedEffects[0].active, true);
    assert.strictEqual(controller.connectedEffects[0].needsRun, false);
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

  it("keeps mutable refs stable across renders", () => {
    const host = new TestHost();

    prepareEffects(host);
    const firstRef = useRef(host, "alpha");
    update(host);

    firstRef.current = "beta";

    prepareEffects(host);
    const secondRef = useRef(host, "gamma");
    update(host);

    assert.strictEqual(firstRef, secondRef);
    assert.strictEqual(secondRef.current, "beta");
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

  it("cleans callback refs on disconnect", () => {
    const host = new TestHost();
    const node = { tagName: "FORM" };
    const calls = [];

    prepareEffects(host);
    useCallbackRef(host, () => node, (value) => {
      calls.push(value);
    }, []);
    update(host);

    host.disconnect();

    assert.strictEqual(calls[0], node);
    assert.strictEqual(calls.at(-1), null);
  });

  it("cleans the previous callback ref when the callback changes", () => {
    const host = new TestHost();
    const node = { tagName: "FORM" };
    const calls = [];
    const first = (value) => calls.push(["first", value]);
    const second = (value) => calls.push(["second", value]);

    prepareEffects(host);
    useCallbackRef(host, () => node, first, [first]);
    update(host);

    prepareEffects(host);
    useCallbackRef(host, () => node, second, [second]);
    update(host);

    assert.deepStrictEqual(calls, [
      ["first", node],
      ["first", null],
      ["second", node],
    ]);
  });

  it("keeps callback refs bound to their DOM targets when useExpose is also used", () => {
    const host = new TestHost();
    const node = { tagName: "INPUT" };
    const ref = { current: null };

    prepareEffects(host);
    useCallbackRef(host, () => node, (value) => {
      ref.current = value;
    }, [ref]);
    useExpose(host, () => ({
      focus() {
        return "focus";
      },
    }), []);
    update(host);

    assert.strictEqual(ref.current, node);
    assert.strictEqual(host.focus(), "focus");
  });

  it("lets ref-targeted useExpose override a forwarded DOM target on that ref channel", () => {
    const host = new TestHost();
    const node = { tagName: "INPUT" };
    const ref = { current: null };

    prepareEffects(host);
    useCallbackRef(host, () => node, (value) => {
      ref.current = value;
    }, [ref]);
    useExpose(host, ref, () => ({
      focus() {
        return "focus";
      },
    }), [ref]);
    update(host);

    assert.strictEqual(typeof ref.current.focus, "function");
    assert.strictEqual(ref.current.focus(), "focus");
    assert.strictEqual(host.focus, undefined);
  });

  it("lets later ref-targeted useExpose calls override the same method on one ref channel", () => {
    const host = new TestHost();
    const ref = { current: null };

    prepareEffects(host);
    useExpose(host, ref, () => ({
      focus() {
        return "first";
      },
    }));
    useExpose(host, ref, () => ({
      focus() {
        return "second";
      },
    }));
    update(host);

    assert.strictEqual(ref.current.focus(), "second");

    prepareEffects(host);
    useExpose(host, ref, () => ({
      focus() {
        return "first";
      },
    }));
    update(host);

    assert.strictEqual(ref.current.focus(), "first");
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

  it("returns stable callsite ids independent of host instances", () => {
    const firstHost = new TestHost();
    const secondHost = new TestHost();

    assert.strictEqual(useStableId(firstHost, "litsx-stable-demo"), "litsx-stable-demo");
    assert.strictEqual(useStableId(secondHost, "litsx-stable-demo"), "litsx-stable-demo");
    assert.notStrictEqual(
      useStableId(firstHost, "litsx-stable-demo"),
      useStableId(firstHost, "litsx-stable-other"),
    );
  });

  it("returns stable host-type ids from LitSX-compiled component constructors", () => {
    class TypedHost extends TestHost {}
    TypedHost[LITSX_COMPONENT] = true;
    TypedHost[LITSX_HOST_TYPE_ID] = "litsx-host-type-demo";

    const firstHost = new TypedHost();
    const secondHost = new TypedHost();

    assert.strictEqual(useHostTypeId(firstHost), "litsx-host-type-demo");
    assert.strictEqual(useHostTypeId(secondHost), "litsx-host-type-demo");
  });

  it("throws when host-type metadata is missing", () => {
    const host = new TestHost();

    assert.throws(
      () => useHostTypeId(host),
      /LitSX-compiled component host with stable host-type metadata/
    );
  });

  it("marks compiled hooks with LitSX hook metadata", () => {
    const hook = () => "value";
    hook[LITSX_HOOK] = true;
    assert.strictEqual(isLitsxHook(hook), true);
    assert.strictEqual(isLitsxHook(() => "other"), false);
  });

  it("detects LitSX component classes from published metadata", () => {
    class LitsxHost extends TestHost {}
    class PlainHost extends TestHost {}

    LitsxHost[LITSX_COMPONENT] = true;
    LitsxHost[LITSX_HOST_TYPE_ID] = "litsx-host-type-demo";

    assert.strictEqual(isLitsxComponentClass(LitsxHost), true);
    assert.strictEqual(isLitsxComponentClass(PlainHost), false);
  });

  it("marks built-in boundary elements with LitSX component metadata", () => {
    assert.strictEqual(isLitsxComponentClass(ErrorBoundary), true);
    assert.strictEqual(isLitsxComponentClass(SuspenseBoundary), true);
    assert.strictEqual(isLitsxComponentClass(SuspenseList), true);
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

  it("returns null for lazy elements when the host has no usable registry", () => {
    class FancyButtonElement {}

    assert.strictEqual(ensureLazyElement({}, "fancy-button", FancyButtonElement), null);
    assert.strictEqual(ensureLazyElement(null, "fancy-button", FancyButtonElement), null);
  });

  it("resolves scoped registries from the host root when nested boundaries do not carry registry directly", () => {
    class FancyButtonElement {}
    const registry = {
      definitions: new Map(),
      define(tag, ctor) {
        this.definitions.set(tag, ctor);
      },
      get(tag) {
        return this.definitions.get(tag);
      },
    };
    const boundaryLikeHost = {
      requestUpdate() {},
      getRootNode() {
        return { customElements: registry };
      },
    };

    const registered = ensureLazyElement(
      boundaryLikeHost,
      "fancy-button",
      FancyButtonElement,
    );

    assert.strictEqual(registered, FancyButtonElement);
    assert.strictEqual(registry.get("fancy-button"), FancyButtonElement);
  });

  it("validates lazy element tags and loader values", async () => {
    const host = new TestHost();
    const unhandled = [];
    const onUnhandledRejection = (error) => {
      unhandled.push(error);
    };
    process.on("unhandledRejection", onUnhandledRejection);

    try {
      assert.throws(
        () => ensureLazyElement(host, "", () => Promise.resolve(null)),
        /non-empty tag name/
      );
      assert.throws(
        () => ensureLazyElement(host, "fancy-button", 123),
        /loader, constructor, or nullish value/
      );

      const invalidLoader = () => Promise.resolve({});
      assert.strictEqual(ensureLazyElement(host, "fancy-button", invalidLoader), null);
      await new Promise((resolve) => setTimeout(resolve, 0));
      assert.throws(
        () => ensureLazyElement(host, "fancy-button", invalidLoader),
        /custom element constructor/
      );
    } finally {
      process.off("unhandledRejection", onUnhandledRejection);
    }
  });

  it("validates host-dependent runtime helpers when no active host is available", () => {
    const host = new TestHost();
    assert.throws(() => useExternalStore(host, null, () => 1), /subscribe function/);
    assert.throws(() => useExternalStore(host, () => () => {}, null), /getSnapshot function/);
  });

  it("applies and removes host styles for direct and computed values", () => {
    const host = new TestHost();

    prepareEffects(host);
    useStyle(host, "--accent", "red");
    useStyle(host, "--gap", () => 12, [12]);
    update(host);

    assert.strictEqual(host.styleAssignments.get("--accent"), "red");
    assert.strictEqual(host.styleAssignments.get("--gap"), "12");

    prepareEffects(host);
    useStyle(host, "--accent", null);
    useStyle(host, "--gap", () => false, [false]);
    update(host);

    assert.strictEqual(host.styleAssignments.has("--accent"), false);
    assert.strictEqual(host.styleAssignments.has("--gap"), false);
  });

  it("skips style writes when the host has no style object", () => {
    const host = new TestHost();
    delete host.style;

    prepareEffects(host);
    useStyle(host, "--accent", "red");

    assert.doesNotThrow(() => update(host));
    assert.strictEqual(host.updates, 0);
  });

  it("returns empty slot state and text snapshots when host content is missing", () => {
    const host = new TestHost();
    host.childNodes = [];
    host.textContent = "";

    prepareEffects(host);
    const defaultSlot = useSlot(host);
    const namedSlot = useSlot(host, "actions");
    const text = useTextContent(host, { trim: true });
    update(host);

    assert.deepStrictEqual(defaultSlot, []);
    assert.deepStrictEqual(namedSlot, []);
    assert.strictEqual(text, "");
  });

  it("reuses existing scoped element registrations and accepts nullish lazy values", () => {
    const host = new TestHost();
    class FancyButtonElement {}

    host.registry.define("fancy-button", FancyButtonElement);

    assert.strictEqual(
      ensureLazyElement(host, "fancy-button", class OtherElement {}),
      FancyButtonElement
    );
    assert.strictEqual(ensureLazyElement(host, "empty-state", null), null);
    assert.strictEqual(ensureLazyElement(host, "empty-state", undefined), null);
  });

  it("uses getServerSnapshot in external stores and cleans up previous subscriptions when inputs change", () => {
    const host = new TestHost();
    const subscriptions = [];
    const unsubscriptions = [];
    let snapshot = "alpha";
    host.isConnected = false;

    const subscribeA = (listener) => {
      subscriptions.push("A");
      listener();
      return () => unsubscriptions.push("A");
    };
    const subscribeB = () => {
      subscriptions.push("B");
      return () => unsubscriptions.push("B");
    };

    prepareEffects(host);
    let value = useExternalStore(
      host,
      subscribeA,
      () => snapshot,
      () => "server-alpha"
    );
    update(host);
    assert.strictEqual(value, "server-alpha");
    assert.deepStrictEqual(subscriptions, ["A"]);

    host.isConnected = true;
    snapshot = "beta";
    prepareEffects(host);
    value = useExternalStore(
      host,
      subscribeB,
      () => snapshot,
      () => "server-beta"
    );
    update(host);

    assert.strictEqual(value, "server-beta");
    assert.deepStrictEqual(subscriptions, ["A", "B"]);
    assert.deepStrictEqual(unsubscriptions, ["A"]);
  });

  it("rethrows rejected lazy loaders on the next render attempt", async () => {
    const host = new TestHost();
    const failure = new Error("lazy failed");
    const unhandled = [];
    const onUnhandledRejection = (error) => {
      unhandled.push(error);
    };
    process.on("unhandledRejection", onUnhandledRejection);
    const loader = () => Promise.reject(failure);

    try {
      assert.strictEqual(ensureLazyElement(host, "fancy-button", loader), null);
      await new Promise((resolve) => setTimeout(resolve, 0));

      assert.throws(() => ensureLazyElement(host, "fancy-button", loader), /lazy failed/);
      assert.strictEqual(host.updates, 1);
    } finally {
      process.off("unhandledRejection", onUnhandledRejection);
    }
  });

  it("validates useExternalStore arguments", () => {
    const host = new TestHost();

    assert.throws(
      () => useExternalStore(host, null, () => "value"),
      /subscribe function/
    );
    assert.throws(
      () => useExternalStore(host, () => () => {}, null),
      /getSnapshot function/
    );
  });

  it("uses server snapshots during render and unsubscribes removed external stores", () => {
    const host = new TestHost();
    const restoreWindow = globalThis.window;
    delete globalThis.window;

    let current = "client";
    let subscribes = 0;
    let unsubscribes = 0;
    let listener = null;
    const subscribe = (next) => {
      subscribes += 1;
      listener = next;
      return () => {
        unsubscribes += 1;
        listener = null;
      };
    };

    try {
      prepareEffects(host);
      const first = useExternalStore(
        host,
        subscribe,
        () => current,
        () => "server"
      );
      assert.strictEqual(first, "server");
      update(host);
      assert.strictEqual(subscribes, 1);

      globalThis.window = {};
      current = "updated";
      listener();
      assert.strictEqual(host.updates, 1);

      prepareEffects(host);
      update(host);
      assert.strictEqual(unsubscribes, 1);
    } finally {
      globalThis.window = restoreWindow;
    }
  });

  it("keeps external store subscriptions null when subscribe returns no cleanup", () => {
    const host = new TestHost();
    let subscriptions = 0;
    let current = "alpha";

    const subscribe = (listener) => {
      subscriptions += 1;
      listener();
      return "not-a-cleanup";
    };

    prepareEffects(host);
    const value = useExternalStore(host, subscribe, () => current);
    update(host);

    assert.strictEqual(value, "alpha");
    assert.strictEqual(subscriptions, 1);
    assert.strictEqual(host.controllers[0].externalStores[0].unsubscribe, null);
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

describe("litsx soft suspense runtime", () => {
  it("captures rootless thenables and requests an update when they resolve", async () => {
    const host = new TestHost();
    const pending = deferred();

    const value = renderWithSoftSuspense(host, () => {
      throw pending.promise;
    });

    assert.strictEqual(value, nothing);
    assert.strictEqual(host.updates, 0);

    pending.resolve();
    await pending.promise;
    await Promise.resolve();

    assert.strictEqual(host.updates, 1);
  });

  it("hands thenables to the active suspense capture scope", () => {
    const host = new TestHost();
    const pending = deferred();
    const captured = [];

    const value = withSuspenseCapture({ capture: (thenable) => captured.push(thenable) }, () =>
      renderWithSoftSuspense(host, () => {
        throw pending.promise;
      })
    );

    assert.strictEqual(value, nothing);
    assert.deepStrictEqual(captured, [pending.promise]);
    assert.strictEqual(host.updates, 0);
  });

  it("collects rootless thenables for SSR retry loops", () => {
    const host = new TestHost();
    const pending = deferred();
    const collected = new Set();

    const value = collectSoftSuspenseThenables(collected, () =>
      renderWithSoftSuspense(host, () => {
        throw pending.promise;
      })
    );

    assert.strictEqual(value, nothing);
    assert.deepStrictEqual([...collected], [pending.promise]);
  });
});
