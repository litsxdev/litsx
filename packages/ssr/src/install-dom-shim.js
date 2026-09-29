// This import and the installation below must remain synchronous. Lit chooses
// ReactiveElement's DOM base class while its modules are evaluated, so doing
// this from a render function is already too late.
import { installWindowOnGlobal } from "@lit-labs/ssr/lib/dom-shim.js";

// Lit's upstream installer guards only on `window`, but its Node shim leaves
// that property undefined. A second physical copy can therefore replace the
// first copy's HTMLElement. Guard on both signals so independent dependency
// trees converge on the first installed DOM identity. A consumer-provided DOM
// is also left untouched, including partial environments that expose `window`.
if (
  globalThis.window === undefined &&
  globalThis.HTMLElement === undefined
) {
  installWindowOnGlobal();
}
