const HYDRATION_DEPTH = Symbol.for("@litsx/ssr/hydration-depth");
const CLIENT_RUNTIME = Symbol.for("@litsx/ssr/client-runtime");

// SSR frameworks can import hydration helpers while rendering on the server.
// Mark the runtime as client-side only when an actual DOM is present; otherwise
// SSR-compiled spread helpers would incorrectly select their ElementPart path.
if (typeof window !== "undefined" && typeof document !== "undefined") {
  globalThis[CLIENT_RUNTIME] = true;
}

export async function withLitsxHydration(run) {
  globalThis[HYDRATION_DEPTH] = (globalThis[HYDRATION_DEPTH] ?? 0) + 1;
  try {
    return await run();
  } finally {
    globalThis[HYDRATION_DEPTH] -= 1;
  }
}

export function withLitsxHydrationSync(run) {
  globalThis[HYDRATION_DEPTH] = (globalThis[HYDRATION_DEPTH] ?? 0) + 1;
  try {
    return run();
  } finally {
    globalThis[HYDRATION_DEPTH] -= 1;
  }
}
