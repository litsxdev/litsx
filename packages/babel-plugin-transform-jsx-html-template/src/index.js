import jsxSyntaxPlugin from "@babel/plugin-syntax-jsx";
import { parse } from "@babel/parser";
import * as babelTypes from "@babel/types";
import { SourceMapConsumer, SourceMapGenerator } from "source-map-js";
import {
  createTaggedTemplate,
  buildTemplate,
  collectLitAttributeSourcemapMetadata,
  setTemplateTypes,
} from "./template.js";

let t;

function replaceNode(path, state) {
  if (path.parentPath?.isJSXElement() || path.parentPath?.isJSXFragment()) {
    return;
  }

  const hasTagOption = Object.prototype.hasOwnProperty.call(state.opts, "tag");
  const tag = hasTagOption ? state.opts.tag : "html";
  const sourceFileName =
    state.file?.opts?.sourceFileName ??
    state.file?.opts?.filename ??
    state.file?.metadata?.sourceFileName ??
    null;

  state.__litsxTemplateAttributeMappings.push(
    ...collectLitAttributeSourcemapMetadata(path.node, [], {
      sourceFileName,
    })
  );

  if (tag) {
    path.replaceWith(createTaggedTemplate(path.node, state.opts, tag));
    if (typeof tag === "string" && tag.length > 0) {
      state.__litsxNeedsTaggedImport = true;
      if (!state.__litsxTaggedImportName) {
        state.__litsxTaggedImportName = tag;
      }
    }
    return;
  }

  path.replaceWith(buildTemplate(path.node, state.opts));
}

function indexToPosition(text, index) {
  let line = 1;
  let column = 0;

  for (let cursor = 0; cursor < index; cursor += 1) {
    if (text[cursor] === "\n") {
      line += 1;
      column = 0;
      continue;
    }

    column += 1;
  }

  return { line, column };
}

function isTaggedTemplate(node, tagName) {
  return node?.type === "TaggedTemplateExpression" &&
    node.tag?.type === "Identifier" &&
    node.tag.name === tagName;
}

function collectGeneratedAnchorRanges(code) {
  const anchors = {
    classes: new Map(),
    renders: [],
    renderReturns: [],
    htmlTemplates: [],
  };
  const ast = parse(code, { sourceType: "module" });

  function visit(node) {
    if (!node || typeof node !== "object") return;

    if (node.type === "ClassDeclaration" && node.id?.name) {
      anchors.classes.set(node.id.name, node.start);
    }
    if (node.type === "ClassMethod" && node.kind === "method" && node.key?.name === "render") {
      anchors.renders.push(node.key.start);
    }
    if (node.type === "ReturnStatement" && isTaggedTemplate(node.argument, "html")) {
      anchors.renderReturns.push(node.start);
    }
    if (isTaggedTemplate(node, "html")) {
      anchors.htmlTemplates.push(
        ...node.quasi.quasis.map((quasi) => ({ start: quasi.start, end: quasi.end })),
      );
    }

    const visitorKeys = babelTypes.VISITOR_KEYS[node.type] || [];
    for (const key of visitorKeys) {
      const value = node[key];
      if (Array.isArray(value)) {
        value.forEach(visit);
      } else {
        visit(value);
      }
    }
  }

  visit(ast.program);
  return anchors;
}

function findInRanges(code, needle, ranges, cursor) {
  let fromIndex = cursor ?? 0;
  for (const range of ranges) {
    const start = Math.max(range.start, fromIndex);
    const foundAt = code.indexOf(needle, start);
    if (foundAt !== -1 && foundAt < range.end) {
      return foundAt;
    }
  }
  return -1;
}

function resolvePatchedIndex(code, mapping, anchors, cursors) {
  const scope = mapping.generatedScope;
  if (scope === "class") {
    return anchors.classes.get(mapping.componentName) ?? -1;
  }
  if (scope === "render") {
    const index = cursors.get(scope) ?? 0;
    cursors.set(scope, index + 1);
    return anchors.renders[index] ?? -1;
  }
  if (scope === "render-return") {
    const index = cursors.get(scope) ?? 0;
    cursors.set(scope, index + 1);
    return anchors.renderReturns[index] ?? -1;
  }
  if (scope === "html-template") {
    const cursorKey = `${scope}:${mapping.generatedNeedle}`;
    const foundAt = findInRanges(
      code,
      mapping.generatedNeedle,
      anchors.htmlTemplates,
      cursors.get(cursorKey) ?? 0,
    );
    if (foundAt !== -1) {
      cursors.set(cursorKey, foundAt + mapping.generatedNeedle.length);
    }
    return foundAt;
  }

  const cursorKey = mapping.generatedNeedle;
  const foundAt = code.indexOf(mapping.generatedNeedle, cursors.get(cursorKey) ?? 0);
  if (foundAt !== -1) {
    cursors.set(cursorKey, foundAt + mapping.generatedNeedle.length);
  }
  return foundAt;
}

export function patchLitAttributeSourcemap(code, map, mappings = []) {
  if (!map || !Array.isArray(mappings) || mappings.length === 0) {
    return map ?? null;
  }

  const consumer = new SourceMapConsumer(map);
  const generator = new SourceMapGenerator({
    file: map.file ?? null,
    sourceRoot: map.sourceRoot ?? "",
  });
  let anchors = null;
  try {
    anchors = collectGeneratedAnchorRanges(code);
  } catch {
    // Preserve sourcemap output for syntax emitted by downstream output plugins.
    anchors = { classes: new Map(), renders: [], renderReturns: [], htmlTemplates: [] };
  }
  const searchCursor = new Map();
  const patchedMappings = [];

  for (const mapping of mappings) {
    if (!mapping?.generatedNeedle || !mapping.source) {
      continue;
    }

    const foundAt = resolvePatchedIndex(code, mapping, anchors, searchCursor);
    if (foundAt === -1) {
      continue;
    }

    searchCursor.set(mapping.generatedNeedle, foundAt + mapping.generatedNeedle.length);
    patchedMappings.push({
      mapping,
      generated: indexToPosition(code, foundAt + (mapping.generatedOffset ?? 0)),
    });
  }

  const patchedPositions = new Set(
    patchedMappings.map(({ generated }) => `${generated.line}:${generated.column}`),
  );

  consumer.eachMapping((mapping) => {
    if (mapping.source == null) {
      return;
    }

    if (patchedPositions.has(`${mapping.generatedLine}:${mapping.generatedColumn}`)) {
      return;
    }

    generator.addMapping({
      source: mapping.source,
      original: {
        line: mapping.originalLine,
        column: mapping.originalColumn,
      },
      generated: {
        line: mapping.generatedLine,
        column: mapping.generatedColumn,
      },
      name: mapping.name ?? undefined,
    });
  });

  for (const { mapping, generated } of patchedMappings) {
    generator.addMapping({
      source: mapping.source,
      original: {
        line: mapping.line,
        column: mapping.column,
      },
      generated,
    });
  }

  if (Array.isArray(map.sources)) {
    for (let index = 0; index < map.sources.length; index += 1) {
      const source = map.sources[index];
      if (typeof map.sourcesContent?.[index] === "string") {
        generator.setSourceContent(source, map.sourcesContent[index]);
      }
    }
  }

  consumer.destroy?.();
  return JSON.parse(generator.toString());
}

export default function transformJsxHtmlTemplatePlugin(api) {
  api.assertVersion?.(7);
  t = api.types;
  setTemplateTypes(t);

  return {
    inherits: jsxSyntaxPlugin.default || jsxSyntaxPlugin,
    visitor: {
      Program: {
        enter(_, state) {
          state.__litsxNeedsTaggedImport = false;
          state.__litsxTaggedImportName = null;
          state.__litsxTemplateAttributeMappings = [];
          state.opts = state.opts || {};
          state.opts.__litsxNeedsNoscriptRuntime = false;
        },
        exit(programPath, state) {
          const importName = state.__litsxTaggedImportName;
          if (state.__litsxNeedsTaggedImport && importName) {
            ensureTaggedImport(programPath, importName);
          }
          if (state.opts.__litsxNeedsNoscriptRuntime) {
            ensureNamedImport(programPath, "@litsx/core", "__litsxNoscript");
          }

          if (state.__litsxTemplateAttributeMappings.length > 0) {
            state.file.metadata.litsxTemplateAttributeMappings = [
              ...(state.file.metadata.litsxTemplateAttributeMappings || []),
              ...state.__litsxTemplateAttributeMappings,
            ];
          }
        },
      },
      JSXElement: {
        exit: replaceNode,
      },
      JSXFragment: {
        exit: replaceNode,
      },
    },
  };
}


function ensureTaggedImport(programPath, importName) {
  const bodyPaths = programPath.get("body");
  const litImports = bodyPaths.filter(
    (path) => path.isImportDeclaration() && path.node.source.value === "lit"
  );

  const importSpecifier = t.importSpecifier(
    t.identifier(importName),
    t.identifier(importName)
  );

  for (const importPath of litImports) {
    const { specifiers } = importPath.node;

    const hasTaggedImport = specifiers.some(
      (specifier) =>
        t.isImportSpecifier(specifier) &&
        t.isIdentifier(specifier.imported, { name: importName })
    );

    if (hasTaggedImport) {
      return;
    }

    const hasNamespaceImport = specifiers.some((specifier) =>
      t.isImportNamespaceSpecifier(specifier)
    );

    if (hasNamespaceImport) {
      continue;
    }

    specifiers.push(importSpecifier);
    return;
  }

  const taggedImport = t.importDeclaration(
    [importSpecifier],
    t.stringLiteral("lit")
  );

  if (litImports.length > 0) {
    litImports[0].insertBefore(taggedImport);
  } else {
    programPath.unshiftContainer("body", taggedImport);
  }
}

function ensureNamedImport(programPath, source, importName) {
  const bodyPaths = programPath.get("body");
  const existing = bodyPaths.find(
    (path) => path.isImportDeclaration() && path.node.source.value === source,
  );
  if (existing) {
    if (existing.node.specifiers.some(
      (specifier) => t.isImportSpecifier(specifier) && t.isIdentifier(specifier.imported, { name: importName }),
    )) {
      return;
    }
    if (existing.node.specifiers.some((specifier) => t.isImportNamespaceSpecifier(specifier))) {
      existing.insertAfter(t.importDeclaration(
        [t.importSpecifier(t.identifier(importName), t.identifier(importName))],
        t.stringLiteral(source),
      ));
      return;
    }
    existing.node.specifiers.push(t.importSpecifier(t.identifier(importName), t.identifier(importName)));
    return;
  }
  programPath.unshiftContainer("body", t.importDeclaration(
    [t.importSpecifier(t.identifier(importName), t.identifier(importName))],
    t.stringLiteral(source),
  ));
}
