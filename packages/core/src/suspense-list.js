import { ReactiveElement } from "lit";
const DOM_NODE = globalThis.Node ?? null;

function normalizeRevealOrder(value) {
  const normalized = typeof value === "string" ? value.toLowerCase() : "";
  if (
    normalized === "forwards" ||
    normalized === "backwards" ||
    normalized === "together"
  ) {
    return normalized;
  }
  return "together";
}

function normalizeTail(value) {
  const normalized = typeof value === "string" ? value.toLowerCase() : "";
  if (normalized === "collapsed" || normalized === "hidden") {
    return normalized;
  }
  return "collapsed";
}

function blocksReveal(boundary) {
  return (
    boundary != null &&
    (
      boundary.pending === true ||
      boundary.resolved !== true ||
      boundary.showing === "fallback" ||
      boundary.showing === "hidden"
    )
  );
}

/**
 * Coordinate reveal order across several sibling suspense boundaries.
 * SuspenseList controls when each boundary is allowed to reveal fallback or content.
 * Think of SuspenseList as the traffic controller for several sibling suspense regions.
 * @usage Wrap several SuspenseBoundary nodes when reveal order matters to the overall experience.
 * @usage Use revealOrder and tail to shape how pending sections appear while the list is still resolving.
 * @usage In custom-element markup, authored attributes should use kebab-case such as `reveal-order="forwards"` and `tail="collapsed"`.
 * @usage Use SuspenseList when several asynchronous sections belong to the same reading flow and should reveal in a predictable order.
 * @usage SuspenseList is a coordination primitive, not a visual wrapper. Use it to shape reveal timing without changing the authored styling model around the boundaries.
 * @behavior The list can delay fallback or content reveal so sibling boundaries appear in a stable order.
 * @behavior Reveal coordination happens in light DOM, so parent styles still flow naturally across the list.
 * @behavior `revealOrder="forwards"` favors top-to-bottom reveal, `revealOrder="backwards"` favors the opposite direction, and `revealOrder="together"` waits until every sibling is ready.
 * @behavior When authoring the custom element directly, use the reflected `reveal-order` attribute rather than camelCase HTML attributes.
 * @behavior `tail="collapsed"` keeps later pending regions out of the way without fully removing them, while `tail="hidden"` suppresses them until they can reveal.
 * @mentalModel SuspenseList does not fetch or render content by itself. It only decides when sibling boundaries are allowed to reveal fallback or content.
 * @pitfall Use SuspenseList for groups of boundaries that belong to the same reading or interaction flow. Unrelated sections usually read better when they reveal independently.
 * @pitfall Do not rely on SuspenseList for layout. Its job is reveal coordination, not visual composition.
 * @example
 * <SuspenseList revealOrder="forwards">
 *   <SuspenseBoundary fallback={<span>Loading first...</span>}>
 *     <FirstPanel />
 *   </SuspenseBoundary>
 *   <SuspenseBoundary fallback={<span>Loading second...</span>}>
 *     <SecondPanel />
 *   </SuspenseBoundary>
 * </SuspenseList>
 *
 * @example
 * <suspense-list reveal-order="forwards" tail="collapsed">
 *   <suspense-boundary></suspense-boundary>
 * </suspense-list>
 */
export class SuspenseList extends ReactiveElement {
  static [Symbol.for("litsx.component")] = true;

  static properties = {
    revealOrder: { type: String, attribute: "reveal-order" },
    tail: { type: String },
  };

  constructor() {
    super();
    this._revealOrder = "together";
    this._tail = "collapsed";
    this._boundaries = [];
    this._refreshQueued = false;
  }

  get revealOrder() {
    return this._revealOrder;
  }

  set revealOrder(value) {
    const nextValue = normalizeRevealOrder(value);
    const previousValue = this._revealOrder;
    if (previousValue === nextValue) {
      return;
    }
    this._revealOrder = nextValue;
    this.requestUpdate("revealOrder", previousValue);
  }

  get tail() {
    return this._tail;
  }

  set tail(value) {
    const nextValue = normalizeTail(value);
    const previousValue = this._tail;
    if (previousValue === nextValue) {
      return;
    }
    this._tail = nextValue;
    this.requestUpdate("tail", previousValue);
  }

  createRenderRoot() {
    return this;
  }

  registerBoundary(boundary) {
    if (!boundary || this._boundaries.includes(boundary)) {
      return;
    }
    this._boundaries.push(boundary);
    this.sortBoundaries();
    this.scheduleBoundaryRefresh();
  }

  unregisterBoundary(boundary) {
    const index = this._boundaries.indexOf(boundary);
    if (index === -1) {
      return;
    }
    this._boundaries.splice(index, 1);
    this.scheduleBoundaryRefresh();
  }

  notifyBoundaryPending(_boundary) {
    this.scheduleBoundaryRefresh();
  }

  notifyBoundaryResolved(_boundary) {
    this.scheduleBoundaryRefresh();
  }

  notifyBoundaryErrored(_boundary) {
    this.scheduleBoundaryRefresh();
  }

  getFallbackDisposition(boundary) {
    const boundaries = this.getOrderedBoundaries();
    const index = boundaries.indexOf(boundary);
    if (index === -1) {
      return "show";
    }

    if (this.revealOrder === "backwards") {
      const blocked = boundaries.slice(index + 1).some((entry) => entry.pending);
      if (!blocked) {
        return "show";
      }
      return this.tail === "hidden" ? "hidden" : "collapsed";
    }

    if (this.revealOrder === "together") {
      return "show";
    }

    const blocked = boundaries.slice(0, index).some((entry) => entry.pending);
    if (!blocked) {
      return "show";
    }

    return this.tail === "hidden" ? "hidden" : "collapsed";
  }

  getContentDisposition(boundary) {
    const boundaries = this.getOrderedBoundaries();
    const index = boundaries.indexOf(boundary);
    if (index === -1) {
      return "content";
    }

    if (this.revealOrder === "backwards") {
      const blocked = boundaries
        .slice(index + 1)
        .some((entry) => entry !== boundary && blocksReveal(entry));
      return blocked ? "fallback" : "content";
    }

    if (this.revealOrder === "forwards") {
      const blocked = boundaries
        .slice(0, index)
        .some((entry) => entry !== boundary && blocksReveal(entry));
      return blocked ? "fallback" : "content";
    }

    const blocked = boundaries.some(
      (entry) => entry !== boundary && blocksReveal(entry)
    );

    return blocked ? "fallback" : "content";
  }

  shouldShowFallback(boundary) {
    return this.getFallbackDisposition(boundary) === "show";
  }

  getOrderedBoundaries() {
    this.sortBoundaries();
    return this._boundaries.slice();
  }

  sortBoundaries() {
    this._boundaries.sort((left, right) => {
      if (left === right) {
        return 0;
      }

      if (typeof left.compareDocumentPosition !== "function") {
        return 0;
      }

      const relation = left.compareDocumentPosition(right);
      if (DOM_NODE && relation & DOM_NODE.DOCUMENT_POSITION_FOLLOWING) {
        return -1;
      }
      if (DOM_NODE && relation & DOM_NODE.DOCUMENT_POSITION_PRECEDING) {
        return 1;
      }
      return 0;
    });
  }

  requestBoundaryRefresh() {
    for (const boundary of this._boundaries) {
      if (typeof boundary?.requestUpdate === "function") {
        boundary.requestUpdate();
      }
    }
  }

  scheduleBoundaryRefresh() {
    if (this._refreshQueued) {
      return;
    }

    this._refreshQueued = true;
    queueMicrotask(() => {
      this._refreshQueued = false;
      this.requestBoundaryRefresh();
    });
  }

  update(changedProperties) {
    super.update(changedProperties);

    // Keep the authored light-DOM children untouched. This element acts as a
    // coordinator/wrapper and only mirrors configuration through attributes.
    this.setAttribute("reveal-order", this.revealOrder);
    this.setAttribute("tail", this.tail);

    if (
      changedProperties.has("revealOrder") ||
      changedProperties.has("tail")
    ) {
      this.scheduleBoundaryRefresh();
    }
  }
}
export { SuspenseList as SuspenseListElement };
