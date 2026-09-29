import { isDirectiveResult } from "lit/directive-helpers.js";
import { styleMap } from "lit/directives/style-map.js";

/**
 * Normalize a JSX style binding for Lit's style AttributePart.
 *
 * Strings, nullish values, and explicit Lit directives retain their original
 * meaning. Object values use Lit's official styleMap directive.
 */
export function resolveStyle(value) {
  if (value == null || typeof value !== "object" || isDirectiveResult(value)) {
    return value;
  }
  return styleMap(value);
}
