import { Decoration, EditorView, ViewPlugin } from "@codemirror/view";
import { cssLanguage } from "@codemirror/lang-css";
import { javascript, javascriptLanguage } from "@codemirror/lang-javascript";
import {
  foldService,
  forceParsing,
  Language,
  LanguageSupport,
  syntaxTree,
} from "@codemirror/language";
import { linter } from "@codemirror/lint";
import { highlightTree, classHighlighter } from "@lezer/highlight";
import { Parser } from "@lezer/common";
import {
  createVirtualLitsxJsxSource,
  mapOriginalPositionToVirtual,
  mapVirtualPositionToOriginal,
} from "../../jsx-authoring/src/index.js";

export const litsxSourceTheme = EditorView.theme({
  ".tok-keyword, .tok-keyword *": {
    color: "var(--vp-c-brand-1)",
  },
  ".tok-atom, .tok-atom *": {
    color: "var(--vp-c-brand-1)",
  },
  ".tok-bool, .tok-bool *": {
    color: "var(--vp-c-brand-1)",
  },
  ".tok-propertyName, .tok-propertyName *": {
    color: "var(--vp-c-text-1)",
  },
  ".tok-typeName, .tok-typeName *": {
    color: "var(--vp-c-green-1)",
  },
  ".tok-className, .tok-className *": {
    color: "var(--vp-c-green-1)",
  },
  ".tok-number, .tok-number *": {
    color: "var(--vp-c-yellow-1)",
  },
  ".tok-string, .tok-string *": {
    color: "var(--vp-c-green-2)",
  },
  ".tok-variableName, .tok-variableName *": {
    color: "var(--vp-c-text-1)",
  },
  ".tok-operator, .tok-operator *": {
    color: "var(--vp-c-text-2)",
  },
  ".tok-punctuation, .tok-punctuation *": {
    color: "var(--vp-c-text-2)",
  },
  ".cm-litsx-lit-attr-prefix, .cm-litsx-lit-attr-prefix *, .tok-propertyName .cm-litsx-lit-attr-prefix, .tok-propertyName .cm-litsx-lit-attr-prefix *": {
    color: "var(--vp-c-brand-1)",
    fontWeight: "600",
  },
  ".cm-litsx-lit-attr-name, .cm-litsx-lit-attr-name *, .tok-propertyName .cm-litsx-lit-attr-name, .tok-propertyName .cm-litsx-lit-attr-name *": {
    color: "var(--vp-c-text-1)",
  },
  ".cm-diagnostic.cm-diagnostic-error": {
    borderBottom: "2px wavy color-mix(in srgb, var(--vp-c-danger-1) 82%, transparent)",
  },
});

const javascriptTsxSupport = javascript({
  typescript: true,
  jsx: true,
});

class LitsxVirtualizedParser extends Parser {
  constructor(baseParser) {
    super();
    this.baseParser = baseParser;
  }

  createParse(input, fragments, ranges) {
    const source =
      typeof input === "string" ? input : input.read(0, input.length);
    const virtualSource = createVirtualLitsxJsxSource(source, {
      strategy: "editor",
    });

    return this.baseParser.startParse(virtualSource.code, fragments, ranges);
  }
}

const litsxEditorParser = new LitsxVirtualizedParser(
  javascriptTsxSupport.language.parser
);

const litsxSourceLanguage = new Language(
  javascriptLanguage.data,
  litsxEditorParser,
  [],
  "litsx-source"
);

function isHoistLineStart(text) {
  return /^\s*\^[A-Za-z_$][\w$]*\s*\(/.test(text);
}

function findHoistFoldRange(state, lineStart) {
  const line = state.doc.lineAt(lineStart);
  if (!isHoistLineStart(line.text)) {
    return null;
  }

  const docText = state.doc.toString();
  const caretOffset = line.text.indexOf("^");
  const openParenOffset = line.text.indexOf("(", caretOffset);
  if (openParenOffset < 0) {
    return null;
  }

  const from = line.from + openParenOffset + 1;
  let depth = 0;
  let quote = null;
  let templateInterpolationDepth = 0;
  let blockComment = false;
  let lineComment = false;
  let escape = false;

  for (let index = line.from + openParenOffset; index < docText.length; index += 1) {
    const char = docText[index];
    const next = docText[index + 1];

    if (lineComment) {
      if (char === "\n") {
        lineComment = false;
      }
      continue;
    }

    if (blockComment) {
      if (char === "*" && next === "/") {
        blockComment = false;
        index += 1;
      }
      continue;
    }

    if (quote) {
      if (escape) {
        escape = false;
        continue;
      }

      if (char === "\\") {
        escape = true;
        continue;
      }

      if (quote === "`") {
        if (char === "$" && next === "{") {
          templateInterpolationDepth += 1;
          index += 1;
          continue;
        }

        if (char === "}" && templateInterpolationDepth > 0) {
          templateInterpolationDepth -= 1;
          continue;
        }

        if (char === "`" && templateInterpolationDepth === 0) {
          quote = null;
        }
        continue;
      }

      if (char === quote) {
        quote = null;
      }
      continue;
    }

    if (char === "/" && next === "/") {
      lineComment = true;
      index += 1;
      continue;
    }

    if (char === "/" && next === "*") {
      blockComment = true;
      index += 1;
      continue;
    }

    if (char === "'" || char === "\"" || char === "`") {
      quote = char;
      continue;
    }

    if (char === "(") {
      depth += 1;
      continue;
    }

    if (char === ")") {
      depth -= 1;
      if (depth === 0) {
        return index <= from ? null : { from, to: index };
      }
    }
  }

  return null;
}

function createMark(from, to, className) {
  if (typeof className !== "string" || !className || to <= from) {
    return null;
  }

  return Decoration.mark({
    attributes: { class: className },
  }).range(from, to);
}

function intersectsRange(from, to, start, end) {
  return from < end && to > start;
}

function collectVirtualAttributeHighlightDecorations(virtualSource, ranges) {
  const replacementVirtualRanges = virtualSource.replacements.map((replacement) => ({
    ...replacement,
    virtualStart: mapOriginalPositionToVirtual(
      replacement.start,
      virtualSource.replacements
    ),
    virtualEnd: mapOriginalPositionToVirtual(
      replacement.end,
      virtualSource.replacements
    ),
  }));

  if (replacementVirtualRanges.length === 0) {
    return;
  }

  const tree = litsxEditorParser.parse(virtualSource.code);

  highlightTree(tree, classHighlighter, (from, to, classes) => {
    for (const replacement of replacementVirtualRanges) {
      if (!intersectsRange(from, to, replacement.virtualStart, replacement.virtualEnd)) {
        continue;
      }

      const originalFrom = mapVirtualPositionToOriginal(from, virtualSource.replacements);
      const originalTo = mapVirtualPositionToOriginal(to, virtualSource.replacements);
      const decoration = createMark(originalFrom, originalTo, classes);

      if (decoration) {
        ranges.push(decoration);
      }
      break;
    }
  });
}

function collectCssTemplateRanges(virtualSource) {
  const tree = litsxEditorParser.parse(virtualSource.code);
  const ranges = [];

  function pushTemplateSegments(template) {
    let segmentStart = template.from + 1;

    for (let child = template.firstChild; child; child = child.nextSibling) {
      if (child.type.name === "Interpolation") {
        if (child.from > segmentStart) {
          ranges.push({ from: segmentStart, to: child.from });
        }
        segmentStart = child.to;
      }
    }

    if (segmentStart < template.to - 1) {
      ranges.push({ from: segmentStart, to: template.to - 1 });
    }
  }

  function visit(node) {
    if (node.type.name === "TaggedTemplateExpression") {
      const tag = node.firstChild;
      const template = tag?.nextSibling;
      if (
        tag?.type.name === "VariableName" &&
        virtualSource.code.slice(tag.from, tag.to) === "css" &&
        template?.type.name === "TemplateString"
      ) {
        pushTemplateSegments(template);
      }
    }

    if (node.type.name === "CallExpression") {
      const callee = node.firstChild;
      const argList = callee?.nextSibling;
      const firstArg = argList?.firstChild?.nextSibling;

      const calleeName =
        callee?.type.name === "VariableName"
          ? virtualSource.code.slice(callee.from, callee.to)
          : null;

      if (
        (calleeName === "staticStyles" || calleeName === "__litsx_static_styles" || calleeName === "$styles") &&
        firstArg?.type.name === "TemplateString"
      ) {
        pushTemplateSegments(firstArg);
      }
    }

    for (let child = node.firstChild; child; child = child.nextSibling) {
      visit(child);
    }
  }

  visit(tree.topNode);
  return ranges;
}

function collectCssHighlightDecorations(virtualSource, ranges) {
  const cssRanges = collectCssTemplateRanges(virtualSource);

  for (const range of cssRanges) {
    const cssText = virtualSource.code.slice(range.from, range.to);
    if (!cssText.trim()) {
      continue;
    }

    const cssTree = cssLanguage.parser.parse(cssText);

    highlightTree(cssTree, classHighlighter, (from, to, classes) => {
      const originalFrom = mapVirtualPositionToOriginal(
        range.from + from,
        virtualSource.replacements
      );
      const originalTo = mapVirtualPositionToOriginal(
        range.from + to,
        virtualSource.replacements
      );
      const decoration = createMark(originalFrom, originalTo, classes);

      if (decoration) {
        ranges.push(decoration);
      }
    });
  }
}

function buildLitsxSourceDecorations(view) {
  const source = view.state.doc.toString();
  const virtualSource = createVirtualLitsxJsxSource(source, {
    strategy: "editor",
  });
  const ranges = [];

  for (const replacement of virtualSource.replacements) {
    const prefixLength = replacement.originalName[0] ? 1 : 0;
    const nameLength = replacement.originalName.length - prefixLength;

    if (nameLength <= 0) {
      continue;
    }

    ranges.push(
      Decoration.mark({
        attributes: { class: "cm-litsx-lit-attr-prefix" },
      }).range(replacement.start, replacement.start + prefixLength)
    );

    ranges.push(
      Decoration.mark({
        attributes: { class: "cm-litsx-lit-attr-name" },
      }).range(
        replacement.start + prefixLength,
        replacement.start + prefixLength + nameLength
      )
    );
  }

  collectVirtualAttributeHighlightDecorations(virtualSource, ranges);
  collectCssHighlightDecorations(virtualSource, ranges);

  return Decoration.set(ranges, true);
}

export const litsxSourceHighlighting = ViewPlugin.fromClass(
  class {
    constructor(view) {
      this.decorations = buildLitsxSourceDecorations(view);
    }

    update(update) {
      if (update.docChanged || update.viewportChanged) {
        this.decorations = buildLitsxSourceDecorations(update.view);
      }
    }
  },
  {
    decorations: (value) => value.decorations,
  }
);

export const litsxSourceParseStabilizer = ViewPlugin.fromClass(
  class {
    constructor(view) {
      this.view = view;
      this.timeoutId = null;
      this.scheduleParse();
    }

    update(update) {
      if (update.docChanged || update.viewportChanged) {
        this.view = update.view;
        this.scheduleParse();
      }
    }

    destroy() {
      if (this.timeoutId !== null) {
        clearTimeout(this.timeoutId);
        this.timeoutId = null;
      }
    }

    scheduleParse() {
      if (this.timeoutId !== null) {
        clearTimeout(this.timeoutId);
      }

      this.timeoutId = setTimeout(() => {
        this.timeoutId = null;
        forceParsing(this.view, this.view.state.doc.length, 100);
      }, 0);
    }
  }
);

export const litsxSourceHoistFolding = foldService.of((state, lineStart) =>
  findHoistFoldRange(state, lineStart)
);

function buildLitsxSyntaxDiagnostics(view) {
  const diagnostics = [];
  const tree = syntaxTree(view.state);

  tree.cursor().iterate((node) => {
    if (!node.type.isError) {
      return;
    }

    const from = node.from;
    const to = Math.max(node.to, from + 1);
    const text = view.state.doc.sliceString(from, Math.min(to, from + 24)).trim();

    diagnostics.push({
      from,
      to,
      severity: "error",
      source: "litsx-source",
      message:
        text.length > 0
          ? `Unexpected syntax near "${text}".`
          : "Unexpected syntax.",
    });
  });

  return diagnostics;
}

export function litsxSourceSupport() {
  return new LanguageSupport(litsxSourceLanguage, [
    javascriptTsxSupport.support,
    litsxSourceHoistFolding,
    linter(buildLitsxSyntaxDiagnostics, {
      delay: 150,
    }),
  ]);
}
