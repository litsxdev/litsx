const HYDRATION_DEPTH = Symbol.for("@litsx/ssr/hydration-depth");
const CLIENT_RUNTIME = Symbol.for("@litsx/ssr/client-runtime");

globalThis[CLIENT_RUNTIME] = true;

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
