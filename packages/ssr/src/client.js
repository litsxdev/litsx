import { digestForTemplateResult, hydrate as hydrateLit } from "@lit-labs/ssr-client";

const HYDRATION_DEPTH = Symbol.for("@litsx/ssr/hydration-depth");
const CLIENT_RUNTIME = Symbol.for("@litsx/ssr/client-runtime");

globalThis[CLIENT_RUNTIME] = true;

export { digestForTemplateResult };

export function hydrate(value, container, options) {
  globalThis[HYDRATION_DEPTH] = (globalThis[HYDRATION_DEPTH] ?? 0) + 1;
  try {
    return hydrateLit(value, container, options);
  } finally {
    globalThis[HYDRATION_DEPTH] -= 1;
  }
}
