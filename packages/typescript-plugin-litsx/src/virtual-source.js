import * as babelParser from "@babel/parser";
import {
  createVirtualLitsxJsxSource,
  decodeVirtualAttributeName,
  looksLikeLitsxJsx,
  mapOriginalPositionToVirtual,
  remapTextSpanToOriginal,
  remapVirtualText,
} from "../../jsx-authoring/src/index.js";

const STATIC_HOIST_CALL_RE = /\b(__litsx_static_[A-Za-z_$][\w$]*)\s*\(/g;

export function createToolingVirtualLitsxSource(sourceText, options = {}) {
  const virtualization = createVirtualLitsxJsxSource(sourceText, options);
  const hoistNames = new Set();

  for (const match of virtualization.code.matchAll(STATIC_HOIST_CALL_RE)) {
    hoistNames.add(match[1]);
  }

  if (hoistNames.size === 0) {
    return {
      ...virtualization,
      toolingPreamble: "",
      toolingPreambleLength: 0,
    };
  }

  const toolingDeclarations = [];

  toolingDeclarations.push(
    ...Array.from(hoistNames)
      .sort()
      .map((name) => (
        name === "__litsx_static_lightDom"
          ? "declare function __litsx_static_lightDom(): void;\n"
          : `declare function ${name}<T = unknown>(value: T): T;\n`
      ))
  );

  const toolingPreamble = toolingDeclarations.join("");

  return {
    ...virtualization,
    code: `${toolingPreamble}${virtualization.code}`,
    toolingPreamble,
    toolingPreambleLength: toolingPreamble.length,
  };
}

export function mapOriginalPositionToToolingVirtual(position, virtualization) {
  return mapOriginalPositionToVirtual(position, virtualization.replacements) + (virtualization.toolingPreambleLength ?? 0);
}

export function remapToolingTextSpanToOriginal(span, virtualization) {
  if (!span) {
    return span;
  }

  const preambleLength = virtualization.toolingPreambleLength ?? 0;
  const start = Math.max(0, (span.start ?? 0) - preambleLength);

  return remapTextSpanToOriginal(
    {
      start,
      length: span.length ?? 0,
    },
    virtualization.replacements,
  );
}

const EVENT_COMPLETIONS = [
  "click",
  "input",
  "change",
  "focus",
  "blur",
  "keydown",
  "keyup",
  "submit",
  "pointerdown",
  "pointerup",
];

const EVENT_COMPLETIONS_BY_TAG = {
  input: ["input", "change", "focus", "blur", "keydown", "keyup"],
  textarea: ["input", "change", "focus", "blur", "keydown", "keyup"],
  button: ["click", "focus", "blur", "keydown", "keyup"],
  form: ["submit", "change", "input"],
  video: ["play", "pause", "timeupdate", "loadedmetadata", "volumechange"],
  audio: ["play", "pause", "timeupdate", "loadedmetadata", "volumechange"],
  "suspense-boundary": ["transitionend", "animationend"],
};

const BOOL_COMPLETIONS = [
  "disabled",
  "hidden",
  "checked",
  "selected",
  "open",
  "required",
  "readonly",
];

const BOOL_COMPLETIONS_BY_TAG = {
  input: ["disabled", "checked", "required", "readonly"],
  textarea: ["disabled", "required", "readonly"],
  button: ["disabled"],
  option: ["disabled", "selected"],
  details: ["open"],
  dialog: ["open"],
  "suspense-boundary": ["pending", "resolved"],
};

const PROP_COMPLETIONS_BY_TAG = {
  input: ["value", "checked", "files", "valueAsNumber", "selectionStart"],
  textarea: ["value", "selectionStart", "selectionEnd"],
  select: ["value", "selectedIndex"],
  option: ["selected", "value"],
  video: ["currentTime", "muted", "volume", "playbackRate"],
  audio: ["currentTime", "muted", "volume", "playbackRate"],
  "suspense-boundary": ["fallbackRenderer", "contentRenderer", "pending", "resolved", "showing", "phase"],
  "suspense-list": ["revealOrder", "tail"],
};

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

function collectStaticHoistDiagnostics(ast, ts, virtualization) {
  const errorCategory = ts?.DiagnosticCategory?.Error ?? 1;
  const diagnostics = [];

  function visit(node, parent = null, functionBody = null) {
    if (!node || typeof node !== "object") {
      return;
    }

    let nextFunctionBody = functionBody;
    if (
      (node.type === "FunctionDeclaration" ||
        node.type === "FunctionExpression" ||
        node.type === "ArrowFunctionExpression") &&
      node.body?.type === "BlockStatement"
    ) {
      nextFunctionBody = node.body;
    }

    if (
      node.type === "CallExpression" &&
      node.callee?.type === "Identifier" &&
      typeof node.callee.name === "string" &&
      node.callee.name.startsWith("__litsx_static_")
    ) {
      const macroName = node.callee.name.slice("__litsx_static_".length);
      const isTopLevelStatement =
        parent?.type === "ExpressionStatement" &&
        functionBody?.type === "BlockStatement" &&
        Array.isArray(functionBody.body) &&
        functionBody.body.includes(parent);

      if (!isTopLevelStatement) {
        diagnostics.push({
          ...remapTextSpanToOriginal(
            {
              start: node.callee.start ?? node.start ?? 0,
              length: (node.callee.end ?? node.end ?? 0) - (node.callee.start ?? node.start ?? 0),
            },
            virtualization.replacements,
          ),
          category: errorCategory,
          code: 91007,
          source: "@litsx/typescript-plugin",
          messageText: `^${macroName}(...) must appear as a top-level statement in the component body.`,
        });
      }
    }

    for (const value of Object.values(node)) {
      if (Array.isArray(value)) {
        for (const item of value) {
          visit(item, node, nextFunctionBody);
        }
        continue;
      }

      visit(value, node, nextFunctionBody);
    }
  }

  visit(ast.program ?? ast, null, null);
  return diagnostics;
}

function collectPatternNames(pattern, names) {
  if (!pattern || typeof pattern !== "object") {
    return;
  }

  if (pattern.type === "Identifier" && typeof pattern.name === "string") {
    names.add(pattern.name);
    return;
  }

  if (pattern.type === "ObjectPattern" && Array.isArray(pattern.properties)) {
    for (const property of pattern.properties) {
      if (property?.type === "RestElement") {
        collectPatternNames(property.argument, names);
        continue;
      }

      collectPatternNames(property?.value ?? property?.argument, names);
    }
    return;
  }

  if (pattern.type === "ArrayPattern" && Array.isArray(pattern.elements)) {
    for (const element of pattern.elements) {
      collectPatternNames(element, names);
    }
    return;
  }

  if (pattern.type === "AssignmentPattern") {
    collectPatternNames(pattern.left, names);
    return;
  }

  if (pattern.type === "RestElement") {
    collectPatternNames(pattern.argument, names);
  }
}

function collectJsxAttributes(ast) {
  const attributes = [];

  walk(ast, (node) => {
    if (
      node?.type === "JSXAttribute" &&
      node.name?.type === "JSXIdentifier" &&
      typeof node.name.name === "string"
    ) {
      const openingElement = node.__openingElement;
      let tagName = null;

      if (openingElement?.name?.type === "JSXIdentifier") {
        tagName = openingElement.name.name;
      } else if (openingElement?.name?.type === "JSXNamespacedName") {
        tagName = `${openingElement.name.namespace.name}:${openingElement.name.name.name}`;
      } else if (openingElement?.name?.type === "JSXMemberExpression") {
        tagName = openingElement.name.property?.name ?? null;
      }

      attributes.push(node);
      Object.defineProperty(node, "__litsxTagName", {
        value: tagName,
        configurable: true,
        enumerable: false,
        writable: true,
      });
    }

    if (node?.type === "JSXOpeningElement" && Array.isArray(node.attributes)) {
      for (const attribute of node.attributes) {
        if (attribute && typeof attribute === "object") {
          Object.defineProperty(attribute, "__openingElement", {
            value: node,
            configurable: true,
            enumerable: false,
            writable: true,
          });
        }
      }
    }
  });

  return attributes;
}

function isNativeIntrinsicTagName(tagName) {
  return typeof tagName === "string" && /^[a-z]/.test(tagName);
}

export function collectLitsxAuthoredDiagnostics(sourceText, ts, options = {}) {
  const errorCategory = ts?.DiagnosticCategory?.Error ?? 1;
  const warningCategory = ts?.DiagnosticCategory?.Warning ?? 0;
  const plugins = Array.from(new Set(["jsx", ...(options.plugins ?? [])]));
  const virtualization = createVirtualLitsxJsxSource(sourceText);
  let ast;

  try {
    ast = babelParser.parse(virtualization.code, {
      sourceType: "module",
      plugins,
    });
  } catch {
    return [];
  }

  const diagnostics = [];
  const attributes = collectJsxAttributes(ast);
  diagnostics.push(...collectStaticHoistDiagnostics(ast, ts, virtualization));

  for (const attribute of attributes) {
    const tagName = attribute.__litsxTagName;
    const attributeValue = attribute.value;
    const virtualSpan = {
      start: attribute.name.start ?? attribute.start ?? 0,
      length: (attribute.name.end ?? attribute.end ?? 0) - (attribute.name.start ?? attribute.start ?? 0),
    };
    const span = remapTextSpanToOriginal(virtualSpan, virtualization.replacements);
    const rawAttributeName = attribute.name.name;
    const attributeName = decodeVirtualAttributeName(rawAttributeName);

    if (!attributeName) {
      if (rawAttributeName === "className" && isNativeIntrinsicTagName(tagName)) {
        diagnostics.push({
          ...span,
          category: warningCategory,
          code: 91008,
          source: "@litsx/typescript-plugin",
          messageText:
            '`className` is not native LitSX syntax. Use `class` in native LitSX, or add the React compatibility layer to rewrite `className`.',
        });
      }
      continue;
    }

    const prefix = attributeName[0];
    const localName = attributeName.slice(1);

    if ((prefix === "@" || prefix === ".") && attributeValue?.type !== "JSXExpressionContainer") {
      diagnostics.push({
        ...span,
        category: errorCategory,
        code: 91001,
        source: "@litsx/typescript-plugin",
        messageText:
          prefix === "@"
            ? `Lit listener binding "${attributeName}" must use an expression, for example ${attributeName}={handler}.`
            : `Lit property binding "${attributeName}" must use an expression, for example ${attributeName}={value}.`,
      });
      continue;
    }

    if (prefix === "?" && attributeValue?.type && attributeValue.type !== "JSXExpressionContainer") {
      diagnostics.push({
        ...span,
        category: errorCategory,
        code: 91002,
        source: "@litsx/typescript-plugin",
        messageText:
          `Lit boolean binding "${attributeName}" must be bare or use an expression, for example ${attributeName} or ${attributeName}={condition}.`,
      });
      continue;
    }

    if (
      attributeValue?.type === "JSXExpressionContainer" &&
      attributeValue.expression?.type === "JSXEmptyExpression"
    ) {
      diagnostics.push({
        ...span,
        category: errorCategory,
        code: 91003,
        source: "@litsx/typescript-plugin",
        messageText: `Lit binding "${attributeName}" cannot use an empty expression.`,
      });
    }

    if (
      prefix === "@" &&
      tagName &&
      Object.hasOwn(EVENT_COMPLETIONS_BY_TAG, tagName) &&
      !EVENT_COMPLETIONS_BY_TAG[tagName].includes(localName)
    ) {
      diagnostics.push({
        ...span,
        category: warningCategory,
        code: 91006,
        source: "@litsx/typescript-plugin",
        messageText:
          `Listener binding "${attributeName}" is not in the known Litsx event set for <${tagName}>.`,
      });
    }

    if (
      prefix === "." &&
      tagName &&
      Object.hasOwn(PROP_COMPLETIONS_BY_TAG, tagName) &&
      !PROP_COMPLETIONS_BY_TAG[tagName].includes(localName)
    ) {
      diagnostics.push({
        ...span,
        category: warningCategory,
        code: 91004,
        source: "@litsx/typescript-plugin",
        messageText:
          `Property binding "${attributeName}" is not in the known Litsx property set for <${tagName}>.`,
      });
    }

    if (
      prefix === "?" &&
      tagName &&
      Object.hasOwn(BOOL_COMPLETIONS_BY_TAG, tagName) &&
      !BOOL_COMPLETIONS_BY_TAG[tagName].includes(localName)
    ) {
      diagnostics.push({
        ...span,
        category: warningCategory,
        code: 91005,
        source: "@litsx/typescript-plugin",
        messageText:
          `Boolean binding "${attributeName}" is not in the known Litsx boolean attribute set for <${tagName}>.`,
      });
    }
  }

  return diagnostics;
}
export function inferLitsxAttributeCompletionContext(sourceText, position) {
  const prefixText = sourceText.slice(0, position);
  const lastOpen = prefixText.lastIndexOf("<");
  const lastClose = prefixText.lastIndexOf(">");

  if (lastOpen === -1 || lastClose > lastOpen) {
    return null;
  }

  const openingSegment = prefixText.slice(lastOpen + 1);
  const tagMatch = /^([A-Za-z][\w:-]*)/.exec(openingSegment.trimStart());

  if (!tagMatch) {
    return null;
  }

  const attrMatch = /(?:^|\s)([@.?])([\w:-]*)$/.exec(openingSegment);

  if (!attrMatch) {
    return null;
  }

  const [, prefix, partialName] = attrMatch;
  return {
    tagName: tagMatch[1],
    prefix,
    partialName,
  };
}

export function getLitsxAttributeCompletionNames(context) {
  if (!context) {
    return [];
  }

  let candidates = [];

  switch (context.prefix) {
    case "@":
      candidates = EVENT_COMPLETIONS_BY_TAG[context.tagName] ?? EVENT_COMPLETIONS;
      break;
    case "?":
      candidates = BOOL_COMPLETIONS_BY_TAG[context.tagName] ?? BOOL_COMPLETIONS;
      break;
    case ".":
      candidates = PROP_COMPLETIONS_BY_TAG[context.tagName] ?? ["value"];
      break;
    default:
      return [];
  }

  return candidates
    .filter((name) => name.startsWith(context.partialName))
    .map((name) => `${context.prefix}${name}`);
}

export {
  createVirtualLitsxJsxSource,
  decodeVirtualAttributeName,
  looksLikeLitsxJsx,
  mapOriginalPositionToVirtual,
  remapTextSpanToOriginal,
  remapVirtualText,
};
