import { transformLitsx } from "@litsx/compiler";
import path from "path";
export { litsxVitePressMarkdown } from "./shiki-litsx-languages.js";

function defaultInclude(id) {
  return (
    id.includes("/website/docs/.vitepress/theme/components/") &&
    (id.endsWith(".jsx") || id.endsWith(".tsx") || id.endsWith(".litsx") || id.endsWith(".litsx.jsx"))
  );
}

function shouldInclude(id, include) {
  if (typeof include === "function") {
    return include(id);
  }

  if (include instanceof RegExp) {
    return include.test(id);
  }

  return defaultInclude(id);
}

export function litsxVitePress(options = {}) {
  const {
    workspaceRoot,
    include = defaultInclude,
  } = options;

  return [
    {
      name: "litsx-docs-worker-format",
      config() {
        return {
          worker: {
            format: "es",
          },
        };
      },
    },
    {
      name: "litsx-docs-lit-prod-client-only",
      enforce: "pre",
      resolveId(source, _importer, viteOptions) {
        if (viteOptions?.ssr || !workspaceRoot) {
          return null;
        }

        if (source === "lit") {
          return path.join(workspaceRoot, "node_modules/lit/index.js");
        }

        if (source === "lit-html") {
          return path.join(workspaceRoot, "node_modules/lit-html/lit-html.js");
        }

        if (source === "lit-html/is-server.js") {
          return path.join(workspaceRoot, "node_modules/lit-html/is-server.js");
        }

        if (source === "lit-element/lit-element.js") {
          return path.join(workspaceRoot, "node_modules/lit-element/lit-element.js");
        }

        if (source === "@lit/reactive-element") {
          return path.join(
            workspaceRoot,
            "node_modules/@lit/reactive-element/reactive-element.js"
          );
        }

        return null;
      },
    },
    {
      name: "litsx-docs-compiler",
      enforce: "pre",
      async transform(code, id) {
        if (!shouldInclude(id, include)) {
          return null;
        }

        const result = await transformLitsx(code, {
          filename: id,
          sourceMaps: true,
        });

        if (!result?.code) {
          return null;
        }

        return {
          code: result.code,
          map: result.map ?? null,
        };
      },
    },
  ];
}
