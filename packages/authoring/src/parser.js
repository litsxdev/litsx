import {
  createVirtualLitsxJsxSource,
  decodeVirtualAttributeName,
  mapVirtualPositionToOriginal,
} from "./index.js";

const VIRTUALIZATION_METADATA = Symbol.for("litsx.babelParser.virtualization");

function ensureJsxPlugin(plugins = []) {
  const hasJsx = plugins.some((plugin) => {
    if (typeof plugin === "string") {
      return plugin === "jsx";
    }

    return Array.isArray(plugin) && plugin[0] === "jsx";
  });

  return hasJsx ? plugins : [...plugins, "jsx"];
}

function normalizeOptions(options = {}) {
  const {
    plugins = [],
    sourceFileName,
    sourceFilename,
    litsxSourceMap,
    ...rest
  } = options;

  return {
    parserOptions: {
      sourceType: "module",
      ...rest,
      plugins: ensureJsxPlugin(plugins),
    },
    virtualizationOptions: {
      sourceFileName: sourceFileName ?? sourceFilename,
      sourceMap: litsxSourceMap !== false,
    },
  };
}

function walk(node, visitor) {
  if (!node || typeof node !== "object") {
    return;
  }

  visitor(node);

  for (const value of Object.values(node)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        walk(item, visitor);
      }
      continue;
    }

    walk(value, visitor);
  }
}

function createIndexToPosition(source) {
  const lineStarts = [0];

  for (let index = 0; index < source.length; index += 1) {
    if (source[index] === "\n") {
      lineStarts.push(index + 1);
    }
  }

  return (index) => {
    let low = 0;
    let high = lineStarts.length - 1;

    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      if (lineStarts[mid] <= index) {
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }

    const lineIndex = Math.max(0, high);
    return {
      line: lineIndex + 1,
      column: index - lineStarts[lineIndex],
      index,
    };
  };
}

function remapAstPositions(ast, source, replacements) {
  if (!replacements?.length) {
    return ast;
  }

  const indexToPosition = createIndexToPosition(source);

  walk(ast, (node) => {
    if (!node || typeof node !== "object") {
      return;
    }

    if (typeof node.start === "number") {
      node.start = mapVirtualPositionToOriginal(node.start, replacements);
    }

    if (typeof node.end === "number") {
      node.end = mapVirtualPositionToOriginal(node.end, replacements);
    }

    if (node.loc) {
      const startIndex =
        typeof node.start === "number"
          ? node.start
          : mapVirtualPositionToOriginal(node.loc.start.index, replacements);
      const endIndex =
        typeof node.end === "number"
          ? node.end
          : mapVirtualPositionToOriginal(node.loc.end.index, replacements);

      node.loc = {
        ...node.loc,
        start: indexToPosition(startIndex),
        end: indexToPosition(endIndex),
      };
    }
  });

  return ast;
}

function restoreVirtualAttributeNames(ast) {
  walk(ast, (node) => {
    if (
      node?.type === "JSXAttribute" &&
      node.name?.type === "JSXIdentifier" &&
      typeof node.name.name === "string"
    ) {
      const decoded = decodeVirtualAttributeName(node.name.name);
      if (decoded) {
        node.name.name = decoded;
      }
    }
  });

  return ast;
}

function attachVirtualizationMetadata(ast, virtualSource) {
  if (!ast || !virtualSource) {
    return ast;
  }

  Object.defineProperty(ast, VIRTUALIZATION_METADATA, {
    configurable: true,
    enumerable: false,
    writable: false,
    value: {
      code: virtualSource.code,
      map: virtualSource.map ?? null,
      replacements: virtualSource.replacements ?? [],
    },
  });

  return ast;
}

export function getLitsxVirtualizationMetadata(ast) {
  return ast?.[VIRTUALIZATION_METADATA] ?? null;
}

export function parseWithLitsxVirtualization(parseFn, code, options) {
  const { parserOptions, virtualizationOptions } = normalizeOptions(options);
  const virtualSource = createVirtualLitsxJsxSource(code, virtualizationOptions);
  const ast = parseFn(virtualSource.code, parserOptions);
  remapAstPositions(ast, code, virtualSource.replacements);
  restoreVirtualAttributeNames(ast);
  return attachVirtualizationMetadata(ast, virtualSource);
}
