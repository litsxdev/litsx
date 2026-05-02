import jsxSyntaxPlugin from "@babel/plugin-syntax-jsx";
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

export function patchLitAttributeSourcemap(code, map, mappings = []) {
  if (!map || !Array.isArray(mappings) || mappings.length === 0) {
    return map ?? null;
  }

  const consumer = new SourceMapConsumer(map);
  const generator = new SourceMapGenerator({
    file: map.file ?? null,
    sourceRoot: map.sourceRoot ?? "",
  });
  const searchCursor = new Map();

  consumer.eachMapping((mapping) => {
    if (mapping.source == null) {
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

  for (const mapping of mappings) {
    if (!mapping?.generatedNeedle || !mapping.source) {
      continue;
    }

    const fromIndex = searchCursor.get(mapping.generatedNeedle) ?? 0;
    const foundAt = code.indexOf(mapping.generatedNeedle, fromIndex);
    if (foundAt === -1) {
      continue;
    }

    searchCursor.set(mapping.generatedNeedle, foundAt + mapping.generatedNeedle.length);

    generator.addMapping({
      source: mapping.source,
      original: {
        line: mapping.line,
        column: mapping.column,
      },
      generated: indexToPosition(code, foundAt + (mapping.generatedOffset ?? 0)),
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
  api.assertVersion?.("^8.0.0-0");
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
        },
        exit(programPath, state) {
          const importName = state.__litsxTaggedImportName;
          if (state.__litsxNeedsTaggedImport && importName) {
            ensureTaggedImport(programPath, importName);
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
