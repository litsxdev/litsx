import parser from "@litsx/babel-parser";
import {
  createVirtualLitsxJsxSource,
  remapVirtualText,
} from "@litsx/jsx-authoring";
import { format as prettierFormat } from "prettier";
import babelPlugin from "prettier/plugins/babel";
import estreePlugin from "prettier/plugins/estree";
import postcssPlugin from "prettier/plugins/postcss";

const AST_FORMAT = "litsx-ast";
const ROOT_TYPE = "LitsxDocument";
const INTERNAL_VIRTUAL_PREFIX = "__litsx_";
const BABEL_PLUGINS = [babelPlugin, estreePlugin];
const CSS_PLUGINS = [postcssPlugin];

function createRootNode(text, mode, options) {
  const virtualization = createVirtualLitsxJsxSource(text, {
    sourceMap: false,
    strategy: "compiler",
  });

  const parsePlugins = mode === "litsx" ? ["typescript", "jsx"] : ["jsx"];
  const authoredAst = parser.parse(text, {
    sourceType: "module",
    plugins: parsePlugins,
    sourceFileName: options.filepath,
    sourceFilename: options.filepath,
  });

  return {
    type: ROOT_TYPE,
    start: 0,
    end: text.length,
    mode,
    text,
    authoredAst,
    virtualSource: virtualization,
  };
}

function getParserPlugins(mode) {
  return mode === "litsx" ? ["typescript", "jsx"] : ["jsx"];
}

function buildNestedOptions(options, parserName, plugins) {
  const {
    parser,
    plugins: ignoredPlugins,
    filepath,
    parentParser,
    originalText,
    astFormat,
    locStart,
    locEnd,
    rangeStart,
    rangeEnd,
    cursorOffset,
    ...rest
  } = options;

  return {
    ...rest,
    parser: parserName,
    plugins,
  };
}

function getIndentUnit(options) {
  if (options.useTabs) {
    return "\t";
  }

  return " ".repeat(options.tabWidth ?? 2);
}

function getLineIndent(text, index) {
  const lineStart = text.lastIndexOf("\n", Math.max(0, index - 1)) + 1;
  const line = text.slice(lineStart, index);
  const match = /^[\t ]*/.exec(line);
  return match?.[0] ?? "";
}

function indentBlock(text, indent) {
  return text
    .split("\n")
    .map((line) => (line.length > 0 ? `${indent}${line}` : ""))
    .join("\n");
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

function isWhitespace(char) {
  return char === " " || char === "\t" || char === "\n" || char === "\r";
}

function scanQuotedString(sourceText, start, quote) {
  let index = start + 1;

  while (index < sourceText.length) {
    const char = sourceText[index];
    if (char === "\\") {
      index += 2;
      continue;
    }
    if (char === quote) {
      return index + 1;
    }
    index += 1;
  }

  return index;
}

function scanLineComment(sourceText, start) {
  let index = start + 2;
  while (index < sourceText.length && sourceText[index] !== "\n") {
    index += 1;
  }
  return index;
}

function scanBlockComment(sourceText, start) {
  let index = start + 2;
  while (index < sourceText.length) {
    if (sourceText[index] === "*" && sourceText[index + 1] === "/") {
      return index + 2;
    }
    index += 1;
  }
  return index;
}

function scanTemplateLiteral(sourceText, start) {
  let index = start + 1;

  while (index < sourceText.length) {
    const char = sourceText[index];
    if (char === "\\") {
      index += 2;
      continue;
    }
    if (char === "`") {
      return index + 1;
    }
    if (char === "$" && sourceText[index + 1] === "{") {
      index = scanBalancedParens(sourceText, index + 1, "{", "}");
      continue;
    }
    index += 1;
  }

  return index;
}

function scanBalancedParens(sourceText, start, openChar = "(", closeChar = ")") {
  let depth = 0;
  let index = start;

  while (index < sourceText.length) {
    const char = sourceText[index];
    const next = sourceText[index + 1];

    if (char === "'" || char === "\"") {
      index = scanQuotedString(sourceText, index, char);
      continue;
    }

    if (char === "`") {
      index = scanTemplateLiteral(sourceText, index);
      continue;
    }

    if (char === "/" && next === "/") {
      index = scanLineComment(sourceText, index);
      continue;
    }

    if (char === "/" && next === "*") {
      index = scanBlockComment(sourceText, index);
      continue;
    }

    if (char === openChar) {
      depth += 1;
      index += 1;
      continue;
    }

    if (char === closeChar) {
      depth -= 1;
      index += 1;
      if (depth <= 0) {
        return index;
      }
      continue;
    }

    index += 1;
  }

  return index;
}

function remapVirtualStaticHoists(authoredText) {
  let index = 0;
  let output = "";

  while (index < authoredText.length) {
    if (!authoredText.startsWith("static ", index)) {
      output += authoredText[index];
      index += 1;
      continue;
    }

    let nameStart = index + "static ".length;
    let nameEnd = nameStart;
    while (/[A-Za-z0-9$_]/.test(authoredText[nameEnd] || "")) {
      nameEnd += 1;
    }

    if (nameEnd === nameStart) {
      output += authoredText[index];
      index += 1;
      continue;
    }

    let next = nameEnd;
    while (isWhitespace(authoredText[next])) {
      next += 1;
    }

    if (authoredText[next] !== "(") {
      output += authoredText[index];
      index += 1;
      continue;
    }

    const callEnd = scanBalancedParens(authoredText, next);
    let statementEnd = callEnd;
    while (isWhitespace(authoredText[statementEnd])) {
      statementEnd += 1;
    }
    if (authoredText[statementEnd] === ";") {
      statementEnd += 1;
    }

    const hoistName = authoredText.slice(nameStart, nameEnd);
    const argumentText = authoredText.slice(next + 1, callEnd - 1);
    const replacement =
      hoistName === "lightDom" && argumentText.trim().length === 0
        ? `static ${hoistName} = true;`
        : `static ${hoistName} = ${argumentText};`;

    output += replacement;
    index = statementEnd;
  }

  return output;
}

function collectStaticStylesTemplates(authoredText) {
  const templates = [];

  let index = 0;
  while (index < authoredText.length) {
    const matchIndex = authoredText.indexOf("static styles", index);
    if (matchIndex === -1) {
      break;
    }

    let cursor = matchIndex + "static styles".length;
    while (isWhitespace(authoredText[cursor])) {
      cursor += 1;
    }

    if (authoredText[cursor] !== "=") {
      index = cursor;
      continue;
    }

    cursor += 1;
    while (isWhitespace(authoredText[cursor])) {
      cursor += 1;
    }

    if (authoredText[cursor] !== "`") {
      index = cursor;
      continue;
    }

    const templateEnd = scanTemplateLiteral(authoredText, cursor);
    const rawTemplate = authoredText.slice(cursor, templateEnd);
    if (rawTemplate.includes("${")) {
      index = templateEnd;
      continue;
    }

    let statementEnd = templateEnd;
    while (isWhitespace(authoredText[statementEnd])) {
      statementEnd += 1;
    }
    if (authoredText[statementEnd] === ";") {
      statementEnd += 1;
    }

    templates.push({
      callStart: matchIndex,
      callEnd: statementEnd,
      contentStart: cursor + 1,
      contentEnd: templateEnd - 1,
    });

    index = statementEnd;
  }

  return templates;
}

async function formatEmbeddedStyles(authoredText, mode, options) {
  const templates = collectStaticStylesTemplates(authoredText, mode);

  if (templates.length === 0) {
    return authoredText;
  }

  const replacements = [];

  for (const template of templates) {
    const rawCss = authoredText.slice(template.contentStart, template.contentEnd);
    const formattedCss = (await prettierFormat(
      rawCss,
      buildNestedOptions(options, "css", CSS_PLUGINS),
    )).trim();

    const indent = getLineIndent(authoredText, template.callStart);
    const innerIndent = `${indent}${getIndentUnit(options)}`;
    const replacement = formattedCss.length === 0
      ? "static styles = ``;"
      : `static styles = \`\n${indentBlock(formattedCss, innerIndent)}\n${indent}\`;`;

    replacements.push({
      start: template.callStart,
      end: template.callEnd,
      replacement,
    });
  }

  return replacements
    .sort((left, right) => right.start - left.start)
    .reduce(
      (current, replacement) => (
        current.slice(0, replacement.start) +
        replacement.replacement +
        current.slice(replacement.end)
      ),
      authoredText,
    );
}

async function formatLitsxDocument(node, options) {
  if (node.virtualSource?.collision) {
    throw new Error(
      "prettier-plugin-litsx cannot format sources that already contain reserved internal __litsx_* names.",
    );
  }

  const targetParser = node.mode === "litsx" ? "babel-ts" : "babel";
  const formattedVirtual = await prettierFormat(
    node.virtualSource.code,
    buildNestedOptions(options, targetParser, BABEL_PLUGINS),
  );
  const remapped = remapVirtualStaticHoists(remapVirtualText(formattedVirtual));
  return formatEmbeddedStyles(remapped, node.mode, options);
}

const printer = {
  print() {
    return "";
  },
  embed(path, options) {
    const node = path.node;
    if (node?.type !== ROOT_TYPE) {
      return null;
    }

    return async () => formatLitsxDocument(node, options);
  },
  getVisitorKeys(node) {
    if (node?.type === ROOT_TYPE) {
      return [];
    }

    return undefined;
  },
  canAttachComment() {
    return false;
  },
};

function createParser(mode) {
  return {
    parse(text, options) {
      return createRootNode(text, mode, options);
    },
    astFormat: AST_FORMAT,
    locStart(node) {
      return node?.start ?? 0;
    },
    locEnd(node) {
      return node?.end ?? 0;
    },
  };
}

export const languages = [
  {
    name: "LitSX",
    parsers: ["litsx"],
    extensions: [".litsx"],
    vscodeLanguageIds: ["litsx"],
  },
  {
    name: "LitSX JSX",
    parsers: ["litsx-jsx"],
    extensions: [".litsx.jsx"],
    vscodeLanguageIds: ["litsx-jsx"],
  },
];

export const parsers = {
  litsx: createParser("litsx"),
  "litsx-jsx": createParser("litsx-jsx"),
};

export const printers = {
  [AST_FORMAT]: printer,
};

const plugin = {
  languages,
  parsers,
  printers,
};

export default plugin;
