import babelCore from "@babel/core";
import * as babelParser from "@babel/parser";
import {
  createLitsxPresetPlugins,
} from "../../babel-preset-litsx/src/index.js";
import {
  patchLitAttributeSourcemap,
} from "../../babel-plugin-transform-jsx-html-template/src/index.js";
import {
  getLitsxVirtualizationMetadata,
  parseWithLitsxVirtualization,
} from "../../jsx-authoring/src/parser.js";

const { transformFromAstAsync, transformFromAstSync } = babelCore;

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
      code: "LITSX_REACT_MEMO_STRIPPED",
      message:
        "`memo(...)` is removed during LitSX lowering. LitSX does not use React-style parent re-render bailout semantics, so `memo` is treated as a migration wrapper only.",
      line,
      column,
    });

    if ((node.arguments || []).length > 1) {
      warnings.push({
        code: "LITSX_REACT_MEMO_COMPARATOR_IGNORED",
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

function mergeWarnings(existingWarnings = [], additionalWarnings = []) {
  const merged = [];
  const seen = new Set();

  for (const warning of [...existingWarnings, ...additionalWarnings]) {
    const key = [
      warning?.code ?? "",
      warning?.attributeName ?? "",
      warning?.tagName ?? "",
      warning?.line ?? "",
      warning?.column ?? "",
    ].join(":");

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    merged.push(warning);
  }

  return merged;
}

function normalizeParserPlugins(filename, parserPlugins = []) {
  if (Array.isArray(parserPlugins) && parserPlugins.length > 0) {
    return parserPlugins;
  }

  if (typeof filename === "string" && filename.endsWith(".tsx")) {
    return ["typescript"];
  }

  return [];
}

function createPluginList(options) {
  const plugins = createLitsxPresetPlugins(options);

  if (Array.isArray(options.babelPlugins) && options.babelPlugins.length > 0) {
    plugins.push(...options.babelPlugins);
  }

  return plugins;
}

function createTransformConfig(source, options = {}) {
  const filename = options.filename;
  const sourceMaps = options.sourceMaps === true;
  const parserPlugins = normalizeParserPlugins(filename, options.parserPlugins);
  const inputAst = parseWithLitsxVirtualization(babelParser.parse, source, {
    sourceType: "module",
    plugins: parserPlugins,
    sourceFileName: filename,
    litsxSourceMap: sourceMaps,
  });
  const virtualization = getLitsxVirtualizationMetadata(inputAst);
  const authoredWarnings = mergeWarnings(
    collectNativeClassNameWarnings(inputAst),
    collectReactMemoWarnings(inputAst)
  );

  return {
    filename,
    inputAst,
    authoredWarnings,
    babelOptions: {
      filename,
      sourceFileName: filename,
      configFile: false,
      babelrc: false,
      inputSourceMap: sourceMaps ? virtualization?.map ?? undefined : undefined,
      sourceMaps,
      plugins: createPluginList(options),
    },
  };
}

function finalizeTransformResult(result, options, authoredWarnings = []) {
  if (!result) {
    return {
      code: "",
      map: null,
      metadata: {},
    };
  }

  const metadata = {
    ...(result.metadata || {}),
  };
  const mergedWarnings = mergeWarnings(metadata.litsxWarnings || [], authoredWarnings);
  if (mergedWarnings.length > 0) {
    metadata.litsxWarnings = mergedWarnings;
  }
  const map =
    options.sourceMaps === true
      ? options.jsxTemplate === false
        ? result.map ?? null
        : patchLitAttributeSourcemap(
          result.code || "",
          result.map ?? null,
          metadata.litsxTemplateAttributeMappings || []
        )
      : null;

  return {
    code: result.code || "",
    map,
    metadata,
  };
}

export async function transformLitsx(source, options = {}) {
  const { inputAst, babelOptions, authoredWarnings } = createTransformConfig(source, options);
  const result = await transformFromAstAsync(inputAst, source, babelOptions);
  return finalizeTransformResult(result, options, authoredWarnings);
}

export function transformLitsxSync(source, options = {}) {
  const { inputAst, babelOptions, authoredWarnings } = createTransformConfig(source, options);
  const result = transformFromAstSync(inputAst, source, babelOptions);
  return finalizeTransformResult(result, options, authoredWarnings);
}

export default transformLitsx;
