import * as babelParser from "@babel/parser";
import {
  collectComponentNameDiagnostics,
  collectHookDiagnostics,
  collectNativeClassNameWarnings,
  collectReactMemoWarnings,
} from "@litsx/authoring";
import { analyzeLitsxModule } from "./module-analysis.js";
import { mergeLitsxWarnings } from "./warnings.js";

function normalizeParserPlugins(filename, parserPlugins = []) {
  if (Array.isArray(parserPlugins) && parserPlugins.length > 0) {
    return parserPlugins;
  }

  if (typeof filename === "string" && /\.tsx?$/.test(filename)) {
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

function assertNoAuthoringErrors(ast) {
  const diagnostics = [
    ...collectComponentNameDiagnostics(ast),
    ...collectHookDiagnostics(ast),
  ].sort((left, right) => (left.start ?? 0) - (right.start ?? 0));
  const diagnostic = diagnostics.find((entry) => entry.severity === "error");
  if (!diagnostic) return;

  const error = new SyntaxError(`[${diagnostic.code}] ${diagnostic.message}`);
  error.code = diagnostic.code;
  if (typeof diagnostic.line === "number" && typeof diagnostic.column === "number") {
    error.loc = { line: diagnostic.line, column: diagnostic.column };
  }
  throw error;
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
  const parserPlugins = ensureLitsxParserPlugins(filename, options.parserPlugins, {
    requireJsx: options.requireJsx !== false,
  });
  const parsedAst = runtimeImpl.parse(source, {
    sourceType: "module",
    plugins: parserPlugins,
    sourceFileName: filename,
  });
  assertNoRemovedAuthoringCalls(parsedAst);
  assertNoAuthoringErrors(parsedAst);
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
