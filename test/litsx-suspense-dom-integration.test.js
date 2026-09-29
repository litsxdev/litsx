// @vitest-environment happy-dom

import assert from "assert";
import { LitElement, html, render } from "lit";
import { afterEach, describe, it } from "vitest";
import {
  SuspenseBoundary,
  SuspenseList,
  renderWithHooks,
  useCallbackRef as runtimeUseCallbackRef,
  useOnConnect as runtimeUseOnConnect,
  useRef as runtimeUseRef,
  useState as runtimeUseState,
} from "../packages/core/src/index.js";
import {
  prepareEffects,
  runWithHookHost,
} from "../packages/core/src/runtime-controller.js";

const withTestHost = (hook) => (host, ...args) =>
  runWithHookHost(host, () => hook(...args));
const useCallbackRef = withTestHost(runtimeUseCallbackRef);
const useOnConnect = withTestHost(runtimeUseOnConnect);
const useRef = withTestHost(runtimeUseRef);
const useState = withTestHost(runtimeUseState);

let tagCounter = 0;

function nextTag(prefix = "litsx-suspense-dom") {
  tagCounter += 1;
  return `${prefix}-${tagCounter}`;
}

function defineTestElement(tagName, ctor) {
  if (!customElements.get(tagName)) {
    customElements.define(tagName, ctor);
  }
  return document.createElement(tagName);
}

function createDeferred() {
  let resolve = null;
  const promise = new Promise((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}

function getRegionMount(regionHost) {
  const firstChild = regionHost?.firstElementChild ?? null;
  if (firstChild?.localName === "div" && firstChild.style?.display === "contents") {
    return firstChild;
  }
  return null;
}

function getRegionRoot(boundary, region) {
  const regionHost = boundary?.querySelector?.(
    `[data-litsx-suspense-region="${region}"]`,
  ) ?? null;
  const mount = getRegionMount(regionHost);
  return mount?.shadowRoot ?? regionHost ?? null;
}

function getPendingSteps(pendingStepsRef) {
  pendingStepsRef.value ??= new Map();
  return pendingStepsRef.value;
}

function suspendUntil(pendingStepsRef, stepIndex, revealedCount) {
  if (revealedCount > stepIndex) {
    return;
  }

  const pendingSteps = getPendingSteps(pendingStepsRef);
  let pending = pendingSteps.get(stepIndex);
  if (!pending) {
    pending = createDeferred();
    pendingSteps.set(stepIndex, pending);
  }

  throw pending.promise;
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("litsx suspense DOM integration", () => {
  it("commits revealOrder through the SuspenseList property binding", async () => {
    const listTag = "litsx-suspense-list-property-binding";
    class TestList extends SuspenseList {}

    if (!customElements.get(listTag)) {
      customElements.define(listTag, TestList);
    }

    const container = document.createElement("div");
    document.body.appendChild(container);
    const renderList = (revealOrder, tail) => render(html`
      <litsx-suspense-list-property-binding
        .revealOrder=${revealOrder}
        tail=${tail}
      ></litsx-suspense-list-property-binding>
    `, container);
    renderList("forwards", "hidden");

    const list = container.querySelector(listTag);
    await list.updateComplete;
    assert.strictEqual(list.revealOrder, "forwards");
    assert.strictEqual(list.tail, "hidden");

    renderList("backwards", "collapsed");
    await list.updateComplete;
    assert.strictEqual(list.revealOrder, "backwards");
    assert.strictEqual(list.tail, "collapsed");
  });

  it("restores callback and object refs after a cold soft suspension", async () => {
    const callbackTag = nextTag("litsx-suspended-callback-ref");
    const objectTag = nextTag("litsx-suspended-object-ref");

    async function verifyRefLifecycle(
      tagName,
      createRefChannel,
      readRef,
      createCallback = (channel) => channel,
    ) {
      const pending = createDeferred();
      let ready = false;

      class SuspendedForm extends LitElement {
        constructor() {
          super();
          this.refChannel = createRefChannel();
          this.refCallback = createCallback(this.refChannel);
        }

        render() {
          return renderWithHooks(this, () => {
            prepareEffects(this);
            useCallbackRef(
              this,
              () => this.renderRoot?.querySelector('[data-ref="form"]') ?? null,
              this.refCallback,
              [this.refChannel],
            );
            if (!ready) throw pending.promise;
            return html`<form data-ref="form"></form>`;
          });
        }
      }

      const host = defineTestElement(tagName, SuspendedForm);
      document.body.appendChild(host);
      await host.updateComplete;
      assert.strictEqual(readRef(host.refChannel), null);

      ready = true;
      pending.resolve();
      await pending.promise;
      await Promise.resolve();
      await host.updateComplete;

      const form = host.shadowRoot.querySelector("form");
      assert.ok(form);
      assert.strictEqual(readRef(host.refChannel), form);
    }

    await verifyRefLifecycle(
      callbackTag,
      () => {
        const channel = (value) => {
          channel.current = value;
        };
        channel.current = null;
        return channel;
      },
      (channel) => channel.current,
    );
    await verifyRefLifecycle(
      objectTag,
      () => ({ current: null }),
      (channel) => channel.current,
      (channel) => (value) => {
        channel.current = value;
      },
    );
  });

  it("reconciles refs across repeated suspension, conditional targets, and disconnect", async () => {
    const tagName = nextTag("litsx-repeated-suspended-ref");
    const calls = [];
    const ref = (value) => calls.push(value);

    class SuspendedForm extends LitElement {
      constructor() {
        super();
        this.pending = null;
        this.visible = true;
      }

      render() {
        return renderWithHooks(this, () => {
          prepareEffects(this);
          useCallbackRef(
            this,
            () => this.renderRoot?.querySelector('[data-ref="form"]') ?? null,
            ref,
            [ref],
          );
          if (this.pending) throw this.pending.promise;
          return this.visible ? html`<form data-ref="form"></form>` : null;
        });
      }
    }

    const host = defineTestElement(tagName, SuspendedForm);
    document.body.appendChild(host);
    await host.updateComplete;
    const firstForm = host.shadowRoot.querySelector("form");
    assert.strictEqual(calls.at(-1), firstForm);

    for (let pass = 0; pass < 2; pass += 1) {
      const pending = createDeferred();
      host.pending = pending;
      host.requestUpdate();
      await host.updateComplete;
      assert.strictEqual(calls.at(-1), undefined);

      host.pending = null;
      pending.resolve();
      await pending.promise;
      await Promise.resolve();
      await host.updateComplete;
      assert.strictEqual(calls.at(-1), host.shadowRoot.querySelector("form"));
    }

    host.visible = false;
    host.requestUpdate();
    await host.updateComplete;
    assert.strictEqual(calls.at(-1), undefined);

    host.visible = true;
    host.requestUpdate();
    await host.updateComplete;
    assert.strictEqual(calls.at(-1), host.shadowRoot.querySelector("form"));

    const callCountBeforeDisconnect = calls.length;
    host.remove();
    assert.strictEqual(calls.length, callCountBeforeDisconnect + 1);
    assert.strictEqual(calls.at(-1), undefined);
  });

  it("restores descendant refs through nested explicit suspense boundaries", async () => {
    const outerBoundaryTag = "litsx-suspense-descendant-outer-boundary-integration";
    const innerBoundaryTag = "litsx-suspense-descendant-inner-boundary-integration";
    const hostTag = "litsx-suspense-descendant-host-integration";
    const childTag = "litsx-suspense-descendant-child-integration";
    const pending = createDeferred();
    const refCalls = [];
    let resolved = false;

    class TestBoundary extends SuspenseBoundary {}

    class AsyncChild extends LitElement {
      render() {
        return renderWithHooks(this, () => {
          prepareEffects(this);
          useCallbackRef(
            this,
            () => this.renderRoot?.querySelector("[data-ready]") ?? null,
            (value) => refCalls.push(value),
            [],
          );
          if (!resolved) {
            throw pending.promise;
          }
          return html`<span data-ready>ready</span>`;
        });
      }
    }

    class TestHost extends LitElement {
      render() {
        return html`
          <litsx-suspense-descendant-outer-boundary-integration
            .fallback=${() => html`<span data-outer-fallback>outer loading</span>`}
            .content=${() => html`
              <litsx-suspense-descendant-inner-boundary-integration
                .fallback=${() => html`<span data-fallback>loading</span>`}
                .content=${() => html`
                  <litsx-suspense-descendant-child-integration>
                  </litsx-suspense-descendant-child-integration>
                `}
              ></litsx-suspense-descendant-inner-boundary-integration>
            `}
          ></litsx-suspense-descendant-outer-boundary-integration>
        `;
      }
    }

    defineTestElement(outerBoundaryTag, TestBoundary);
    defineTestElement(innerBoundaryTag, class extends TestBoundary {});
    defineTestElement(childTag, AsyncChild);
    defineTestElement(hostTag, TestHost);

    const host = document.createElement(hostTag);
    document.body.appendChild(host);
    await host.updateComplete;
    const outerBoundary = host.shadowRoot.querySelector(outerBoundaryTag);
    await outerBoundary.updateComplete;
    await Promise.resolve();
    await outerBoundary.updateComplete;
    const innerBoundary = getRegionRoot(outerBoundary, "content")
      ?.querySelector?.(innerBoundaryTag) ?? null;
    assert.ok(innerBoundary);
    await innerBoundary.updateComplete;
    await Promise.resolve();
    await innerBoundary.updateComplete;

    assert.strictEqual(outerBoundary.pending, false);
    assert.strictEqual(innerBoundary.pending, true);
    assert.match(getRegionRoot(innerBoundary, "fallback")?.innerHTML ?? "", /data-fallback/);
    assert.deepStrictEqual(refCalls, []);

    resolved = true;
    pending.resolve();
    await pending.promise;
    await innerBoundary.updateComplete;
    const child = getRegionRoot(innerBoundary, "content")?.querySelector?.(childTag) ?? null;
    await child.updateComplete;
    await innerBoundary.updateComplete;

    const readyNode = child.shadowRoot.querySelector("[data-ready]");
    assert.strictEqual(innerBoundary.pending, false);
    assert.ok(readyNode);
    assert.strictEqual(refCalls.at(-1), readyNode);
  });

  it("replays suspense content when a new host instance mounts after the previous one disconnected", async () => {
    const boundaryTag = "litsx-suspense-boundary-integration";
    const listTag = "litsx-suspense-list-integration";
    const hostTag = "litsx-suspense-host-integration";

    class TestBoundary extends SuspenseBoundary {}
    class TestList extends SuspenseList {}

    class TestHost extends LitElement {
      render() {
        prepareEffects(this);
        const pendingStepsRef = useRef(this, null);
        const [revealedCount, setRevealedCount] = useState(this, 0);
        const pendingSteps = getPendingSteps(pendingStepsRef);

        if (revealedCount > 0) {
          for (const [stepIndex, deferred] of pendingSteps) {
            if (stepIndex < revealedCount) {
              pendingSteps.delete(stepIndex);
              deferred.resolve?.();
            }
          }
        }

        useOnConnect(this, () => {
          for (const deferred of getPendingSteps(pendingStepsRef).values()) {
            deferred.resolve?.();
          }
          pendingStepsRef.value = new Map();
          setRevealedCount(0);

          const firstTimeoutId = setTimeout(() => {
            setRevealedCount((count) => count + 1);
            const secondTimeoutId = setTimeout(() => {
              setRevealedCount((count) => count + 1);
            }, 0);
            this.__secondTimeoutId = secondTimeoutId;
          }, 0);

          this.__firstTimeoutId = firstTimeoutId;

          return () => {
            clearTimeout(this.__firstTimeoutId);
            clearTimeout(this.__secondTimeoutId);
            for (const deferred of getPendingSteps(pendingStepsRef).values()) {
              deferred.resolve?.();
            }
            pendingStepsRef.value = new Map();
          };
        }, []);

        return html`
          <litsx-suspense-list-integration reveal-order="forwards" tail="hidden">
            <litsx-suspense-boundary-integration
              .fallback=${() => null}
              .content=${() => {
                suspendUntil(pendingStepsRef, 0, revealedCount);
                return html`<div data-step="0">alpha</div>`;
              }}
            ></litsx-suspense-boundary-integration>
            <litsx-suspense-boundary-integration
              .fallback=${() => null}
              .content=${() => {
                suspendUntil(pendingStepsRef, 1, revealedCount);
                return html`<div data-step="1">beta</div>`;
              }}
            ></litsx-suspense-boundary-integration>
          </litsx-suspense-list-integration>
        `;
      }
    }

    defineTestElement(boundaryTag, TestBoundary);
    defineTestElement(listTag, TestList);
    defineTestElement(hostTag, TestHost);

    const first = document.createElement(hostTag);
    document.body.appendChild(first);
    await first.updateComplete;
    await new Promise((resolve) => setTimeout(resolve, 0));
    await first.updateComplete;
    await new Promise((resolve) => setTimeout(resolve, 0));
    await first.updateComplete;

    const firstBoundaries = first.shadowRoot.querySelectorAll(boundaryTag);
    assert.match(getRegionRoot(firstBoundaries[0], "content")?.innerHTML ?? "", /data-step="0"/);
    assert.match(getRegionRoot(firstBoundaries[1], "content")?.innerHTML ?? "", /data-step="1"/);

    first.remove();

    const second = document.createElement(hostTag);
    document.body.appendChild(second);
    await second.updateComplete;
    await new Promise((resolve) => setTimeout(resolve, 0));
    await second.updateComplete;
    await new Promise((resolve) => setTimeout(resolve, 0));
    await second.updateComplete;

    const secondBoundaries = second.shadowRoot.querySelectorAll(boundaryTag);
    assert.match(getRegionRoot(secondBoundaries[0], "content")?.innerHTML ?? "", /data-step="0"/);
    assert.match(getRegionRoot(secondBoundaries[1], "content")?.innerHTML ?? "", /data-step="1"/);
  });

  it("reveals projected renderer-prop content after hidden suspense boundaries resolve", async () => {
    const boundaryTag = "litsx-suspense-renderer-boundary";
    const listTag = "litsx-suspense-renderer-list";
    const cardTag = "litsx-suspense-renderer-card";
    const hostTag = "litsx-suspense-renderer-host";

    class TestBoundary extends SuspenseBoundary {}
    class TestList extends SuspenseList {}

    class GuideCard extends LitElement {
      static properties = {
        eyebrow: { type: String },
        titleRenderer: { attribute: false },
        contentRenderer: { attribute: false },
      };

      constructor() {
        super();
        this.eyebrow = "";
        this.titleRenderer = () => null;
        this.contentRenderer = () => null;
      }

      render() {
        return html`
          <article class="guide-card">
            <p>${this.eyebrow}</p>
            <h2>${this.titleRenderer()}</h2>
            ${this.contentRenderer()}
          </article>
        `;
      }
    }

    class TestHost extends LitElement {
      render() {
        prepareEffects(this);
        const pendingStepsRef = useRef(this, null);
        const [revealedCount, setRevealedCount] = useState(this, 0);
        const pendingSteps = getPendingSteps(pendingStepsRef);

        if (revealedCount > 0) {
          for (const [stepIndex, deferred] of pendingSteps) {
            if (stepIndex < revealedCount) {
              pendingSteps.delete(stepIndex);
              deferred.resolve?.();
            }
          }
        }

        useOnConnect(this, () => {
          for (const deferred of getPendingSteps(pendingStepsRef).values()) {
            deferred.resolve?.();
          }
          pendingStepsRef.current = new Map();
          setRevealedCount(0);

          const firstTimeoutId = setTimeout(() => {
            setRevealedCount((count) => count + 1);
            const secondTimeoutId = setTimeout(() => {
              setRevealedCount((count) => count + 1);
            }, 0);
            this.__secondTimeoutId = secondTimeoutId;
          }, 0);

          this.__firstTimeoutId = firstTimeoutId;

          return () => {
            clearTimeout(this.__firstTimeoutId);
            clearTimeout(this.__secondTimeoutId);
            for (const deferred of getPendingSteps(pendingStepsRef).values()) {
              deferred.resolve?.();
            }
            pendingStepsRef.current = new Map();
          };
        }, []);

        return html`
          <litsx-suspense-renderer-list reveal-order="forwards" tail="hidden">
            <litsx-suspense-renderer-boundary
              .fallback=${() => null}
              .content=${() => {
                suspendUntil(pendingStepsRef, 0, revealedCount);
                return html`
                  <litsx-suspense-renderer-card
                    .eyebrow=${"One"}
                    .titleRenderer=${() => html`<><code>alpha</code></>`}
                    .contentRenderer=${() => html`<p>first body</p>`}
                  ></litsx-suspense-renderer-card>
                `;
              }}
            ></litsx-suspense-renderer-boundary>
            <litsx-suspense-renderer-boundary
              .fallback=${() => null}
              .content=${() => {
                suspendUntil(pendingStepsRef, 1, revealedCount);
                return html`
                  <litsx-suspense-renderer-card
                    .eyebrow=${"Two"}
                    .titleRenderer=${() => html`<><code>beta</code></>`}
                    .contentRenderer=${() => html`<p>second body</p>`}
                  ></litsx-suspense-renderer-card>
                `;
              }}
            ></litsx-suspense-renderer-boundary>
          </litsx-suspense-renderer-list>
        `;
      }
    }

    defineTestElement(boundaryTag, TestBoundary);
    defineTestElement(listTag, TestList);
    defineTestElement(cardTag, GuideCard);
    defineTestElement(hostTag, TestHost);

    const host = document.createElement(hostTag);
    document.body.appendChild(host);
    await host.updateComplete;
    await new Promise((resolve) => setTimeout(resolve, 0));
    await host.updateComplete;
    await new Promise((resolve) => setTimeout(resolve, 0));
    await host.updateComplete;

    const cards = [...host.shadowRoot.querySelectorAll(cardTag)];
    assert.strictEqual(cards.length, 2);
    assert.ok(cards[0].shadowRoot.innerHTML.includes("alpha"));
    assert.ok(cards[0].shadowRoot.innerHTML.includes("first body"));
    assert.ok(cards[1].shadowRoot.innerHTML.includes("beta"));
    assert.ok(cards[1].shadowRoot.innerHTML.includes("second body"));
  });
});
