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

function collectStaticStylesTemplates(authoredText, mode) {
  const ast = parser.parse(authoredText, {
    sourceType: "module",
    plugins: getParserPlugins(mode),
  });
  const templates = [];

  walk(ast.program ?? ast, (node) => {
    if (
      node?.type === "CallExpression" &&
      node.callee?.type === "Identifier" &&
      node.callee.name === "__litsx_static_styles" &&
      node.arguments?.length === 1
    ) {
      const [firstArg] = node.arguments;
      if (
        firstArg?.type === "TemplateLiteral" &&
        firstArg.expressions?.length === 0 &&
        typeof firstArg.start === "number" &&
        typeof firstArg.end === "number"
      ) {
        templates.push({
          callStart: node.start,
          callEnd: node.end,
          contentStart: firstArg.start + 1,
          contentEnd: firstArg.end - 1,
        });
      }
    }
  });

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
      ? "^styles(``)"
      : `^styles(\`\n${indentBlock(formattedCss, innerIndent)}\n${indent}\`)`;

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
  const remapped = remapVirtualText(formattedVirtual);
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
