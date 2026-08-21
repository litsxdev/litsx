import * as babelParser from "@babel/parser";
import {
  collectNativeClassNameWarnings,
  collectReactMemoWarnings,
} from "@litsx/authoring";
import { analyzeLitsxModule } from "./module-analysis.js";
import { mergeLitsxWarnings } from "./warnings.js";

function normalizeParserPlugins(filename, parserPlugins = []) {
  if (Array.isArray(parserPlugins) && parserPlugins.length > 0) {
    return parserPlugins;
  }

  if (typeof filename === "string" && /\.(?:litsx|tsx?)$/.test(filename)) {
    return ["typescript"];
  }

  return [];
}

function normalizePluginList(plugins) {
  return Array.isArray(plugins) ? plugins : [];
}

function assertNoRemovedAuthoringCalls(ast) {
  function visit(node) {
    if (!node || typeof node !== "object") return;

    if (
      node.type === "CallExpression" &&
      node.callee?.type === "Identifier" &&
      (
        node.callee.name === "staticProps" ||
        node.callee.name === "staticStyles" ||
        node.callee.name.startsWith("__litsx_static_")
      )
    ) {
      throw new SyntaxError(
        `LitSX no longer accepts ${node.callee.name}(...) in authored source. ` +
        "Assign metadata with Component.properties, Component.styles, or the corresponding Component field.",
      );
    }

    for (const value of Object.values(node)) {
      if (Array.isArray(value)) {
        value.forEach(visit);
      } else if (value && typeof value === "object") {
        visit(value);
      }
    }
  }

  visit(ast?.program ?? ast);
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
  if (typeof filename === "string" && (filename.endsWith(".litsx") || filename.endsWith(".litsx.jsx"))) {
    throw new SyntaxError(
      `LitSX authored files must use a standard .jsx or .tsx extension: ${filename}`,
    );
  }
  const parserPlugins = ensureLitsxParserPlugins(filename, options.parserPlugins, {
    requireJsx: options.requireJsx !== false,
  });
  const parsedAst = runtimeImpl.parse(source, {
    sourceType: "module",
    plugins: parserPlugins,
    sourceFileName: filename,
  });
  assertNoRemovedAuthoringCalls(parsedAst);
  const authoredWarnings = mergeLitsxWarnings(
    collectNativeClassNameWarnings(parsedAst).map((warning) => ({
      ...warning,
      code: "LITSX_NATIVE_CLASSNAME",
    })),
    collectReactMemoWarnings(parsedAst),
    { filename }
  );
  const authoringPlugins = normalizePluginList(options.authoringPlugins);

  let inputAst = parsedAst;
  if (authoringPlugins.length > 0) {
    if (typeof runtimeImpl.transformFromAstSync !== "function") {
      throw new Error(
        "prepareLitsxAuthoredInput(...) requires runtime.transformFromAstSync when authoringPlugins are provided."
      );
    }

    const authoringPass = runtimeImpl.transformFromAstSync(parsedAst, source, {
      filename,
      sourceFileName: filename,
      configFile: false,
      babelrc: false,
      ast: true,
      code: false,
      sourceMaps: false,
      plugins: authoringPlugins,
    });

    inputAst = authoringPass?.ast ?? parsedAst;
  }

  return {
    filename,
    inputAst,
    authoredWarnings,
    moduleAnalysis: analyzeLitsxModule(inputAst),
  };
}
