import babelCore from "@babel/core";
import {
  createLitsxPresetPlugins,
} from "../../babel-preset-litsx/src/index.js";
import {
  patchLitAttributeSourcemap,
} from "../../babel-plugin-transform-jsx-html-template/src/index.js";
import {
  ensureLitsxParserPlugins,
  prepareLitsxAuthoredInput,
} from "./authored-input.js";
export {
  ensureLitsxParserPlugins,
  prepareLitsxAuthoredInput,
} from "./authored-input.js";

const { transformFromAstAsync, transformFromAstSync } = babelCore;

function normalizePluginList(plugins) {
  return Array.isArray(plugins) ? plugins : [];
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

export function createLitsxTransformConfig(source, options = {}) {
  const { filename, virtualization, inputAst, authoredWarnings } = prepareLitsxAuthoredInput(
    source,
    options,
    {
      transformFromAstSync,
    }
  );
  const outputPlugins = normalizePluginList(options.outputPlugins);

  return {
    filename,
    inputAst,
    authoredWarnings,
    babelOptions: {
      filename,
      sourceFileName: filename,
      configFile: false,
      babelrc: false,
      inputSourceMap:
        options.sourceMaps === true ? virtualization?.map ?? undefined : undefined,
      sourceMaps: options.sourceMaps === true,
      plugins: [
        ...createLitsxPresetPlugins(options),
        ...outputPlugins,
      ],
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
  const { inputAst, babelOptions, authoredWarnings } = createLitsxTransformConfig(source, options);
  const result = await transformFromAstAsync(inputAst, source, babelOptions);
  return finalizeTransformResult(result, options, authoredWarnings);
}

export function transformLitsxSync(source, options = {}) {
  const { inputAst, babelOptions, authoredWarnings } = createLitsxTransformConfig(source, options);
  const result = transformFromAstSync(inputAst, source, babelOptions);
  return finalizeTransformResult(result, options, authoredWarnings);
}

export default transformLitsx;
