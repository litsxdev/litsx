// @vitest-environment happy-dom

import assert from "assert";
import { LitElement, html } from "lit";
import { afterEach, describe, it } from "vitest";
import {
  SuspenseBoundary,
  SuspenseList,
  prepareEffects,
  renderWithSoftSuspense,
  useOnConnect,
  useRef,
  useState,
} from "../packages/core/src/index.js";

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
  pendingStepsRef.current ??= new Map();
  return pendingStepsRef.current;
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
  it("captures soft suspension from descendant custom element updates inside a boundary", async () => {
    const boundaryTag = "litsx-suspense-descendant-boundary-integration";
    const hostTag = "litsx-suspense-descendant-host-integration";
    const childTag = "litsx-suspense-descendant-child-integration";
    const pending = createDeferred();
    let resolved = false;

    class TestBoundary extends SuspenseBoundary {}

    class AsyncChild extends LitElement {
      render() {
        return renderWithSoftSuspense(this, () => {
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
          <litsx-suspense-descendant-boundary-integration
            .fallback=${() => html`<span data-fallback>loading</span>`}
            .content=${() => html`
              <litsx-suspense-descendant-child-integration>
              </litsx-suspense-descendant-child-integration>
            `}
          ></litsx-suspense-descendant-boundary-integration>
        `;
      }
    }

    defineTestElement(boundaryTag, TestBoundary);
    defineTestElement(childTag, AsyncChild);
    defineTestElement(hostTag, TestHost);

    const host = document.createElement(hostTag);
    document.body.appendChild(host);
    await host.updateComplete;
    const boundary = host.shadowRoot.querySelector(boundaryTag);
    await boundary.updateComplete;
    await Promise.resolve();
    await boundary.updateComplete;

    assert.strictEqual(boundary.pending, true);
    assert.match(getRegionRoot(boundary, "fallback")?.innerHTML ?? "", /data-fallback/);

    resolved = true;
    pending.resolve();
    await pending.promise;
    await boundary.updateComplete;
    const child = getRegionRoot(boundary, "content")?.querySelector?.(childTag) ?? null;
    await child.updateComplete;
    await boundary.updateComplete;

    assert.strictEqual(boundary.pending, false);
    assert.match(child.shadowRoot.innerHTML, /data-ready/);
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
