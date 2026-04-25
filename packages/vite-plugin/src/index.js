import { createLitsxCompilationSession } from "../../compiler/src/index.js";

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
  let session = null;

  function getSession() {
    if (!session) {
      session = createLitsxCompilationSession({
        projectPath: compilerOptions.projectPath,
        transformOptions: compilerOptions,
      });
    }
    return session;
  }

  return {
    name: "litsx",
    enforce: "pre",
    async transform(code, id) {
      if (!shouldTransform(id, include)) {
        return null;
      }

      const result = await getSession().transform(code, {
        ...compilerOptions,
        filename: id,
      });

      return {
        code: result.code,
        map: result.map,
      };
    },
    handleHotUpdate(ctx) {
      session?.invalidate?.([ctx.file]);
    },
    buildEnd() {
      session?.dispose?.();
      session = null;
    },
  };
}

export default litsx;
