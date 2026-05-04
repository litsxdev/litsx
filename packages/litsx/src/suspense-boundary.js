import { LitElement, html, nothing } from "lit";
import { render as renderLightDom } from "lit/html.js";
import {
  invokeRenderer,
  syncRendererHost,
} from "./runtime-render-context.js";

function isThenable(value) {
  return (
    value != null &&
    (typeof value === "object" || typeof value === "function") &&
    typeof value.then === "function"
  );
}

function reportAsyncError(error) {
  queueMicrotask(() => {
    throw error;
  });
}

/**
 * Define a fallback boundary around a subtree that may suspend.
 * SuspenseBoundary is the native Lit<sup>sx</sup> primitive for asynchronous UI coordination.
 * Think of SuspenseBoundary as the point where one part of the UI is allowed to wait without blocking the whole component.
 * @usage Wrap the part of the UI that may pause while data, code, or a deferred element becomes available.
 * @usage Provide fallback content that should be rendered while the boundary is waiting.
 * @usage Keep the boundary close to the asynchronous region so the fallback stays specific to the part of the UI that is actually pending.
 * @usage Prefer several small boundaries over one large catch-all boundary when different areas of the UI can resolve independently.
 * @behavior The boundary renders fallback content while the wrapped subtree is pending.
 * @behavior Once the subtree resolves, the boundary can coordinate its reveal with a parent SuspenseList.
 * @behavior SuspenseBoundary renders fallback and content in light DOM wrappers so authored subtrees keep the render context of the host that declared them.
 * @behavior The fallback is part of the authored component tree, so it can use the same JSX patterns and styling approach as the rest of the component.
 * @mentalModel A SuspenseBoundary says: this part of the tree may pause, and this is the UI that should stand in while it catches up.
 * @pitfall Avoid wrapping large unrelated sections in a single boundary. Smaller, focused boundaries usually produce clearer fallbacks and better reveal behavior.
 * @pitfall Fallback UI should stay lightweight and recognizable. Treat it as temporary stand-in content, not as a second full version of the screen.
 * @example
 * <SuspenseBoundary fallback={<span>Loading profile...</span>}>
 *   <UserProfile />
 * </SuspenseBoundary>
 */
export class SuspenseBoundary extends LitElement {
  static properties = {
    pending: { type: Boolean, reflect: true },
    resolved: { type: Boolean, reflect: true },
    showing: { type: String, reflect: true },
    phase: { type: String, reflect: true },
    fallbackRenderer: { attribute: false },
    contentRenderer: { attribute: false },
  };

  constructor() {
    super();
    this.pending = false;
    this.resolved = false;
    this.showing = "content";
    this.phase = "content";
    this.fallbackRenderer = null;
    this.contentRenderer = null;

    this._version = 0;
    this._pendingPromise = null;
    this._lastContent = nothing;
    this._lastContentRender = null;
    this._displayValue = nothing;
    this._lastFallback = nothing;
    this._lastFallbackRender = null;
    this._contentVisible = true;
    this._fallbackVisible = false;
    this._contentHostState = null;
    this._fallbackHostState = null;
    this._suspenseList = null;
    this._revealToken = 0;
    this._isRevealing = false;
    this._revealTimeout = null;
    this._lastListSnapshot = "";
  }

  createRenderRoot() {
    return this;
  }

  connectedCallback() {
    super.connectedCallback();
    this.attachToSuspenseList();
    queueMicrotask(() => {
      if (this._suspenseList == null) {
        this.attachToSuspenseList();
      }
    });
    this.addEventListener("transitionend", this);
    this.addEventListener("animationend", this);
  }

  disconnectedCallback() {
    this.detachFromSuspenseList();
    this.removeEventListener("transitionend", this);
    this.removeEventListener("animationend", this);
    super.disconnectedCallback();
    this._version += 1;
    this._pendingPromise = null;
    this._revealToken += 1;
    this._isRevealing = false;
    this.clearRevealTimeout();
  }

  render() {
    if (this._suspenseList == null) {
      this.attachToSuspenseList();
    }

    try {
      const {
        value: resolvedContent = nothing,
        context: contentContext = null,
        projected: contentProjected = false,
      } = invokeRenderer(this.contentRenderer);
      const content = resolvedContent ?? nothing;
      const contentRender = {
        value: content,
        context: contentContext,
        projected: contentProjected,
      };
      const contentDisposition = this._suspenseList
        ? this._suspenseList.getContentDisposition(this)
        : "content";
      const {
        value: resolvedFallback = nothing,
        context: fallbackContext = null,
        projected: fallbackProjected = false,
      } = invokeRenderer(this.fallbackRenderer);
      const fallback = resolvedFallback ?? nothing;
      const fallbackRender = {
        value: fallback,
        context: fallbackContext,
        projected: fallbackProjected,
      };

      this._pendingPromise = null;
      this._lastContent = content;
      this._lastContentRender = contentRender;
      this.pending = false;
      this.resolved = true;
      if (contentDisposition === "fallback") {
        this._displayValue = fallback;
        this._lastFallback = fallback;
        this._lastFallbackRender = fallbackRender;
        this.showing = "fallback";
        this.phase = "blocked";
        this._contentHostState = contentRender;
        this._fallbackHostState = fallbackRender;
        this._contentVisible = false;
        this._fallbackVisible = true;
        this.notifyListState();
        return this.renderHosts();
      }

      if (contentDisposition === "hidden") {
        this._displayValue = nothing;
        this.showing = "hidden";
        this.phase = "hidden";
        this._contentHostState = contentRender;
        this._fallbackHostState = fallbackRender;
        this._contentVisible = false;
        this._fallbackVisible = false;
        this.notifyListState();
        return this.renderHosts();
      }

      if (this._isRevealing) {
        this._displayValue = content;
        this.showing = "content";
        this.phase = "revealing";
        this._contentHostState = contentRender;
        this._fallbackHostState = this._lastFallbackRender ?? fallbackRender;
        this._contentVisible = true;
        this._fallbackVisible = true;
        this.notifyListState();
        return this.renderHosts();
      }

      if (
        this.showing === "fallback" &&
        this._lastFallback !== nothing
      ) {
        this.beginReveal();
        this._displayValue = content;
        this.showing = "content";
        this.phase = "revealing";
        this._contentHostState = contentRender;
        this._fallbackHostState = this._lastFallbackRender ?? fallbackRender;
        this._contentVisible = true;
        this._fallbackVisible = true;
        this.notifyListState();
        return this.renderHosts();
      }

      this._displayValue = content;
      this.showing = "content";
      this.phase = "content";
      this._contentHostState = contentRender;
      this._fallbackHostState = fallbackRender;
      this._contentVisible = true;
      this._fallbackVisible = false;
      this.notifyListState();
      return this.renderHosts();
    } catch (thrown) {
      if (!isThenable(thrown)) {
        reportAsyncError(thrown);
        return nothing;
      }

      this.attachPendingPromise(Promise.resolve(thrown));

      const {
        value: resolvedFallback = nothing,
        context: fallbackContext = null,
        projected: fallbackProjected = false,
      } = invokeRenderer(this.fallbackRenderer);
      const fallback = resolvedFallback ?? nothing;
      const fallbackRender = {
        value: fallback,
        context: fallbackContext,
        projected: fallbackProjected,
      };

      this.pending = true;
      this._lastFallback = fallback;
      this._lastFallbackRender = fallbackRender;
      const disposition = this._suspenseList
        ? this._suspenseList.getFallbackDisposition(this)
        : "show";

      if (disposition === "show") {
        this._displayValue = fallback;
        this.showing = "fallback";
        this.phase = "pending";
        this._contentHostState = this._lastContentRender;
        this._fallbackHostState = fallbackRender;
        this._contentVisible = false;
        this._fallbackVisible = true;
        this.notifyListState();
        return this.renderHosts();
      }

      if (disposition === "collapsed" && this.resolved) {
        this._displayValue = this._lastContent;
        this.showing = "content";
        this.phase = "content";
        this._contentHostState = this._lastContentRender;
        this._fallbackHostState = fallbackRender;
        this._contentVisible = true;
        this._fallbackVisible = false;
        this.notifyListState();
        return this.renderHosts();
      }

      this._displayValue = nothing;
      this.showing = "hidden";
      this.phase = "hidden";
      this._contentHostState = this._lastContentRender;
      this._fallbackHostState = fallbackRender;
      this._contentVisible = false;
      this._fallbackVisible = false;
      this.notifyListState();
      return this.renderHosts();
    }
  }

  updated() {
    const contentHost = this.querySelector('[data-litsx-suspense-region="content"]');
    const fallbackHost = this.querySelector('[data-litsx-suspense-region="fallback"]');

    syncRendererHost(contentHost, this._contentHostState, {
      render: renderLightDom,
      visible: this._contentVisible,
    });
    syncRendererHost(fallbackHost, this._fallbackHostState, {
      render: renderLightDom,
      visible: this._fallbackVisible,
    });
  }

  renderHosts() {
    return html`
      <div
        part="fallback"
        data-litsx-suspense-region="fallback"
        data-showing="fallback"
        ?hidden=${!this._fallbackVisible}
        data-phase=${this.phase}
      ></div>
      <div
        part="content"
        data-litsx-suspense-region="content"
        data-showing="content"
        ?hidden=${!this._contentVisible}
        data-phase=${this.phase}
      ></div>
    `;
  }

  beginReveal() {
    if (this._isRevealing) {
      return;
    }

    const token = ++this._revealToken;
    this._isRevealing = true;
    this.clearRevealTimeout();

    if (!this.hasActiveRevealMotion()) {
      queueMicrotask(() => {
        this.completeReveal(token);
      });
      return;
    }

    const timeoutMs = this.getRevealMotionTimeout();
    this._revealTimeout = setTimeout(() => {
      this.completeReveal(token);
    }, timeoutMs);
  }

  handleEvent(event) {
    if (!this._isRevealing) {
      return;
    }

    if (
      event?.type === "transitionend" ||
      event?.type === "animationend"
    ) {
      this.completeReveal(this._revealToken);
    }
  }

  hasActiveRevealMotion() {
    if (typeof globalThis.getComputedStyle !== "function") {
      return false;
    }

    const styles = globalThis.getComputedStyle(this);
    return (
      this.getMaxAnimationTime(styles) > 0 ||
      this.getMaxTransitionTime(styles) > 0
    );
  }

  getRevealMotionTimeout() {
    if (typeof globalThis.getComputedStyle !== "function") {
      return 32;
    }

    const styles = globalThis.getComputedStyle(this);
    const maxDuration = Math.max(
      this.getMaxAnimationTime(styles),
      this.getMaxTransitionTime(styles)
    );

    return Math.max(32, Math.ceil(maxDuration) + 50);
  }

  getMaxAnimationTime(styles) {
    return this.getMaxTimePair(
      styles?.animationDuration,
      styles?.animationDelay
    );
  }

  getMaxTransitionTime(styles) {
    return this.getMaxTimePair(
      styles?.transitionDuration,
      styles?.transitionDelay
    );
  }

  getMaxTimePair(durationValue, delayValue) {
    const durations = this.parseTimeList(durationValue);
    const delays = this.parseTimeList(delayValue);
    const size = Math.max(durations.length, delays.length);
    let max = 0;

    for (let index = 0; index < size; index += 1) {
      const duration = durations[index] ?? durations[durations.length - 1] ?? 0;
      const delay = delays[index] ?? delays[delays.length - 1] ?? 0;
      max = Math.max(max, duration + delay);
    }

    return max;
  }

  parseTimeList(value) {
    if (typeof value !== "string" || value.trim() === "") {
      return [0];
    }

    return value.split(",").map((entry) => {
      const trimmed = entry.trim();
      if (trimmed.endsWith("ms")) {
        return Number.parseFloat(trimmed.slice(0, -2)) || 0;
      }
      if (trimmed.endsWith("s")) {
        return (Number.parseFloat(trimmed.slice(0, -1)) || 0) * 1000;
      }
      return 0;
    });
  }

  completeReveal(token = this._revealToken) {
    if (!this._isRevealing || token !== this._revealToken) {
      return;
    }

    this._isRevealing = false;
    this.clearRevealTimeout();
    this.phase = "content";
    this.requestUpdate();
  }

  clearRevealTimeout() {
    if (this._revealTimeout == null) {
      return;
    }
    clearTimeout(this._revealTimeout);
    this._revealTimeout = null;
  }

  attachPendingPromise(promise) {
    if (this._pendingPromise === promise) {
      return;
    }

    const token = ++this._version;
    this._pendingPromise = promise;

    promise.then(
      () => {
        if (token !== this._version) {
          return;
        }
        this._pendingPromise = null;
        this.pending = false;
        this.requestUpdate();
      },
      (error) => {
        if (token !== this._version) {
          return;
        }
        this._pendingPromise = null;
        this.pending = false;
        this.notifyListErrored();
        reportAsyncError(error);
      }
    );
  }

  notifyListState() {
    const snapshot = `${this.pending}:${this.resolved}:${this.showing}`;
    if (snapshot === this._lastListSnapshot) {
      return;
    }
    this._lastListSnapshot = snapshot;

    if (this.pending) {
      this._suspenseList?.notifyBoundaryPending(this);
      return;
    }

    if (this.resolved) {
      this._suspenseList?.notifyBoundaryResolved(this);
    }
  }

  notifyListErrored() {
    if (this._lastListSnapshot === "errored") {
      return;
    }
    this._lastListSnapshot = "errored";
    this._suspenseList?.notifyBoundaryErrored(this);
  }

  attachToSuspenseList() {
    if (typeof this.closest !== "function") {
      return;
    }
    const list = this.closest("suspense-list");
    if (!list || typeof list.registerBoundary !== "function") {
      return;
    }
    this._suspenseList = list;
    list.registerBoundary(this);
  }

  detachFromSuspenseList() {
    if (!this._suspenseList || typeof this._suspenseList.unregisterBoundary !== "function") {
      this._suspenseList = null;
      return;
    }
    this._suspenseList.unregisterBoundary(this);
    this._suspenseList = null;
  }
}
export { SuspenseBoundary as SuspenseBoundaryElement };
