import MagicString from "magic-string";

const PREFIX_TO_KIND = {
  "@": "event",
  ".": "prop",
  "?": "bool",
};

const KIND_TO_PREFIX = {
  event: "@",
  prop: ".",
  bool: "?",
};

const ATTR_NAME_CHAR = /[\w:-]/;
const TAG_NAME_START_CHAR = /[A-Za-z]/;
const TAG_NAME_CHAR = /[\w:.-]/;
const MACRO_NAME_START_CHAR = /[A-Za-z$_]/;
const MACRO_NAME_CHAR = /[A-Za-z0-9$_]/;
const IDENTIFIER_START_CHAR = /[A-Za-z$_]/;
const IDENTIFIER_CHAR = /[A-Za-z0-9$_]/;

function isWhitespace(char) {
  return char === " " || char === "\t" || char === "\n" || char === "\r";
}

function isReservedVirtualAttributeName(name) {
  return /^__litsx_(event|prop|bool)_/.test(name);
}

function sanitizeIdentifierTailChar(char) {
  return /[A-Za-z0-9$_]/.test(char) ? char : "_";
}

function encodeEditorVirtualAttributeName(name) {
  const prefix = name[0];
  const localName = name.slice(1);

  if (prefix === "@") {
    return `e${Array.from(localName, sanitizeIdentifierTailChar).join("")}`;
  }

  if (prefix === ".") {
    return `p${Array.from(localName, sanitizeIdentifierTailChar).join("")}`;
  }

  if (prefix === "?") {
    return `b${Array.from(localName, sanitizeIdentifierTailChar).join("")}`;
  }

  return name;
}

function encodeEditorStaticHoistName(originalName, macroName) {
  if (!originalName.startsWith("^") || originalName.length < 2) {
    return originalName;
  }

  return `$${macroName}`;
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
      index = scanBalancedBraces(sourceText, index + 1);
      continue;
    }
    index += 1;
  }

  return index;
}

function scanBalancedBraces(sourceText, start) {
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

    if (char === "{") {
      depth += 1;
      index += 1;
      continue;
    }

    if (char === "}") {
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

function scanBalancedParens(sourceText, start) {
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

    if (char === "(") {
      depth += 1;
      index += 1;
      continue;
    }

    if (char === ")") {
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

function scanBalancedBracesWithJsx(sourceText, start, replacements, encodeAttributeName) {
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

    if (char === "<" && isLikelyJsxTagStart(sourceText, index)) {
      index = scanJsxElement(sourceText, index, replacements, encodeAttributeName);
      continue;
    }

    if (char === "{") {
      depth += 1;
      index += 1;
      continue;
    }

    if (char === "}") {
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

function trimTrailingWhitespaceAndComments(sourceText) {
  let text = sourceText;
  let changed = true;

  while (changed) {
    changed = false;

    const trimmedWhitespace = text.replace(/\s+$/u, "");
    if (trimmedWhitespace !== text) {
      text = trimmedWhitespace;
      changed = true;
    }

    const trimmedLineComment = text.replace(/\/\/[^\n\r]*$/u, "");
    if (trimmedLineComment !== text) {
      text = trimmedLineComment;
      changed = true;
      continue;
    }

    const trimmedBlockComment = text.replace(/\/\*[\s\S]*?\*\/$/u, "");
    if (trimmedBlockComment !== text) {
      text = trimmedBlockComment;
      changed = true;
    }
  }

  return text;
}

function previousSignificantIndex(sourceText, start) {
  let index = start - 1;
  while (index >= 0 && isWhitespace(sourceText[index])) {
    index -= 1;
  }
  return index;
}

function readPreviousWord(sourceText, endIndex) {
  let index = endIndex;
  while (index >= 0 && /[A-Za-z]/.test(sourceText[index])) {
    index -= 1;
  }
  return sourceText.slice(index + 1, endIndex + 1);
}

function isLikelyJsxTagStart(sourceText, index) {
  const next = sourceText[index + 1];
  if (!TAG_NAME_START_CHAR.test(next || "")) {
    return false;
  }

  const previousIndex = previousSignificantIndex(sourceText, index);
  if (previousIndex < 0) {
    return true;
  }

  const previousChar = sourceText[previousIndex];
  if ("=({[,!?:;>&|".includes(previousChar)) {
    return true;
  }

  const previousWord = readPreviousWord(sourceText, previousIndex);
  return ["return", "case", "throw", "yield", "else"].includes(previousWord);
}

function readJsxTagName(sourceText, start) {
  let index = start + 1;
  const isClosing = sourceText[index] === "/";

  if (isClosing) {
    index += 1;
  }

  if (!TAG_NAME_START_CHAR.test(sourceText[index] || "")) {
    return null;
  }

  const nameStart = index;

  while (index < sourceText.length && TAG_NAME_CHAR.test(sourceText[index])) {
    index += 1;
  }

  return {
    name: sourceText.slice(nameStart, index),
    isClosing,
    end: index,
  };
}

function scanJsxTag(sourceText, start, replacements, encodeAttributeName) {
  const tag = readJsxTagName(sourceText, start);

  if (!tag) {
    return {
      end: start + 1,
      tagName: null,
      isClosing: false,
      selfClosing: false,
    };
  }

  let index = tag.end;

  if (tag.isClosing) {
    while (index < sourceText.length) {
      if (sourceText[index] === ">") {
        return {
          end: index + 1,
          tagName: tag.name,
          isClosing: true,
          selfClosing: false,
        };
      }

      index += 1;
    }

    return {
      end: index,
      tagName: tag.name,
      isClosing: true,
      selfClosing: false,
    };
  }

  function scanAttributeValue(valueStart) {
    let valueIndex = valueStart;

    while (valueIndex < sourceText.length && isWhitespace(sourceText[valueIndex])) {
      valueIndex += 1;
    }

    if (valueIndex >= sourceText.length) {
      return valueIndex;
    }

    const valueChar = sourceText[valueIndex];
    if (valueChar === "{") {
      return scanBalancedBracesWithJsx(
        sourceText,
        valueIndex,
        replacements,
        encodeAttributeName
      );
    }

    if (valueChar === "'" || valueChar === "\"") {
      return scanQuotedString(sourceText, valueIndex, valueChar);
    }

    while (
      valueIndex < sourceText.length &&
      !isWhitespace(sourceText[valueIndex]) &&
      sourceText[valueIndex] !== ">" &&
      !(sourceText[valueIndex] === "/" && sourceText[valueIndex + 1] === ">")
    ) {
      valueIndex += 1;
    }

    return valueIndex;
  }

  while (index < sourceText.length) {
    const char = sourceText[index];
    const next = sourceText[index + 1];

    if (char === ">") {
      return {
        end: index + 1,
        tagName: tag.name,
        isClosing: false,
        selfClosing: false,
      };
    }

    if (char === "/" && next === ">") {
      return {
        end: index + 2,
        tagName: tag.name,
        isClosing: false,
        selfClosing: true,
      };
    }

    if (isWhitespace(char)) {
      index += 1;
      continue;
    }

    if (char === "{") {
      index = scanBalancedBracesWithJsx(
        sourceText,
        index,
        replacements,
        encodeAttributeName
      );
      continue;
    }

    if (char === "'" || char === "\"") {
      index = scanQuotedString(sourceText, index, char);
      continue;
    }

    if (Object.hasOwn(PREFIX_TO_KIND, char) && ATTR_NAME_CHAR.test(next || "")) {
      const attrStart = index;
      index += 1;

      while (index < sourceText.length && ATTR_NAME_CHAR.test(sourceText[index])) {
        index += 1;
      }

      const originalName = sourceText.slice(attrStart, index);
      replacements.push({
        start: attrStart,
        end: index,
        originalName,
        replacement: encodeAttributeName(originalName),
      });

      while (index < sourceText.length && isWhitespace(sourceText[index])) {
        index += 1;
      }
      if (sourceText[index] === "=") {
        index = scanAttributeValue(index + 1);
      }
      continue;
    }

    const attrStart = index;
    while (
      index < sourceText.length &&
      !isWhitespace(sourceText[index]) &&
      sourceText[index] !== "=" &&
      sourceText[index] !== ">" &&
      !(sourceText[index] === "/" && sourceText[index + 1] === ">")
    ) {
      index += 1;
    }

    if (index === attrStart) {
      index += 1;
      continue;
    }

    while (index < sourceText.length && isWhitespace(sourceText[index])) {
      index += 1;
    }
    if (sourceText[index] === "=") {
      index = scanAttributeValue(index + 1);
    }
  }

  return {
    end: index,
    tagName: tag.name,
    isClosing: false,
    selfClosing: false,
  };
}

function scanJsxOpeningTag(sourceText, start, replacements, encodeAttributeName) {
  return scanJsxTag(sourceText, start, replacements, encodeAttributeName).end;
}

function scanJsxElement(sourceText, start, replacements, encodeAttributeName) {
  const openingTag = scanJsxTag(sourceText, start, replacements, encodeAttributeName);

  if (
    openingTag.isClosing ||
    openingTag.selfClosing ||
    !openingTag.tagName
  ) {
    return openingTag.end;
  }

  let index = openingTag.end;

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

    if (char === "{") {
      index = scanBalancedBracesWithJsx(
        sourceText,
        index,
        replacements,
        encodeAttributeName
      );
      continue;
    }

    if (char === "<") {
      const nestedTag = readJsxTagName(sourceText, index);

      if (!nestedTag) {
        index += 1;
        continue;
      }

      if (nestedTag.isClosing && nestedTag.name === openingTag.tagName) {
        return scanJsxTag(sourceText, index, replacements, encodeAttributeName).end;
      }

      if (!nestedTag.isClosing) {
        index = scanJsxElement(sourceText, index, replacements, encodeAttributeName);
        continue;
      }
    }

    index += 1;
  }

  return index;
}

export function encodeVirtualAttributeName(name) {
  const prefix = name[0];
  const localName = name.slice(1);
  const kind = PREFIX_TO_KIND[prefix];

  if (!kind) {
    return name;
  }

  return `__litsx_${kind}_${localName}`;
}

export function decodeVirtualAttributeName(name) {
  const match = /^__litsx_(event|prop|bool)_(.+)$/.exec(name);

  if (!match) {
    return null;
  }

  const [, kind, localName] = match;
  return `${KIND_TO_PREFIX[kind]}${localName}`;
}

export function decodeVirtualStaticHoistName(name) {
  const match = /^__litsx_static_([A-Za-z$_][A-Za-z0-9$_]*)$/.exec(name);

  if (!match) {
    return null;
  }

  return `^${match[1]}`;
}

export function remapVirtualText(text) {
  if (typeof text !== "string") {
    return text;
  }

  return text
    .replace(/__litsx_(event|prop|bool)_[\w:-]+/g, (name) => (
      decodeVirtualAttributeName(name) ?? name
    ))
    .replace(/__litsx_static_[A-Za-z$_][A-Za-z0-9$_]*/g, (name) => (
      decodeVirtualStaticHoistName(name) ?? name
    ));
}

export function looksLikeLitsxJsx(sourceText) {
  return (
    /<[\w.-]+[^>]*\s(?:[@.?][\w:-]+)/m.test(sourceText) ||
    /(?:^|[;{}]\s*)\^[A-Za-z$_][A-Za-z0-9$_]*/m.test(sourceText) ||
    /^\s*\^[A-Za-z$_][A-Za-z0-9$_]*/m.test(sourceText)
  );
}

function isLikelyStaticMacroStart(sourceText, index) {
  const next = sourceText[index + 1];
  if (!MACRO_NAME_START_CHAR.test(next || "")) {
    return false;
  }

  const prefix = trimTrailingWhitespaceAndComments(sourceText.slice(0, index));
  if (!prefix) {
    return true;
  }

  const previousChar = prefix[prefix.length - 1];
  return previousChar === ";" || previousChar === "{" || previousChar === "}";
}

function scanStaticMacro(sourceText, start, replacements, encodeMacroName) {
  let index = start + 1;

  while (index < sourceText.length && MACRO_NAME_CHAR.test(sourceText[index])) {
    index += 1;
  }

  const originalName = sourceText.slice(start, index);
  const macroName = originalName.slice(1);

  if (macroName === "mixins") {
    return index;
  }

  replacements.push({
    start,
    end: index,
    originalName,
    replacement: encodeMacroName(originalName, macroName),
  });

  return index;
}

function isWordBoundary(char) {
  return !char || !IDENTIFIER_CHAR.test(char);
}

function skipWhitespaceAndComments(sourceText, start) {
  let index = start;

  while (index < sourceText.length) {
    const char = sourceText[index];
    const next = sourceText[index + 1];

    if (isWhitespace(char)) {
      index += 1;
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

    break;
  }

  return index;
}

function readIdentifier(sourceText, start) {
  if (!IDENTIFIER_START_CHAR.test(sourceText[start] || "")) {
    return null;
  }

  let index = start + 1;
  while (index < sourceText.length && IDENTIFIER_CHAR.test(sourceText[index])) {
    index += 1;
  }

  return {
    name: sourceText.slice(start, index),
    end: index,
  };
}

export function createVirtualLitsxJsxSource(sourceText, options = {}) {
  const strategy = options.strategy === "editor" ? "editor" : "compiler";
  const includeSourceMap = options.sourceMap === true;
  const encodeAttributeName =
    strategy === "editor"
      ? encodeEditorVirtualAttributeName
      : encodeVirtualAttributeName;
  const encodeMacroName =
    strategy === "editor"
      ? encodeEditorStaticHoistName
      : (_originalName, macroName) => `__litsx_static_${macroName}`;

  if (!sourceText || typeof sourceText !== "string") {
    return {
      code: sourceText,
      map: null,
      replacements: [],
    };
  }

  if (strategy === "compiler" && sourceText.includes("__litsx_")) {
    return {
      code: sourceText,
      map: null,
      replacements: [],
      collision: true,
    };
  }

  if (!looksLikeLitsxJsx(sourceText)) {
    return {
      code: sourceText,
      map: null,
      replacements: [],
    };
  }

  const replacements = [];
  let index = 0;
  let braceDepth = 0;

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

    if (char === "<" && isLikelyJsxTagStart(sourceText, index)) {
      index = scanJsxElement(sourceText, index, replacements, encodeAttributeName);
      continue;
    }

    if (char === "^" && isLikelyStaticMacroStart(sourceText, index)) {
      index = scanStaticMacro(sourceText, index, replacements, encodeMacroName);
      continue;
    }

    if (char === "{") {
      braceDepth += 1;
      index += 1;
      continue;
    }

    if (char === "}") {
      braceDepth = Math.max(0, braceDepth - 1);
      index += 1;
      continue;
    }

    index += 1;
  }

  if (!replacements.length) {
    return {
      code: sourceText,
      map: null,
      replacements: [],
    };
  }

  let lastIndex = 0;
  let transformed = "";

  for (const replacement of replacements) {
    transformed += sourceText.slice(lastIndex, replacement.start);
    transformed += replacement.replacement;
    lastIndex = replacement.end;
  }

  transformed += sourceText.slice(lastIndex);

  return {
    code: transformed,
    map: includeSourceMap
      ? createVirtualLitsxJsxSourceMap(sourceText, replacements, {
        sourceFileName: options.sourceFileName,
      })
      : null,
    replacements,
  };
}

export function createVirtualLitsxJsxSourceMap(
  sourceText,
  replacements = [],
  options = {}
) {
  const editable = new MagicString(sourceText);
  applyVirtualAttributeReplacements(editable, replacements);

  return editable.generateMap({
    hires: true,
    source: options.sourceFileName,
    includeContent: true,
  });
}

function findReplacementByOriginalPosition(position, replacements) {
  return replacements.find((replacement) => (
    position >= replacement.start && position < replacement.end
  )) || null;
}

function findReplacementByVirtualPosition(position, replacements) {
  let virtualCursor = 0;

  for (const replacement of replacements) {
    const untouchedLength = replacement.start - virtualCursor;
    const replacementVirtualStart = virtualCursor + untouchedLength;
    const replacementVirtualEnd =
      replacementVirtualStart + replacement.replacement.length;

    if (position >= replacementVirtualStart && position < replacementVirtualEnd) {
      return {
        replacement,
        virtualStart: replacementVirtualStart,
        virtualEnd: replacementVirtualEnd,
      };
    }

    virtualCursor = replacementVirtualEnd + (replacement.end - replacement.start);
  }

  return null;
}

export function mapOriginalPositionToVirtual(position, replacements = []) {
  if (!replacements.length) {
    return position;
  }

  let offset = 0;

  for (const replacement of replacements) {
    if (position < replacement.start) {
      break;
    }

    const originalLength = replacement.end - replacement.start;
    const replacementLength = replacement.replacement.length;

    if (position < replacement.end) {
      return replacement.start + offset;
    }

    offset += replacementLength - originalLength;
  }

  return position + offset;
}

export function remapTextSpanToOriginal(span, replacements = []) {
  if (!span || !replacements.length) {
    return span;
  }

  const startMapping = findReplacementByVirtualPosition(span.start, replacements);
  if (startMapping) {
    return {
      start: startMapping.replacement.start,
      length: startMapping.replacement.end - startMapping.replacement.start,
    };
  }

  let originalStart = span.start;
  let originalEnd = span.start + span.length;

  for (const replacement of replacements) {
    const originalLength = replacement.end - replacement.start;
    const replacementLength = replacement.replacement.length;
    const delta = originalLength - replacementLength;
    const virtualStart = mapOriginalPositionToVirtual(replacement.start, replacements);
    const virtualEnd = virtualStart + replacementLength;

    if (virtualEnd <= span.start) {
      originalStart += delta;
      originalEnd += delta;
      continue;
    }

    if (virtualStart < span.start) {
      originalStart = replacement.start;
    }

    if (virtualStart < span.start + span.length) {
      originalEnd += delta;
    }
  }

  return {
    start: originalStart,
    length: Math.max(0, originalEnd - originalStart),
  };
}

export function remapVirtualPositionToOriginal(position, replacements = []) {
  const span = remapTextSpanToOriginal({ start: position, length: 0 }, replacements);
  return span.start;
}

export const mapVirtualPositionToOriginal = remapVirtualPositionToOriginal;

export function applyVirtualAttributeReplacements(editable, replacements = []) {
  for (const replacement of replacements) {
    editable.overwrite(replacement.start, replacement.end, replacement.replacement);
  }
}

export {
  isReservedVirtualAttributeName,
};
