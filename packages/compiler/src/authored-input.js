import * as babelParser from "@babel/parser";
import {
  collectNativeClassNameWarnings,
  collectReactMemoWarnings,
} from "@litsx/authoring";
import {
  getLitsxVirtualizationMetadata,
  parseWithLitsxVirtualization,
} from "@litsx/authoring/parser";
import { mergeLitsxWarnings } from "./warnings.js";

function normalizeParserPlugins(filename, parserPlugins = []) {
  if (Array.isArray(parserPlugins) && parserPlugins.length > 0) {
    return parserPlugins;
  }

  if (typeof filename === "string" && (
    filename.endsWith(".tsx") ||
    filename.endsWith(".litsx")
  )) {
    return ["typescript"];
  }

  return [];
}

function normalizePluginList(plugins) {
  return Array.isArray(plugins) ? plugins : [];
}

export function ensureLitsxParserPlugins(filename, parserPlugins = [], { requireJsx = false } = {}) {
  const normalized = normalizeParserPlugins(filename, parserPlugins);
  if (!requireJsx) {
    return normalized;
  }

  const hasJsx = normalized.some((plugin) => {
    if (typeof plugin === "string") {
      return plugin === "jsx";
    }
    return Array.isArray(plugin) && plugin[0] === "jsx";
  });

  return hasJsx ? normalized : [...normalized, "jsx"];
}

export function prepareLitsxAuthoredInput(
  source,
  options = {},
  runtime = {}
) {
  const runtimeImpl = {
    parse: babelParser.parse,
    transformFromAstSync: null,
    ...runtime,
  };
  const filename = options.filename;
  const sourceMaps = options.sourceMaps === true;
  const parserPlugins = ensureLitsxParserPlugins(filename, options.parserPlugins, {
    requireJsx: options.requireJsx === true,
  });
  const virtualizedAst = parseWithLitsxVirtualization(runtimeImpl.parse, source, {
    sourceType: "module",
    plugins: parserPlugins,
    sourceFileName: filename,
    litsxSourceMap: sourceMaps,
  });
  const virtualization = getLitsxVirtualizationMetadata(virtualizedAst);
  const authoredWarnings = mergeLitsxWarnings(
    collectNativeClassNameWarnings(virtualizedAst).map((warning) => ({
      ...warning,
      code: "LITSX_NATIVE_CLASSNAME",
    })),
    collectReactMemoWarnings(virtualizedAst),
    { filename }
  );
  const authoringPlugins = normalizePluginList(options.authoringPlugins);

  let inputAst = virtualizedAst;
  if (authoringPlugins.length > 0) {
    if (typeof runtimeImpl.transformFromAstSync !== "function") {
      throw new Error(
        "prepareLitsxAuthoredInput(...) requires runtime.transformFromAstSync when authoringPlugins are provided."
      );
    }

    const authoringPass = runtimeImpl.transformFromAstSync(virtualizedAst, source, {
      filename,
      sourceFileName: filename,
      configFile: false,
      babelrc: false,
      ast: true,
      code: false,
      sourceMaps: false,
      plugins: authoringPlugins,
    });

    inputAst = authoringPass?.ast ?? virtualizedAst;
  }

  return {
    filename,
    virtualization,
    inputAst,
    authoredWarnings,
  };
}
