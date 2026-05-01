const STANDARD_LITSX_LANGUAGE_BY_SOURCE = {
  javascriptreact: "litsx-jsx",
  typescriptreact: "litsx",
};
const SOURCE_LANGUAGE_BY_LITSX = {
  "litsx-jsx": "javascriptreact",
  litsx: "typescriptreact",
};

const LITSX_SYNTAX_PATTERNS = [
  /<[^>]*\s@[A-Za-z_][\w:-]*(?=[\s=>/])/m,
  /<[^>]*\s\.[A-Za-z_][\w:-]*(?=[\s=>/])/m,
  /<[^>]*\s\?[A-Za-z_][\w:-]*(?=[\s=>/])/m,
  /(^|\n)\s*\^[A-Za-z_][\w]*\s*\(/m,
];

function detectLitsxSyntax(text) {
  if (typeof text !== "string" || text.length === 0) {
    return false;
  }

  return LITSX_SYNTAX_PATTERNS.some((pattern) => pattern.test(text));
}

function getSuggestedLitsxLanguageId(languageId) {
  return STANDARD_LITSX_LANGUAGE_BY_SOURCE[languageId] ?? null;
}

function isStandardJsxLanguage(languageId) {
  return getSuggestedLitsxLanguageId(languageId) != null;
}

function getStandardLanguageId(languageId) {
  return SOURCE_LANGUAGE_BY_LITSX[languageId] ?? null;
}

export {
  STANDARD_LITSX_LANGUAGE_BY_SOURCE,
  SOURCE_LANGUAGE_BY_LITSX,
  detectLitsxSyntax,
  getSuggestedLitsxLanguageId,
  getStandardLanguageId,
  isStandardJsxLanguage,
};
