import path from "node:path";
import { compile } from "@tailwindcss/node";
import {
  componentCss,
  componentPreflightCss,
  extractTailwindProperties,
  importDirective,
  removeTailwindProperties,
  synchronizeTailwindTheme,
} from "./css.js";

function unique(values) {
  return [...new Set(values)].sort();
}

function normalizeDependency(root, dependency) {
  return path.isAbsolute(dependency)
    ? path.normalize(dependency)
    : path.resolve(root, dependency);
}

export function createTailwindBuildEngine(context) {
  let disposed = false;

  function assertActive() {
    if (disposed) {
      throw new Error("This @litsx/tailwind build engine has been disposed.");
    }
  }

  async function materialize(source, candidates = []) {
    assertActive();
    const dependencies = new Set();
    const compiler = await compile(source, {
      base: context.root,
      onDependency(dependency) {
        dependencies.add(normalizeDependency(context.root, dependency));
      },
    });
    return {
      css: compiler.build(unique(candidates)),
      dependencies: unique(dependencies),
    };
  }

  return {
    async generatePreflight() {
      const result = await materialize(importDirective(context.entry));
      return {
        ...result,
        css: componentPreflightCss(result.css, context.entry),
      };
    },
    async generateComponent(payload) {
      const result = await materialize(
        componentCss(context, payload),
        payload.candidates,
      );
      return {
        ...result,
        css: removeTailwindProperties(result.css, context.entry),
        dependencies: unique([
          ...result.dependencies,
          ...(payload.dependencies ?? []).map((dependency) =>
            normalizeDependency(context.root, dependency),
          ),
        ]),
      };
    },
    async generateGlobal() {
      const payloads = context.entries().map(([, payload]) => payload);
      const allCandidates = unique(
        payloads.flatMap((payload) => payload.candidates ?? []),
      );
      const globalCandidates = unique(
        payloads
          .filter((payload) => payload.mode === "global")
          .flatMap((payload) => payload.candidates ?? []),
      );
      const infrastructure = await materialize(importDirective(context.entry));
      const expandedInfrastructure =
        allCandidates.length > 0
          ? await materialize(importDirective(context.entry), allCandidates)
          : { css: "", dependencies: [] };
      const globalUtilities =
        globalCandidates.length > 0
          ? await materialize(
              componentCss(context, { candidates: globalCandidates }),
              globalCandidates,
            )
          : { css: "", dependencies: [] };
      return {
        css: [
          expandedInfrastructure.css
            ? synchronizeTailwindTheme(
                infrastructure.css,
                expandedInfrastructure.css,
                context.entry,
              )
            : infrastructure.css,
          extractTailwindProperties(expandedInfrastructure.css, context.entry),
          removeTailwindProperties(globalUtilities.css, context.entry),
        ]
          .filter(Boolean)
          .join("\n"),
        dependencies: unique([
          ...infrastructure.dependencies,
          ...expandedInfrastructure.dependencies,
          ...globalUtilities.dependencies,
          ...payloads.flatMap((payload) => payload.dependencies ?? []),
        ]),
      };
    },
    invalidate() {
      assertActive();
    },
    dispose() {
      disposed = true;
    },
  };
}
