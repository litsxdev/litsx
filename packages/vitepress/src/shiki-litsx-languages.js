import tsxLanguage from "shiki/dist/langs/tsx.mjs";
import jsxLanguage from "shiki/dist/langs/jsx.mjs";

function cloneLanguageRegistration(registration) {
  return JSON.parse(JSON.stringify(registration));
}

function createLitsxAwareLanguage(registration) {
  const grammar = cloneLanguageRegistration(registration);
  const originalPatterns = Array.isArray(grammar.patterns) ? grammar.patterns : [];
  const originalRepository = grammar.repository || {};

  grammar.patterns = [
    { include: "#litsx-hoists" },
    { include: "#litsx-jsx-attributes" },
    ...originalPatterns,
  ];

  grammar.repository = {
    ...originalRepository,
    "litsx-hoists": {
      patterns: [
        {
          match: "(\\^)([A-Za-z_$][\\w$]*)(?=\\s*\\()",
          captures: {
            1: { name: "keyword.operator.litsx" },
            2: { name: "entity.name.function.litsx" },
          },
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
