import { nothing } from "lit";
import { Directive, directive } from "lit/directive.js";

const noscriptFactories = new WeakMap();

class LitsxNoscriptDirective extends Directive {
  render() {
    // A browser must retain the native <noscript> fallback semantics. The
    // compiler renders an empty host and this directive deliberately produces
    // no client-side content or updates.
    return nothing;
  }
}

const renderNoscriptDirective = directive(LitsxNoscriptDirective);

/**
 * Internal compiler/runtime bridge for dynamic <noscript> fallback content.
 * The factory is intentionally lazy so browser evaluation does not construct
 * the fallback tree. @litsx/ssr consumes it before Lit renders the host.
 */
export function __litsxNoscript(factory, elements = null) {
  if (typeof factory !== "function") {
    throw new TypeError("__litsxNoscript(...) expects a fallback factory.");
  }
  if (elements != null && (typeof elements !== "object" || Array.isArray(elements))) {
    throw new TypeError("__litsxNoscript(...) elements must be an object when provided.");
  }

  const result = renderNoscriptDirective();
  noscriptFactories.set(result, { factory, elements });
  return result;
}

export function __getLitsxNoscriptFactory(value) {
  return noscriptFactories.get(value) ?? null;
}
