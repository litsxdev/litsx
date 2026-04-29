import * as babelParser from "@babel/parser";
import {
  getLitsxVirtualizationMetadata,
  parseWithLitsxVirtualization,
} from "../../jsx-authoring/src/parser.js";
import { mergeLitsxWarnings } from "./warnings.js";

function isNativeIntrinsicJsxName(nameNode) {
  return nameNode?.type === "JSXIdentifier" && /^[a-z]/.test(nameNode.name);
}

function collectNativeClassNameWarnings(ast) {
  const warnings = [];

  function visit(node, currentTagName = null) {
    if (!node || typeof node !== "object") {
      return;
    }

    let nextTagName = currentTagName;
    if (node.type === "JSXOpeningElement" && isNativeIntrinsicJsxName(node.name)) {
      nextTagName = node.name.name;
    }

    if (
      node.type === "JSXAttribute" &&
      nextTagName &&
      node.name?.type === "JSXIdentifier" &&
      node.name.name === "className"
    ) {
      warnings.push({
        code: "LITSX_NATIVE_CLASSNAME",
        message:
          '`className` is not native LitSX syntax. Use `class` in native LitSX, or add the React compatibility layer to rewrite `className`.',
        attributeName: "className",
        tagName: nextTagName,
        line: node.name.loc?.start?.line ?? null,
        column: node.name.loc?.start?.column ?? null,
      });
    }

    for (const value of Object.values(node)) {
      if (Array.isArray(value)) {
        value.forEach((child) => visit(child, nextTagName));
      } else {
        visit(value, nextTagName);
      }
    }
  }

  visit(ast.program ?? ast, null);
  return warnings;
}

function collectReactMemoWarnings(ast) {
  const warnings = [];
  const reactMemoLocalNames = new Set();
  const reactNamespaceNames = new Set();

  const body = ast?.program?.body ?? ast?.body ?? [];
  for (const node of body) {
    if (node?.type !== "ImportDeclaration" || node.source?.value !== "react") {
      continue;
    }

    for (const specifier of node.specifiers || []) {
      if (
        specifier?.type === "ImportSpecifier" &&
        specifier.imported?.type === "Identifier" &&
        specifier.imported.name === "memo" &&
        specifier.local?.type === "Identifier"
      ) {
        reactMemoLocalNames.add(specifier.local.name);
      }

      if (
        (specifier?.type === "ImportDefaultSpecifier" ||
          specifier?.type === "ImportNamespaceSpecifier") &&
        specifier.local?.type === "Identifier"
      ) {
        reactNamespaceNames.add(specifier.local.name);
      }
    }
  }

  function addMemoWarnings(node) {
    const line = node.loc?.start?.line ?? null;
    const column = node.loc?.start?.column ?? null;

    warnings.push({
      code: 91016,
      message:
        "`memo(...)` is removed during LitSX lowering. LitSX does not use React-style parent re-render bailout semantics, so `memo` is treated as a migration wrapper only.",
      line,
      column,
    });

    if ((node.arguments || []).length > 1) {
      warnings.push({
        code: 91017,
        message:
          "`memo(Component, areEqual)` ignores the comparator during LitSX lowering because LitSX does not use React-style parent re-render bailout semantics.",
        line,
        column,
      });
    }
  }

  function visit(node) {
    if (!node || typeof node !== "object") {
      return;
    }

    if (node.type === "CallExpression") {
      const callee = node.callee;
      const isImportedMemo =
        callee?.type === "Identifier" && reactMemoLocalNames.has(callee.name);
      const isNamespacedMemo =
        callee?.type === "MemberExpression" &&
        callee.computed === false &&
        callee.object?.type === "Identifier" &&
        reactNamespaceNames.has(callee.object.name) &&
        callee.property?.type === "Identifier" &&
        callee.property.name === "memo";

      if (isImportedMemo || isNamespacedMemo) {
        addMemoWarnings(node);
      }
    }

    for (const value of Object.values(node)) {
      if (Array.isArray(value)) {
        value.forEach((child) => visit(child));
      } else {
        visit(value);
      }
    }
  }

  visit(ast.program ?? ast);
  return warnings;
}

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
    collectNativeClassNameWarnings(virtualizedAst),
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
