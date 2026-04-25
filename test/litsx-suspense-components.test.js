import assert from "assert";
import { afterEach, describe, it } from "vitest";
import { nothing } from "lit";
import {
  SuspenseBoundary,
  SuspenseBoundaryElement,
  SuspenseList,
  SuspenseListElement,
} from "../packages/litsx/src/index.js";

const DOCUMENT_POSITION_PRECEDING =
  globalThis.Node?.DOCUMENT_POSITION_PRECEDING ?? 2;
const DOCUMENT_POSITION_FOLLOWING =
  globalThis.Node?.DOCUMENT_POSITION_FOLLOWING ?? 4;

function createDeferred() {
  let resolve;
  let reject;
  const promise = new Promise((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });
  return { promise, resolve, reject };
}

class TestSuspenseBoundaryElement extends SuspenseBoundaryElement {
  scheduleUpdate() {
    return Promise.resolve();
  }

  performUpdate() {}
}

class MotionSuspenseBoundaryElement extends TestSuspenseBoundaryElement {
  hasActiveRevealMotion() {
    return true;
  }

  getRevealMotionTimeout() {
    return 1_000;
  }
}

function templateSource(templateResult) {
  return Array.isArray(templateResult?.strings)
    ? templateResult.strings.join("")
    : "";
}

const originalQueueMicrotask = globalThis.queueMicrotask;
const originalGetComputedStyle = globalThis.getComputedStyle;

afterEach(() => {
  globalThis.queueMicrotask = originalQueueMicrotask;
  globalThis.getComputedStyle = originalGetComputedStyle;
});

describe("litsx suspense components", () => {
  it("re-exports suspense boundary and list elements from the runtime index", () => {
    assert.strictEqual(typeof SuspenseBoundary, "function");
    assert.strictEqual(typeof SuspenseBoundaryElement, "function");
    assert.strictEqual(typeof SuspenseList, "function");
    assert.strictEqual(typeof SuspenseListElement, "function");
    assert.strictEqual(SuspenseBoundaryElement, SuspenseBoundary);
    assert.strictEqual(SuspenseListElement, SuspenseList);
  });

  it("exposes suspense primitives without self-registering custom elements", () => {
    assert.strictEqual(SuspenseBoundaryElement, SuspenseBoundary);
    assert.strictEqual(SuspenseListElement, SuspenseList);
  });

  it('suppresses later pending fallbacks when revealOrder is "forwards"', () => {
    const list = new SuspenseListElement();
    list.revealOrder = "forwards";

    const first = {
      pending: true,
      requestUpdate() {},
      compareDocumentPosition(other) {
        return other === second ? DOCUMENT_POSITION_FOLLOWING : 0;
      },
    };
    const second = {
      pending: true,
      requestUpdate() {},
      compareDocumentPosition(other) {
        return other === first ? DOCUMENT_POSITION_PRECEDING : 0;
      },
    };

    list.registerBoundary(first);
    list.registerBoundary(second);

    assert.strictEqual(list.shouldShowFallback(first), true);
    assert.strictEqual(list.shouldShowFallback(second), false);
  });

  it('suppresses earlier pending fallbacks when revealOrder is "backwards"', () => {
    const list = new SuspenseListElement();
    list.revealOrder = "backwards";

    const first = {
      pending: true,
      requestUpdate() {},
      compareDocumentPosition(other) {
        return other === second ? DOCUMENT_POSITION_FOLLOWING : 0;
      },
    };
    const second = {
      pending: true,
      requestUpdate() {},
      compareDocumentPosition(other) {
        return other === first ? DOCUMENT_POSITION_PRECEDING : 0;
      },
    };

    list.registerBoundary(first);
    list.registerBoundary(second);

    assert.strictEqual(list.shouldShowFallback(first), false);
    assert.strictEqual(list.shouldShowFallback(second), true);
  });

  it('returns "hidden" disposition when tail is hidden', () => {
    const list = new SuspenseListElement();
    list.revealOrder = "forwards";
    list.tail = "hidden";

    const first = {
      pending: true,
      requestUpdate() {},
      compareDocumentPosition(other) {
        return other === second ? DOCUMENT_POSITION_FOLLOWING : 0;
      },
    };
    const second = {
      pending: true,
      requestUpdate() {},
      compareDocumentPosition(other) {
        return other === first ? DOCUMENT_POSITION_PRECEDING : 0;
      },
    };

    list.registerBoundary(first);
    list.registerBoundary(second);

    assert.strictEqual(list.getFallbackDisposition(first), "show");
    assert.strictEqual(list.getFallbackDisposition(second), "hidden");
  });

  it('keeps resolved boundaries on fallback while revealOrder is "together" and another boundary is pending', () => {
    const list = new SuspenseListElement();
    list.revealOrder = "together";

    const first = {
      pending: false,
      requestUpdate() {},
      compareDocumentPosition(other) {
        return other === second ? DOCUMENT_POSITION_FOLLOWING : 0;
      },
    };
    const second = {
      pending: true,
      requestUpdate() {},
      compareDocumentPosition(other) {
        return other === first ? DOCUMENT_POSITION_PRECEDING : 0;
      },
    };

    list.registerBoundary(first);
    list.registerBoundary(second);

    assert.strictEqual(list.getContentDisposition(first), "fallback");
  });

  it('keeps later resolved boundaries on fallback while revealOrder is "forwards" and an earlier boundary is pending', () => {
    const list = new SuspenseListElement();
    list.revealOrder = "forwards";

    const first = {
      pending: true,
      resolved: false,
      showing: "fallback",
      requestUpdate() {},
      compareDocumentPosition(other) {
        return other === second ? DOCUMENT_POSITION_FOLLOWING : 0;
      },
    };
    const second = {
      pending: false,
      resolved: true,
      showing: "content",
      requestUpdate() {},
      compareDocumentPosition(other) {
        return other === first ? DOCUMENT_POSITION_PRECEDING : 0;
      },
    };

    list.registerBoundary(first);
    list.registerBoundary(second);

    assert.strictEqual(list.getContentDisposition(first), "content");
    assert.strictEqual(list.getContentDisposition(second), "fallback");
  });

  it('keeps earlier resolved boundaries on fallback while revealOrder is "backwards" and a later boundary is pending', () => {
    const list = new SuspenseListElement();
    list.revealOrder = "backwards";

    const first = {
      pending: false,
      resolved: true,
      showing: "content",
      requestUpdate() {},
      compareDocumentPosition(other) {
        return other === second ? DOCUMENT_POSITION_FOLLOWING : 0;
      },
    };
    const second = {
      pending: true,
      resolved: false,
      showing: "fallback",
      requestUpdate() {},
      compareDocumentPosition(other) {
        return other === first ? DOCUMENT_POSITION_PRECEDING : 0;
      },
    };

    list.registerBoundary(first);
    list.registerBoundary(second);

    assert.strictEqual(list.getContentDisposition(first), "fallback");
    assert.strictEqual(list.getContentDisposition(second), "content");
  });

  it('keeps previous content for suppressed pending boundaries when tail is collapsed', () => {
    const list = {
      registerBoundary() {},
      unregisterBoundary() {},
      notifyBoundaryPending() {},
      notifyBoundaryResolved() {},
      notifyBoundaryErrored() {},
      getFallbackDisposition() {
        return "collapsed";
      },
    };

    const boundary = new TestSuspenseBoundaryElement();
    boundary._suspenseList = list;
    boundary.resolved = true;
    boundary._lastContent = "ready";
    boundary.contentRenderer = () => {
      throw Promise.resolve();
    };
    boundary.fallbackRenderer = () => "loading";

    const rendered = boundary.render();

    assert.strictEqual(boundary.showing, "content");
    assert.strictEqual(boundary.phase, "content");
    assert.notStrictEqual(rendered, nothing);
  });

  it('hides suppressed pending boundaries when tail is hidden', () => {
    const list = {
      registerBoundary() {},
      unregisterBoundary() {},
      notifyBoundaryPending() {},
      notifyBoundaryResolved() {},
      notifyBoundaryErrored() {},
      getFallbackDisposition() {
        return "hidden";
      },
    };

    const boundary = new TestSuspenseBoundaryElement();
    boundary._suspenseList = list;
    boundary.resolved = true;
    boundary._lastContent = "ready";
    boundary.contentRenderer = () => {
      throw Promise.resolve();
    };
    boundary.fallbackRenderer = () => "loading";

    const rendered = boundary.render();

    assert.strictEqual(boundary.showing, "hidden");
    assert.strictEqual(boundary.phase, "hidden");
    assert.strictEqual(rendered, nothing);
  });

  it('renders fallback instead of content when revealOrder "together" is blocked by another pending boundary', () => {
    const list = new SuspenseListElement();
    list.revealOrder = "together";

    const sibling = {
      pending: true,
      requestUpdate() {},
      compareDocumentPosition(other) {
        return other === boundary ? DOCUMENT_POSITION_PRECEDING : 0;
      },
    };

    const boundary = new TestSuspenseBoundaryElement();
    boundary.compareDocumentPosition = (other) => {
      return other === sibling ? DOCUMENT_POSITION_FOLLOWING : 0;
    };
    boundary._suspenseList = list;
    boundary.contentRenderer = () => "ready";
    boundary.fallbackRenderer = () => "loading";

    list.registerBoundary(boundary);
    list.registerBoundary(sibling);

    const rendered = boundary.render();

    assert.strictEqual(boundary.pending, false);
    assert.strictEqual(boundary.resolved, true);
    assert.strictEqual(boundary.showing, "fallback");
    assert.strictEqual(boundary.phase, "blocked");
    assert.notStrictEqual(rendered, nothing);
  });

  it('renders fallback instead of content for later boundaries blocked by "forwards" reveal order', () => {
    const list = new SuspenseListElement();
    list.revealOrder = "forwards";

    const sibling = {
      pending: true,
      resolved: false,
      showing: "fallback",
      requestUpdate() {},
      compareDocumentPosition(other) {
        return other === boundary ? DOCUMENT_POSITION_FOLLOWING : 0;
      },
    };

    const boundary = new TestSuspenseBoundaryElement();
    boundary.compareDocumentPosition = (other) => {
      return other === sibling ? DOCUMENT_POSITION_PRECEDING : 0;
    };
    boundary._suspenseList = list;
    boundary.contentRenderer = () => "ready";
    boundary.fallbackRenderer = () => "loading";

    list.registerBoundary(sibling);
    list.registerBoundary(boundary);

    const rendered = boundary.render();

    assert.strictEqual(boundary.showing, "fallback");
    assert.strictEqual(boundary.phase, "blocked");
    assert.notStrictEqual(rendered, nothing);
  });

  it("registers and unregisters boundaries with the nearest suspense list", () => {
    const list = new SuspenseListElement();
    const registered = [];
    const unregistered = [];

    list.registerBoundary = (boundary) => {
      registered.push(boundary);
    };
    list.unregisterBoundary = (boundary) => {
      unregistered.push(boundary);
    };

    const boundary = new TestSuspenseBoundaryElement();
    boundary.closest = (selector) => {
      assert.strictEqual(selector, "suspense-list");
      return list;
    };

    boundary.connectedCallback();
    assert.strictEqual(registered[0], boundary);

    boundary.disconnectedCallback();
    assert.strictEqual(unregistered[0], boundary);
  });

  it("retries suspense-list attachment when the nearest list upgrades after the boundary connects", async () => {
    const registered = [];
    const listPlaceholder = {};
    const upgradedList = {
      registerBoundary(boundary) {
        registered.push(boundary);
      },
    };

    const boundary = new TestSuspenseBoundaryElement();
    let upgraded = false;
    boundary.closest = () => (upgraded ? upgradedList : listPlaceholder);

    boundary.connectedCallback();
    assert.strictEqual(registered.length, 0);

    upgraded = true;
    await Promise.resolve();

    assert.strictEqual(registered[0], boundary);
  });

  it("requests a new render when a pending boundary promise resolves", async () => {
    const deferred = createDeferred();
    const boundary = new TestSuspenseBoundaryElement();
    let updates = 0;

    boundary.requestUpdate = () => {
      updates += 1;
    };
    boundary.contentRenderer = () => {
      throw deferred.promise;
    };
    boundary.fallbackRenderer = () => "loading";

    boundary.render();
    assert.strictEqual(boundary.pending, true);
    assert.strictEqual(boundary.phase, "pending");

    deferred.resolve();
    await deferred.promise;
    await Promise.resolve();

    assert.strictEqual(boundary.pending, false);
    assert.ok(updates >= 1);
  });

  it("starts fresh when a new suspense boundary instance replaces the previous one", () => {
    const previous = new TestSuspenseBoundaryElement();
    previous.pending = true;
    previous.resolved = true;
    previous.showing = "fallback";
    previous.phase = "pending";
    previous._lastContent = "ready";
    previous._lastFallback = "loading";
    previous._lastListSnapshot = "false:true:fallback";

    const next = new TestSuspenseBoundaryElement();

    assert.strictEqual(next.pending, false);
    assert.strictEqual(next.resolved, false);
    assert.strictEqual(next.showing, "content");
    assert.strictEqual(next.phase, "content");
    assert.strictEqual(next._lastContent, nothing);
    assert.strictEqual(next._lastFallback, nothing);
    assert.strictEqual(next._lastListSnapshot, "");
  });

  it("refreshes blocked siblings after a boundary actually renders resolved content", async () => {
    const list = new SuspenseListElement();
    list.revealOrder = "forwards";

    const firstDeferred = createDeferred();
    let firstShouldSuspend = true;
    const first = new TestSuspenseBoundaryElement();
    first.compareDocumentPosition = (other) => {
      return other === second ? DOCUMENT_POSITION_FOLLOWING : 0;
    };
    first.contentRenderer = () => {
      if (firstShouldSuspend) {
        throw firstDeferred.promise;
      }
      return "first-ready";
    };
    first.fallbackRenderer = () => "first-loading";

    const second = new TestSuspenseBoundaryElement();
    second.compareDocumentPosition = (other) => {
      return other === first ? DOCUMENT_POSITION_PRECEDING : 0;
    };
    second.contentRenderer = () => "second-ready";
    second.fallbackRenderer = () => "second-loading";

    first._suspenseList = list;
    second._suspenseList = list;
    list.registerBoundary(first);
    list.registerBoundary(second);

    first.render();
    const blocked = second.render();
    assert.strictEqual(second.showing, "fallback");
    assert.strictEqual(second.phase, "blocked");
    assert.match(templateSource(blocked), /part=\"fallback\"/);

    firstShouldSuspend = false;
    firstDeferred.resolve();
    await firstDeferred.promise;
    await Promise.resolve();

    first.render();
    const unblocked = second.render();
    assert.strictEqual(second.showing, "content");
    assert.ok(
      templateSource(unblocked).includes('part="content"') ||
      templateSource(unblocked).includes('data-showing="content"')
    );
  });

  it("replays a forwards suspense list after recreating the boundaries", async () => {
    const list = new SuspenseListElement();
    list.revealOrder = "forwards";
    list.tail = "collapsed";

    let alphaDeferred = createDeferred();
    let betaDeferred = createDeferred();
    let alphaResolved = false;
    let betaResolved = false;
    const createPair = () => {
      const alpha = new TestSuspenseBoundaryElement();
      const beta = new TestSuspenseBoundaryElement();

      alpha.compareDocumentPosition = (other) => {
        return other === beta ? DOCUMENT_POSITION_FOLLOWING : 0;
      };
      beta.compareDocumentPosition = (other) => {
        return other === alpha ? DOCUMENT_POSITION_PRECEDING : 0;
      };

      alpha._suspenseList = list;
      beta._suspenseList = list;
      alpha.fallbackRenderer = () => "alpha-loading";
      beta.fallbackRenderer = () => "beta-loading";
      alpha.contentRenderer = () => {
        if (!alphaResolved) {
          throw alphaDeferred.promise;
        }
        return "alpha-ready";
      };
      beta.contentRenderer = () => {
        if (!betaResolved) {
          throw betaDeferred.promise;
        }
        return "beta-ready";
      };

      list.registerBoundary(alpha);
      list.registerBoundary(beta);
      return { alpha, beta };
    };

    let { alpha, beta } = createPair();

    alpha.render();
    beta.render();
    assert.strictEqual(alpha.showing, "fallback");
    assert.strictEqual(beta.showing, "hidden");

    alphaResolved = true;
    alphaDeferred.resolve();
    await alphaDeferred.promise;
    await Promise.resolve();
    alpha.render();
    beta.render();
    assert.strictEqual(alpha.showing, "content");
    assert.strictEqual(beta.showing, "fallback");

    betaResolved = true;
    betaDeferred.resolve();
    await betaDeferred.promise;
    await Promise.resolve();
    beta.render();
    assert.strictEqual(beta.showing, "content");

    list.unregisterBoundary(alpha);
    list.unregisterBoundary(beta);
    alpha.disconnectedCallback();
    beta.disconnectedCallback();

    alphaDeferred = createDeferred();
    betaDeferred = createDeferred();
    alphaResolved = false;
    betaResolved = false;
    ({ alpha, beta } = createPair());

    alpha.render();
    beta.render();
    assert.strictEqual(alpha.showing, "fallback");
    assert.strictEqual(beta.showing, "hidden");

    alphaResolved = true;
    alphaDeferred.resolve();
    await alphaDeferred.promise;
    await Promise.resolve();
    alpha.render();
    beta.render();
    assert.strictEqual(alpha.showing, "content");
    assert.strictEqual(beta.showing, "fallback");

    betaResolved = true;
    betaDeferred.resolve();
    await betaDeferred.promise;
    await Promise.resolve();
    beta.render();
    assert.strictEqual(beta.showing, "content");
  });

  it("normalizes unsupported suspense-list configuration values", () => {
    const list = new SuspenseListElement();
    let refreshes = 0;

    list.requestBoundaryRefresh = () => {
      refreshes += 1;
    };

    list.revealOrder = "SIDEWAYS";
    list.tail = "VISIBLE";
    list.update(new Map());

    assert.strictEqual(list.revealOrder, "together");
    assert.strictEqual(list.tail, "collapsed");
    assert.strictEqual(list.getAttribute("reveal-order"), "together");
    assert.strictEqual(list.getAttribute("tail"), "collapsed");
    assert.strictEqual(refreshes, 0);
  });

  it("enters a revealing phase before settling on content", async () => {
    const boundary = new TestSuspenseBoundaryElement();
    const deferred = createDeferred();
    let shouldSuspend = true;

    boundary.contentRenderer = () => {
      if (shouldSuspend) {
        throw deferred.promise;
      }
      return "ready";
    };
    boundary.fallbackRenderer = () => "loading";

    boundary.render();
    assert.strictEqual(boundary.phase, "pending");

    shouldSuspend = false;
    deferred.resolve();
    await deferred.promise;
    await Promise.resolve();

    const revealing = boundary.render();
    assert.strictEqual(boundary.phase, "revealing");
    assert.match(templateSource(revealing), /part=\"fallback\"/);
    assert.match(templateSource(revealing), /part=\"content\"/);

    await Promise.resolve();

    const finalContent = boundary.render();
    assert.strictEqual(boundary.phase, "content");
    assert.strictEqual(boundary.showing, "content");
    assert.doesNotMatch(templateSource(finalContent), /data-phase=\"revealing\"/);
  });

  it("waits for animation or transition completion when reveal motion is active", async () => {
    const boundary = new MotionSuspenseBoundaryElement();
    const deferred = createDeferred();
    let shouldSuspend = true;

    boundary.contentRenderer = () => {
      if (shouldSuspend) {
        throw deferred.promise;
      }
      return "ready";
    };
    boundary.fallbackRenderer = () => "loading";

    boundary.render();
    shouldSuspend = false;
    deferred.resolve();
    await deferred.promise;
    await Promise.resolve();

    boundary.render();
    assert.strictEqual(boundary.phase, "revealing");

    await Promise.resolve();
    assert.strictEqual(boundary.phase, "revealing");

    boundary.handleEvent({ type: "transitionend" });
    assert.strictEqual(boundary.phase, "content");
  });

  it("schedules async errors for non-thenable throws and renders nothing", () => {
    const queued = [];
    globalThis.queueMicrotask = (callback) => {
      queued.push(callback);
    };

    const boundary = new TestSuspenseBoundaryElement();
    const error = new Error("boom");
    boundary.contentRenderer = () => {
      throw error;
    };

    const rendered = boundary.render();

    assert.strictEqual(rendered, nothing);
    assert.strictEqual(queued.length, 1);
    assert.throws(() => queued[0](), /boom/);
  });

  it("reports rejected pending promises through the suspense list and async error channel", async () => {
    const deferred = createDeferred();
    const queued = [];
    let errored = 0;
    globalThis.queueMicrotask = (callback) => {
      queued.push(callback);
    };

    const boundary = new TestSuspenseBoundaryElement();
    boundary._suspenseList = {
      getFallbackDisposition() {
        return "show";
      },
      notifyBoundaryPending() {},
      notifyBoundaryResolved() {},
      notifyBoundaryErrored() {
        errored += 1;
      },
    };
    boundary.contentRenderer = () => {
      throw deferred.promise;
    };
    boundary.fallbackRenderer = () => "loading";

    boundary.render();
    deferred.reject(new Error("nope"));
    await deferred.promise.catch(() => {});
    await Promise.resolve();

    assert.strictEqual(boundary.pending, false);
    assert.strictEqual(errored, 1);
    assert.strictEqual(queued.length, 1);
    assert.throws(() => queued[0](), /nope/);
  });

  it("deduplicates identical pending promises", () => {
    const boundary = new TestSuspenseBoundaryElement();
    const promise = Promise.resolve();
    let updates = 0;
    boundary.requestUpdate = () => {
      updates += 1;
    };

    boundary.attachPendingPromise(promise);
    boundary.attachPendingPromise(promise);

    assert.strictEqual(boundary._pendingPromise, promise);
    assert.strictEqual(updates, 0);
  });

  it("ignores stale promise resolutions after a newer suspension replaces them", async () => {
    const first = createDeferred();
    const second = createDeferred();
    const boundary = new TestSuspenseBoundaryElement();
    let updates = 0;
    boundary.requestUpdate = () => {
      updates += 1;
    };

    boundary.attachPendingPromise(first.promise);
    boundary.attachPendingPromise(second.promise);

    first.resolve();
    await first.promise;
    await Promise.resolve();

    assert.strictEqual(boundary._pendingPromise, second.promise);
    assert.strictEqual(updates, 0);

    second.resolve();
    await second.promise;
    await Promise.resolve();

    assert.strictEqual(boundary._pendingPromise, null);
    assert.strictEqual(updates, 1);
  });

  it("completes reveal only for matching tokens and ignores unrelated events", () => {
    const boundary = new MotionSuspenseBoundaryElement();
    boundary._isRevealing = true;
    boundary._revealToken = 4;
    boundary._revealTimeout = 123;
    const cleared = [];
    const originalClearTimeout = globalThis.clearTimeout;
    globalThis.clearTimeout = (value) => {
      cleared.push(value);
    };

    try {
      boundary.handleEvent({ type: "click" });
      assert.strictEqual(boundary.phase, "content");
      assert.strictEqual(boundary._isRevealing, true);

      boundary.completeReveal(2);
      assert.strictEqual(boundary._isRevealing, true);

      boundary.handleEvent({ type: "animationend" });
      assert.strictEqual(boundary._isRevealing, false);
      assert.strictEqual(boundary._revealTimeout, null);
      assert.deepStrictEqual(cleared, [123]);
    } finally {
      globalThis.clearTimeout = originalClearTimeout;
    }
  });

  it("computes reveal motion timings from animation and transition lists", () => {
    const boundary = new TestSuspenseBoundaryElement();
    globalThis.getComputedStyle = () => ({
      animationDuration: "120ms, 0.2s",
      animationDelay: "30ms",
      transitionDuration: "0.1s",
      transitionDelay: "25ms, invalid",
    });

    assert.strictEqual(boundary.getMaxAnimationTime(globalThis.getComputedStyle()), 230);
    assert.strictEqual(boundary.getMaxTransitionTime(globalThis.getComputedStyle()), 125);
    assert.strictEqual(boundary.getRevealMotionTimeout(), 280);
    assert.strictEqual(boundary.hasActiveRevealMotion(), true);
    assert.deepStrictEqual(boundary.parseTimeList(""), [0]);
    assert.deepStrictEqual(boundary.parseTimeList("bad, 0.5s, 12ms"), [0, 500, 12]);
  });

  it("falls back to default reveal timing when computed styles are unavailable", () => {
    globalThis.getComputedStyle = undefined;
    const boundary = new TestSuspenseBoundaryElement();

    assert.strictEqual(boundary.hasActiveRevealMotion(), false);
    assert.strictEqual(boundary.getRevealMotionTimeout(), 32);
  });

  it("avoids duplicate suspense-list notifications for the same state snapshot", () => {
    const notifications = [];
    const boundary = new TestSuspenseBoundaryElement();
    boundary._suspenseList = {
      notifyBoundaryPending(target) {
        notifications.push(["pending", target]);
      },
      notifyBoundaryResolved(target) {
        notifications.push(["resolved", target]);
      },
      notifyBoundaryErrored(target) {
        notifications.push(["errored", target]);
      },
    };

    boundary.pending = true;
    boundary.notifyListState();
    boundary.notifyListState();
    boundary.pending = false;
    boundary.resolved = true;
    boundary.showing = "content";
    boundary.notifyListState();
    boundary.notifyListErrored();
    boundary.notifyListErrored();

    assert.deepStrictEqual(
      notifications.map(([type]) => type),
      ["pending", "resolved", "errored"]
    );
  });

  it("gracefully ignores missing or invalid suspense lists during attachment and detachment", () => {
    const boundary = new TestSuspenseBoundaryElement();

    boundary.attachToSuspenseList();
    assert.strictEqual(boundary._suspenseList, null);

    boundary.closest = () => ({});
    boundary.attachToSuspenseList();
    assert.strictEqual(boundary._suspenseList, null);

    boundary._suspenseList = {};
    boundary.detachFromSuspenseList();
    assert.strictEqual(boundary._suspenseList, null);
  });
});
