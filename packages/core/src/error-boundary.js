import { LitElement, html, nothing } from "lit";
import { render as renderLightDom } from "lit/html.js";
import {
  invokeRenderer,
  syncRendererHost,
} from "./rendering.js";

function isThenable(value) {
  return (
    value != null &&
    (typeof value === "object" || typeof value === "function") &&
    typeof value.then === "function"
  );
}

/**
 * Catch synchronous render errors for one subtree and render fallback UI instead.
 * ErrorBoundary is the native Lit<sup>sx</sup> primitive for recoverable render failures.
 * Think of ErrorBoundary as the point where one part of the UI is allowed to fail without taking down the whole component.
 * @usage Wrap a subtree that may throw during render and provide fallback content that should replace it on failure.
 * @usage Keep the boundary close to the risky region so the fallback stays specific to the part of the UI that failed.
 * @usage Recreate the boundary with a new identity when you want to retry after a latched failure.
 * @behavior The boundary catches synchronous render errors from its content renderer and switches to fallback mode.
 * @behavior Once it has failed, the boundary stays latched on fallback until the instance is replaced.
 * @behavior Thenables are not treated as errors. They are rethrown so SuspenseBoundary can continue to own asynchronous reveal.
 * @behavior ErrorBoundary renders fallback and content in light DOM wrappers so authored subtrees keep the render context of the host that declared them.
 * @mentalModel An ErrorBoundary says: if this part of the tree throws, show this fallback instead and keep the rest of the UI alive.
 * @pitfall Do not expect the boundary to retry automatically after failure. Replace the instance through identity when you want a fresh attempt.
 * @pitfall Keep fallback UI focused on recovery. It should explain failure or provide a next action, not silently hide the problem.
 * @example
 * <ErrorBoundary fallback={<span>Could not load profile.</span>}>
 *   <ProfilePanel />
 * </ErrorBoundary>
 */
export class ErrorBoundary extends LitElement {
  static properties = {
    failed: { type: Boolean, reflect: true },
    error: { attribute: false },
    onError: { attribute: false },
    fallbackRenderer: { attribute: false },
    contentRenderer: { attribute: false },
  };

  constructor() {
    super();
    this.failed = false;
    this.error = null;
    this.onError = null;
    this.fallbackRenderer = null;
    this.contentRenderer = null;
    this._contentHostState = null;
    this._fallbackHostState = null;
    this._contentVisible = true;
    this._fallbackVisible = false;
  }

  createRenderRoot() {
    return this;
  }

  renderFallback() {
    const {
      value: fallback = nothing,
      context: fallbackContext = null,
      projected: fallbackProjected = false,
    } = invokeRenderer(
      this.fallbackRenderer,
      this.error,
    );
    this._contentHostState = null;
    this._fallbackHostState = {
      value: fallback,
      context: fallbackContext,
      projected: fallbackProjected,
    };
    this._contentVisible = false;
    this._fallbackVisible = true;

    return this.renderHosts();
  }

  render() {
    if (this.failed) {
      return this.renderFallback();
    }

    try {
      const {
        value: content = nothing,
        context: contentContext = null,
        projected: contentProjected = false,
      } = invokeRenderer(
        this.contentRenderer,
      );

      this.error = null;
      this.failed = false;
      this._fallbackHostState = null;
      this._contentHostState = {
        value: content,
        context: contentContext,
        projected: contentProjected,
      };
      this._contentVisible = true;
      this._fallbackVisible = false;
      return this.renderHosts();
    } catch (thrown) {
      if (isThenable(thrown)) {
        throw thrown;
      }

      const shouldNotify = !this.failed;
      this.failed = true;
      this.error = thrown;

      if (shouldNotify && typeof this.onError === "function") {
        try {
          this.onError(thrown);
        } catch (callbackError) {
          this.reportError?.(callbackError);
        }
      }

      return this.renderFallback();
    }
  }

  updated() {
    const contentHost = this.querySelector('[data-litsx-error-region="content"]');
    const fallbackHost = this.querySelector('[data-litsx-error-region="fallback"]');

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
        data-litsx-error-region="fallback"
        data-showing="fallback"
        ?hidden=${!this._fallbackVisible}
      ></div>
      <div
        part="content"
        data-litsx-error-region="content"
        data-showing="content"
        ?hidden=${!this._contentVisible}
      ></div>
    `;
  }
}

export { ErrorBoundary as ErrorBoundaryElement };
