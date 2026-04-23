import { transformLitsx } from "../../compiler/src/index.js";

function shouldTransform(id, include) {
  if (typeof include === "function") {
    return include(id);
  }

  if (include instanceof RegExp) {
    return include.test(id);
  }

  return /\.(jsx|tsx)$/.test(id);
}

export function litsx(options = {}) {
  const {
    include,
    ...compilerOptions
  } = options;

  return {
    name: "litsx",
    enforce: "pre",
    async transform(code, id) {
      if (!shouldTransform(id, include)) {
        return null;
      }

      const result = await transformLitsx(code, {
        ...compilerOptions,
        filename: id,
      });

      return {
        code: result.code,
        map: result.map,
      };
    },
  };
}

export default litsx;
