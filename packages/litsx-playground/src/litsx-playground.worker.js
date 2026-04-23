import "./litsx-playground.worker-shims.js";
import { compileLitsxPlayground } from "./litsx-playground-compiler.js";

self.onmessage = async (event) => {
  const { id, source, filename, mode } = event.data || {};

  try {
    const result = await compileLitsxPlayground(source, {
      filename: filename || "/playground/App.tsx",
      mode,
    });

    self.postMessage({
      id,
      ok: true,
      code: result.code,
      warnings: result.metadata?.litsxWarnings || [],
    });
  } catch (error) {
    self.postMessage({
      id,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack || "" : "",
    });
  }
};
