import { getCurrentTest, vi } from "vitest";
import logTransform from "./log-transform.js";

function getCurrentTestLabel() {
  const current = typeof getCurrentTest === "function" ? getCurrentTest() : null;
  if (!current) {
    return "transform";
  }

  const segments = [];
  let cursor = current;
  while (cursor) {
    if (cursor.name) {
      segments.unshift(cursor.name);
    }
    cursor = cursor.suite;
  }
  return segments.join(" > ");
}

vi.mock("@babel/core", async (importOriginal) => {
  const original = await importOriginal();
  const wrap = (target) => {
    if (!target || typeof target.transformFromAstSync !== "function") {
      return target;
    }

    const originalTransform = target.transformFromAstSync.bind(target);
    return {
      ...target,
      transformFromAstSync(ast, code, options) {
        const result = originalTransform(ast, code, options);

        if (
          typeof code === "string" &&
          result &&
          typeof result.code === "string" &&
          result.code.trim() !== code.trim()
        ) {
          logTransform(getCurrentTestLabel(), code, result.code);
        }

        return result;
      },
    };
  };

  const wrapped = wrap(original);
  return {
    ...wrapped,
    default: wrap(original.default ?? original),
  };
});
