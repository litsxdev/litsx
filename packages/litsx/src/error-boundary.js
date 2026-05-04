import { LitElement, html, nothing } from "lit";
import { render as renderLightDom } from "lit/html.js";
import {
  clearProjectedRendererRegion,
  invokeRenderer,
  renderRendererRegion,
} from "./runtime-render-context.js";

const CONTENT_SLOT = "content";
const FALLBACK_SLOT = "fallback";

function asProjectedRenderer(rendered) {
  if (!rendered) {
    return rendered;
  }

  return {
    ...rendered,
    projected: true,
  };
}

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
 * @behavior ErrorBoundary projects content and fallback through slots so renderer props keep the declaration-time authored context.
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
  }

  createRenderRoot() {
    return super.createRenderRoot();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    clearProjectedRendererRegion(this, CONTENT_SLOT, renderLightDom);
    clearProjectedRendererRegion(this, FALLBACK_SLOT, renderLightDom);
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
    renderRendererRegion(this, CONTENT_SLOT, null, {
      render: renderLightDom,
      visible: false,
    });
    const fallbackView = renderRendererRegion(this, FALLBACK_SLOT, asProjectedRenderer({
      value: fallback,
      context: fallbackContext,
      projected: fallbackProjected,
    }), {
      render: renderLightDom,
      visible: true,
    });

    return html`<div part="fallback" data-showing="fallback">${fallbackView}</div>`;
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
      renderRendererRegion(this, FALLBACK_SLOT, null, {
        render: renderLightDom,
        visible: false,
      });
      const contentView = renderRendererRegion(this, CONTENT_SLOT, asProjectedRenderer({
        value: content,
        context: contentContext,
        projected: contentProjected,
      }), {
        render: renderLightDom,
        visible: true,
      });
      return html`<div part="content" data-showing="content">${contentView}</div>`;
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
}

export { ErrorBoundary as ErrorBoundaryElement };
