import tsxLanguage from "shiki/dist/langs/tsx.mjs";
import jsxLanguage from "shiki/dist/langs/jsx.mjs";
import cssLanguage from "shiki/dist/langs/css.mjs";

function cloneLanguageRegistration(registration) {
  return JSON.parse(JSON.stringify(registration));
}

function rewriteRepositoryIncludes(value, prefix) {
  if (Array.isArray(value)) {
    return value.map((entry) => rewriteRepositoryIncludes(entry, prefix));
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  const next = {};
  for (const [key, child] of Object.entries(value)) {
    if (key === "include" && typeof child === "string" && child.startsWith("#")) {
      next[key] = `#${prefix}${child.slice(1)}`;
      continue;
    }

    next[key] = rewriteRepositoryIncludes(child, prefix);
  }

  return next;
}

function createPrefixedCssRepository(prefix) {
  const cssRegistration = cloneLanguageRegistration(cssLanguage[0]);
  const repository = {};

  for (const [key, value] of Object.entries(cssRegistration.repository || {})) {
    repository[`${prefix}${key}`] = rewriteRepositoryIncludes(value, prefix);
  }

  repository[`${prefix}root`] = {
    patterns: rewriteRepositoryIncludes(cssRegistration.patterns || [], prefix),
  };

  return repository;
}

function getLitsxAttributeNameScope(prefixPattern) {
  switch (prefixPattern) {
    case "@":
      return "entity.other.attribute-name.event.litsx";
    case "\\.":
      return "entity.other.attribute-name.property.litsx";
    case "\\?":
      return "entity.other.attribute-name.boolean.litsx";
    default:
      return "entity.other.attribute-name.litsx";
  }
}

function allowQuestionMarkAttributes(pattern) {
  return typeof pattern === "string"
    ? pattern.replaceAll("(?=((<\\s*)|(\\s+))(?!\\?)|\\/?>)", "(?=((<\\s*)|(\\s+))|\\/?>)")
    : pattern;
}

function createLitsxTagAttributeRule(registration, prefixPattern) {
  return {
    begin: `\\s*(${prefixPattern})([A-Za-z_$][A-Za-z0-9_$-]*)(?=\\s|=|/?>|/\\*|//)`,
    beginCaptures: {
      1: { name: "keyword.operator.litsx" },
      2: {
        name: getLitsxAttributeNameScope(prefixPattern),
      },
    },
    end: "(?=\\s+(?:[@.?]|[_$[:alpha:]])|\\s*/?>(?=\\s*(?:$|<|\\{|[_$[:alpha:]]))|/\\*|//)",
    patterns: [
      { include: "#comment" },
      { include: "#jsx-tag-attribute-assignment" },
      { include: "#jsx-string-double-quoted" },
      { include: "#jsx-string-single-quoted" },
      { include: "#litsx-jsx-evaluated-code" },
    ],
  };
}

function createLitsxAwareLanguage(registration) {
  const grammar = cloneLanguageRegistration(registration);
  const prefixedCssRepository = createPrefixedCssRepository("litsx-css-");
  const originalPatterns = Array.isArray(grammar.patterns) ? grammar.patterns : [];
  const originalRepository = grammar.repository || {};

  grammar.patterns = [
    { include: "#litsx-styles-css" },
    { include: "#litsx-hoists" },
    { include: "#litsx-jsx-attributes" },
    ...originalPatterns,
  ];

  grammar.repository = {
    ...originalRepository,
    ...prefixedCssRepository,
    "litsx-hoists": {
      patterns: [
        {
          match: "(\\^)([A-Za-z_$][\\w$]*)(?=\\s*\\()",
          captures: {
            1: { name: "markup.italic.litsx keyword.operator.litsx" },
            2: { name: "markup.italic.litsx entity.name.hoist.litsx" },
          },
        },
      ],
    },
    "litsx-jsx-tag-attribute-name": {
      patterns: [
        {
          match: "\\s*([@.?])([A-Za-z_$][A-Za-z0-9_$-]*)(?=\\s|=|/?>|/\\*|//)",
          captures: {
            1: { name: "keyword.operator.litsx" },
            2: {
              name: "entity.other.attribute-name.litsx",
            },
          },
        },
      ],
    },
    "litsx-jsx-tag-attribute": {
      patterns: [
        { include: "#litsx-jsx-tag-bool-attribute" },
        { include: "#litsx-jsx-tag-event-attribute" },
        { include: "#litsx-jsx-tag-prop-attribute" },
      ],
    },
    "litsx-jsx-tag-bool-attribute": createLitsxTagAttributeRule(registration, "\\?"),
    "litsx-jsx-tag-event-attribute": createLitsxTagAttributeRule(registration, "@"),
    "litsx-jsx-tag-prop-attribute": createLitsxTagAttributeRule(registration, "\\."),
    "litsx-jsx-evaluated-code": {
      begin: "\\{",
      beginCaptures: {
        0: {
          name: registration.name === "tsx"
            ? "punctuation.section.embedded.begin.tsx"
            : "punctuation.section.embedded.begin.js.jsx",
        },
      },
      contentName: registration.name === "tsx"
        ? "meta.embedded.expression.tsx"
        : "meta.embedded.expression.js.jsx",
      end: "\\}",
      endCaptures: {
        0: {
          name: registration.name === "tsx"
            ? "punctuation.section.embedded.end.tsx"
            : "punctuation.section.embedded.end.js.jsx",
        },
      },
      patterns: [
        { include: "#litsx-jsx-evaluated-code" },
        { include: "#expression" },
      ],
    },
    "litsx-styles-css": {
      patterns: [
        {
          begin: "(\\^)(styles)(\\s*\\()\\s*(`)",
          beginCaptures: {
            1: { name: "markup.italic.litsx keyword.operator.litsx" },
            2: { name: "markup.italic.litsx entity.name.hoist.litsx" },
            4: {
              name: registration.name === "tsx"
                ? "string.template.ts punctuation.definition.string.begin.ts"
                : "string.template.js punctuation.definition.string.begin.js",
            },
          },
          end: "(`)",
          endCaptures: {
            1: {
              name: registration.name === "tsx"
                ? "string.template.ts punctuation.definition.string.end.ts"
                : "string.template.js punctuation.definition.string.end.js",
            },
          },
          contentName: "meta.embedded.block.css",
          patterns: [
            { include: "#litsx-css-root" },
          ],
        },
      ],
    },
    "litsx-jsx-attributes": {
      patterns: [
        {
          match: "(@)([A-Za-z_][-A-Za-z0-9_:]*)(?=\\s*=)",
          captures: {
            1: { name: "keyword.operator.litsx" },
            2: { name: "entity.other.attribute-name.litsx" },
          },
        },
        {
          match: "(\\?)([A-Za-z_][-A-Za-z0-9_:]*)(?=\\s*=)",
          captures: {
            1: { name: "keyword.operator.litsx" },
            2: { name: "entity.other.attribute-name.litsx" },
          },
        },
        {
          match: "(\\.)([A-Za-z_][-A-Za-z0-9_:]*)(?=\\s*=)",
          captures: {
            1: { name: "keyword.operator.litsx" },
            2: { name: "entity.other.attribute-name.litsx" },
          },
        },
      ],
    },
  };

  if (grammar.repository["jsx-tag"]) {
    grammar.repository["jsx-tag"].begin = allowQuestionMarkAttributes(grammar.repository["jsx-tag"].begin);
    if (Array.isArray(grammar.repository["jsx-tag"].patterns)) {
      for (const pattern of grammar.repository["jsx-tag"].patterns) {
        if (pattern?.begin) {
          pattern.begin = allowQuestionMarkAttributes(pattern.begin);
        }
      }
    }
  }

  if (grammar.repository["jsx-tag-in-expression"]) {
    grammar.repository["jsx-tag-in-expression"].begin = allowQuestionMarkAttributes(
      grammar.repository["jsx-tag-in-expression"].begin,
    );
    grammar.repository["jsx-tag-in-expression"].end = allowQuestionMarkAttributes(
      grammar.repository["jsx-tag-in-expression"].end,
    );
  }

  if (grammar.repository["jsx-tag-attributes"]?.patterns) {
    grammar.repository["jsx-tag-attributes"].patterns = [
      { include: "#litsx-jsx-tag-attribute" },
      ...grammar.repository["jsx-tag-attributes"].patterns,
    ];
  }

  if (grammar.repository.expression?.patterns) {
    grammar.repository.expression.patterns = [
      { include: "#litsx-styles-css" },
      { include: "#litsx-hoists" },
      ...grammar.repository.expression.patterns,
    ];
  }

  if (grammar.repository["expressionWithoutIdentifiers"]?.patterns) {
    grammar.repository["expressionWithoutIdentifiers"].patterns = [
      { include: "#litsx-styles-css" },
      { include: "#litsx-hoists" },
      ...grammar.repository["expressionWithoutIdentifiers"].patterns,
    ];
  }

  return grammar;
}

export const litsxTsxLanguage = createLitsxAwareLanguage(tsxLanguage[0]);
export const litsxJsxLanguage = createLitsxAwareLanguage(jsxLanguage[0]);

export function litsxCodeLanguages() {
  return [litsxTsxLanguage, litsxJsxLanguage];
}

export function litsxVitePressMarkdown() {
  return {
    languages: litsxCodeLanguages(),
  };
}
