// @vitest-environment happy-dom

import assert from "assert";
import { LitElement, html } from "lit";
import { afterEach, describe, it } from "vitest";
import {
  SuspenseBoundary,
  SuspenseList,
  prepareEffects,
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
              .fallbackRenderer=${() => null}
              .contentRenderer=${() => {
                suspendUntil(pendingStepsRef, 0, revealedCount);
                return html`<div data-step="0">alpha</div>`;
              }}
            ></litsx-suspense-boundary-integration>
            <litsx-suspense-boundary-integration
              .fallbackRenderer=${() => null}
              .contentRenderer=${() => {
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

    assert.match(first.shadowRoot.innerHTML, /data-step="0"/);
    assert.match(first.shadowRoot.innerHTML, /data-step="1"/);

    first.remove();

    const second = document.createElement(hostTag);
    document.body.appendChild(second);
    await second.updateComplete;
    await new Promise((resolve) => setTimeout(resolve, 0));
    await second.updateComplete;
    await new Promise((resolve) => setTimeout(resolve, 0));
    await second.updateComplete;

    assert.match(second.shadowRoot.innerHTML, /data-step="0"/);
    assert.match(second.shadowRoot.innerHTML, /data-step="1"/);
  });
});
