import * as babelParser from "@babel/parser";
import {
  createVirtualLitsxJsxSource,
  decodeVirtualAttributeName,
  decodeVirtualStaticHoistName,
  looksLikeLitsxJsx,
  mapOriginalPositionToVirtual,
  remapTextSpanToOriginal,
  remapVirtualText,
} from "../../jsx-authoring/src/index.js";

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

const STATIC_HOIST_CALL_RE = /\b(__litsx_static_[A-Za-z_$][\w$]*)\s*\(/g;
const NATIVE_STATIC_HOISTS = new Set([
  "styles",
  "properties",
  "shadowRootOptions",
  "lightDom",
]);
const SINGLETON_STATIC_HOISTS = new Set([
  "styles",
  "properties",
  "shadowRootOptions",
  "lightDom",
]);

const STATIC_HOIST_DOCUMENTATION_BY_NAME = {
  "^styles": "LitSX static style hoist. Declare component-scoped styles before render-time statements.",
  "^properties": "LitSX static properties hoist. Declare reactive property metadata before render-time statements.",
  "^shadowRootOptions": "LitSX static shadow root options hoist. Declare shadow root configuration before render-time statements.",
  "^lightDom": "LitSX static light DOM hoist. Declare light DOM rendering before render-time statements.",
};

function scanStaticHoistParens(sourceText, start) {
  let depth = 0;
  let index = start;

  while (index < sourceText.length) {
    const char = sourceText[index];

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

function levenshteinDistance(left, right) {
  if (left === right) return 0;
  if (left.length === 0) return right.length;
  if (right.length === 0) return left.length;

  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  const current = new Array(right.length + 1);

  for (let i = 1; i <= left.length; i += 1) {
    current[0] = i;

    for (let j = 1; j <= right.length; j += 1) {
      const substitutionCost = left[i - 1] === right[j - 1] ? 0 : 1;
      current[j] = Math.min(
        current[j - 1] + 1,
        previous[j] + 1,
        previous[j - 1] + substitutionCost,
      );
    }

    for (let j = 0; j <= right.length; j += 1) {
      previous[j] = current[j];
    }
  }

  return previous[right.length];
}

function findClosestAttributeSuggestion(prefix, localName, candidates = []) {
  let bestCandidate = null;
  let bestDistance = Infinity;

  for (const candidate of candidates) {
    if (typeof candidate !== "string" || !candidate.startsWith(prefix)) {
      continue;
    }

    const candidateLocalName = candidate.slice(prefix.length);
    const distance = levenshteinDistance(localName, candidateLocalName);

    if (distance < bestDistance) {
      bestDistance = distance;
      bestCandidate = candidate;
    }
  }

  if (!bestCandidate) {
    return null;
  }

  const maxDistance = Math.max(2, Math.floor(localName.length / 3));
  return bestDistance <= maxDistance ? bestCandidate : null;
}

export function inferLitsxStaticHoistInfoAtPosition(sourceText, position) {
  if (typeof sourceText !== "string" || typeof position !== "number") {
    return null;
  }

  let caretIndex = sourceText.lastIndexOf("^", position);
  while (caretIndex >= 0) {
    const nextChar = sourceText[caretIndex + 1];
    if (!/[A-Za-z$_]/.test(nextChar || "")) {
      caretIndex = sourceText.lastIndexOf("^", caretIndex - 1);
      continue;
    }

    let previousIndex = caretIndex - 1;
    while (previousIndex >= 0 && /[ \t\r\n]/.test(sourceText[previousIndex])) {
      previousIndex -= 1;
    }

    if (previousIndex >= 0) {
      const previousChar = sourceText[previousIndex];
      if (previousChar !== ";" && previousChar !== "{" && previousChar !== "}") {
        caretIndex = sourceText.lastIndexOf("^", caretIndex - 1);
        continue;
      }
    }

    let index = caretIndex + 1;
    while (index < sourceText.length && /[A-Za-z0-9$_]/.test(sourceText[index])) {
      index += 1;
    }

    if (index === caretIndex + 1) {
      caretIndex = sourceText.lastIndexOf("^", caretIndex - 1);
      continue;
    }

    const name = sourceText.slice(caretIndex, index);
    let next = index;
    while (next < sourceText.length && /[ \t\r\n]/.test(sourceText[next])) {
      next += 1;
    }

    if (sourceText[next] !== "(") {
      caretIndex = sourceText.lastIndexOf("^", caretIndex - 1);
      continue;
    }

    const end = scanStaticHoistParens(sourceText, next);
    if (position < caretIndex || position > end) {
      caretIndex = sourceText.lastIndexOf("^", caretIndex - 1);
      continue;
    }

    return {
      name,
      start: caretIndex,
      length: name.length,
      documentation: STATIC_HOIST_DOCUMENTATION_BY_NAME[name]
        ?? `LitSX static hoist ${name}(...). Declare it before render-time statements in the component body.`,
    };
  }

  return null;
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

function createOriginalIssue(virtualization, config) {
  const virtualStart = typeof config.start === "number" ? config.start : 0;
  const virtualLength = typeof config.length === "number" ? config.length : 0;
  const span = remapTextSpanToOriginal(
    {
      start: virtualStart,
      length: virtualLength,
    },
    virtualization?.replacements ?? [],
  );

  return {
    kind: config.kind,
    code: config.code,
    severity: config.severity,
    message: config.message,
    start: span?.start ?? 0,
    length: span?.length ?? 0,
    fix: config.fix ?? null,
  };
}

function collectStaticHoistIssues(ast, virtualization) {
  const issues = [];
  const seenSingletonHoists = new Map();

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
      node.callee.name.startsWith("__litsx_static_") &&
      nextFunctionBody
    ) {
      const authoredName = decodeVirtualStaticHoistName(node.callee.name) ?? `^${node.callee.name.slice("__litsx_static_".length)}`;
      const macroName = authoredName.slice(1);
      const statement = parent?.type === "ExpressionStatement" ? parent : null;
      const enclosingBlock = parent?.type === "ExpressionStatement" ? functionBody : null;
      const isTopLevelStatement = statement && enclosingBlock?.body?.includes(statement);

      if (!isTopLevelStatement) {
        issues.push(
          createOriginalIssue(virtualization, {
            kind: "static-hoist-top-level",
            severity: "error",
            code: 91007,
            start: node.start ?? 0,
            length: Math.max(0, (node.end ?? node.start ?? 0) - (node.start ?? 0)),
            message: `LitSX static hoists such as ${authoredName}(...) must appear as a top-level statement in the component body.`,
          })
        );
      }

      if (SINGLETON_STATIC_HOISTS.has(macroName)) {
        if (seenSingletonHoists.has(macroName)) {
          issues.push(
            createOriginalIssue(virtualization, {
              kind: "duplicate-static-hoist",
              severity: "error",
              code: 91009,
              start: node.start ?? 0,
              length: Math.max(0, (node.end ?? node.start ?? 0) - (node.start ?? 0)),
              message: `Duplicate static hoist "${authoredName}(...)" found. Native LitSX hoists such as ${authoredName}(...) should only be declared once per component.`,
            })
          );
        } else {
          seenSingletonHoists.set(macroName, node);
        }
      }
    }

    for (const [key, value] of Object.entries(node)) {
      if (key === "loc" || key === "leadingComments" || key === "innerComments" || key === "trailingComments") {
        continue;
      }

      if (Array.isArray(value)) {
        for (const child of value) {
          if (child && typeof child.type === "string") {
            visit(child, node, nextFunctionBody);
          }
        }
      } else if (value && typeof value.type === "string") {
        visit(value, node, nextFunctionBody);
      }
    }
  }

  visit(ast.program ?? ast, null, null);
  return issues;
}

function collectReactMemoIssues(ast, virtualization) {
  const issues = [];
  const reactMemoLocalNames = new Set();
  const reactNamespaceNames = new Set();
  const body = ast?.program?.body ?? ast?.body ?? [];

  for (const node of body) {
    if (node?.type !== "ImportDeclaration" || node.source?.value !== "react") {
      continue;
    }

    for (const specifier of node.specifiers || []) {
      if (
        specifier?.type === "ImportSpecifier" &&
        specifier.imported?.type === "Identifier" &&
        specifier.imported.name === "memo" &&
        specifier.local?.type === "Identifier"
      ) {
        reactMemoLocalNames.add(specifier.local.name);
      }

      if (
        (specifier?.type === "ImportDefaultSpecifier" ||
          specifier?.type === "ImportNamespaceSpecifier") &&
        specifier.local?.type === "Identifier"
      ) {
        reactNamespaceNames.add(specifier.local.name);
      }
    }
  }

  walk(ast.program ?? ast, (node) => {
    if (node?.type !== "CallExpression") {
      return;
    }

    const callee = node.callee;
    const isImportedMemo =
      callee?.type === "Identifier" && reactMemoLocalNames.has(callee.name);
    const isNamespacedMemo =
      callee?.type === "MemberExpression" &&
      callee.computed === false &&
      callee.object?.type === "Identifier" &&
      reactNamespaceNames.has(callee.object.name) &&
      callee.property?.type === "Identifier" &&
      callee.property.name === "memo";

    if (!isImportedMemo && !isNamespacedMemo) {
      return;
    }

    issues.push(
      createOriginalIssue(virtualization, {
        kind: "react-memo",
        severity: "warning",
        code: "LITSX_REACT_MEMO_STRIPPED",
        start: node.start ?? 0,
        length: Math.max(0, (node.end ?? node.start ?? 0) - (node.start ?? 0)),
        message:
          "`memo(...)` is removed during LitSX lowering. LitSX does not use React-style parent re-render bailout semantics, so `memo` is treated as a migration wrapper only.",
      })
    );

    if ((node.arguments || []).length > 1) {
      issues.push(
        createOriginalIssue(virtualization, {
          kind: "react-memo",
          severity: "warning",
          code: "LITSX_REACT_MEMO_COMPARATOR_IGNORED",
          start: node.start ?? 0,
          length: Math.max(0, (node.end ?? node.start ?? 0) - (node.start ?? 0)),
          message:
            "`memo(Component, areEqual)` ignores the comparator during LitSX lowering because LitSX does not use React-style parent re-render bailout semantics.",
        })
      );
    }
  });

  return issues;
}

function collectReactCompatSurfaceIssues(ast, virtualization) {
  const issues = [];
  const attributes = collectJsxAttributes(ast);

  for (const attribute of attributes) {
    const tagName = attribute.__litsxTagName;
    const attrName = attribute.name?.name;

    if (typeof attrName !== "string" || typeof tagName !== "string" || !/^[a-z]/.test(tagName)) {
      continue;
    }

    const virtualSpan = {
      start: attribute.name.start ?? attribute.start ?? 0,
      length: (attribute.name.end ?? attribute.end ?? 0) - (attribute.name.start ?? attribute.start ?? 0),
    };

    if (attrName === "htmlFor") {
      issues.push(createOriginalIssue(virtualization, {
        kind: "react-compat-surface",
        severity: "warning",
        code: 91010,
        start: virtualSpan.start,
        length: virtualSpan.length,
        message: '`htmlFor` is React compatibility syntax. Prefer the native DOM attribute `for` in LitSX-authored intrinsic elements.',
      }));
    } else if (attrName === "dangerouslySetInnerHTML") {
      issues.push(createOriginalIssue(virtualization, {
        kind: "react-compat-surface",
        severity: "warning",
        code: 91011,
        start: virtualSpan.start,
        length: virtualSpan.length,
        message: "`dangerouslySetInnerHTML` is React compatibility surface. Prefer native Lit rendering patterns or explicit DOM escape hatches instead of React-authored HTML injection APIs.",
      }));
    } else if (attrName === "defaultValue") {
      issues.push(createOriginalIssue(virtualization, {
        kind: "react-compat-surface",
        severity: "warning",
        code: 91012,
        start: virtualSpan.start,
        length: virtualSpan.length,
        message: '`defaultValue` is React compatibility syntax. Prefer `value`, `.value`, or native initial DOM state patterns in LitSX.',
      }));
    } else if (attrName === "defaultChecked") {
      issues.push(createOriginalIssue(virtualization, {
        kind: "react-compat-surface",
        severity: "warning",
        code: 91013,
        start: virtualSpan.start,
        length: virtualSpan.length,
        message: '`defaultChecked` is React compatibility syntax. Prefer `checked`, `?checked`, or native initial DOM state patterns in LitSX.',
      }));
    }
  }

  return issues;
}

function collectComponentLikeFunctions(ast) {
  const functions = [];

  function isComponentLikeFunction(node) {
    if (!node || typeof node !== "object") {
      return false;
    }

    if (
      node.type === "FunctionDeclaration" ||
      node.type === "FunctionExpression"
    ) {
      return /^[A-Z]/.test(node.id?.name ?? "");
    }

    if (node.type === "ArrowFunctionExpression") {
      return true;
    }

    return false;
  }

  function collect(node, parent = null) {
    if (!node || typeof node !== "object") {
      return;
    }

    if (isComponentLikeFunction(node)) {
      functions.push({ node, parent });
    }

    for (const [key, value] of Object.entries(node)) {
      if (key === "loc" || key === "leadingComments" || key === "innerComments" || key === "trailingComments") {
        continue;
      }
      if (Array.isArray(value)) {
        for (const child of value) {
          if (child && typeof child.type === "string") {
            collect(child, node);
          }
        }
      } else if (value && typeof value.type === "string") {
        collect(value, node);
      }
    }
  }

  collect(ast.program ?? ast, null);
  return functions;
}

function collectPropsAccessIssues(ast, virtualization) {
  const issues = [];

  for (const { node } of collectComponentLikeFunctions(ast)) {
    const firstParam = node.params?.[0];
    if (!firstParam || firstParam.type !== "Identifier" || typeof firstParam.name !== "string") {
      continue;
    }

    const propsParamName = firstParam.name;
    const seenProps = new Set();
    let foundAnyOpaqueAccess = false;

    walk(node.body, (child) => {
      if (
        child?.type === "MemberExpression" &&
        child.computed === false &&
        child.object?.type === "Identifier" &&
        child.object.name === propsParamName &&
        child.property?.type === "Identifier"
      ) {
        foundAnyOpaqueAccess = true;
        const propName = child.property.name;
        if (!seenProps.has(propName)) {
          seenProps.add(propName);
          issues.push(createOriginalIssue(virtualization, {
            kind: "opaque-prop-metadata-inference",
            severity: "warning",
            code: "LITSX_PROP_FALLBACK_STRING",
            start: child.start ?? 0,
            length: Math.max(0, (child.end ?? child.start ?? 0) - (child.start ?? 0)),
            message: `Falling back to String for prop "${propName}" inferred from opaque props access. Prefer destructuring, TypeScript types, or ^properties(...) for stronger property metadata.`,
          }));
        }
      }
    });

    if (foundAnyOpaqueAccess) {
      issues.push(createOriginalIssue(virtualization, {
        kind: "prefer-destructured-props",
        severity: "warning",
        code: 91014,
        start: firstParam.start ?? 0,
        length: Math.max(0, (firstParam.end ?? firstParam.start ?? 0) - (firstParam.start ?? 0)),
        message: `Prefer destructuring component props instead of reading opaque "${propsParamName}.foo" member access directly in LitSX components.`,
      }));
    }
  }

  return issues;
}

function collectHoistsFirstIssues(ast, virtualization) {
  const issues = [];

  for (const { node } of collectComponentLikeFunctions(ast)) {
    if (node.body?.type !== "BlockStatement") {
      continue;
    }

    let sawNonHoistStatement = false;
    for (const statement of node.body.body ?? []) {
      const isHoistStatement =
        statement?.type === "ExpressionStatement" &&
        statement.expression?.type === "CallExpression" &&
        statement.expression.callee?.type === "Identifier" &&
        statement.expression.callee.name.startsWith("__litsx_static_");

      if (isHoistStatement) {
        if (sawNonHoistStatement) {
          const authoredName = decodeVirtualStaticHoistName(statement.expression.callee.name) ?? "^unknown";
          issues.push(createOriginalIssue(virtualization, {
            kind: "require-top-level-hoists-first",
            severity: "warning",
            code: 91015,
            start: statement.expression.start ?? statement.start ?? 0,
            length: Math.max(0, ((statement.expression.end ?? statement.end ?? statement.expression.start ?? statement.start ?? 0) - (statement.expression.start ?? statement.start ?? 0))),
            message: `Place static hoists such as ${authoredName}(...) before render-time statements in the component body for clearer LitSX structure.`,
          }));
        }
        continue;
      }

      sawNonHoistStatement = true;
    }
  }

  return issues;
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
  const matchText = attrMatch[0];
  const attrStart = lastOpen + 1 + openingSegment.length - matchText.length + matchText.lastIndexOf(prefix);
  return {
    tagName: tagMatch[1],
    prefix,
    partialName,
    start: attrStart,
    length: prefix.length + partialName.length,
  };
}

export function inferLitsxAttributeInfoAtPosition(sourceText, position) {
  const prefixText = sourceText.slice(0, position);
  const lastOpen = prefixText.lastIndexOf("<");
  const lastClose = prefixText.lastIndexOf(">");

  if (lastOpen === -1 || lastClose > lastOpen) {
    return null;
  }

  const segment = sourceText.slice(lastOpen + 1);
  const tagMatch = /^([A-Za-z][\w:-]*)/.exec(segment.trimStart());
  if (!tagMatch) {
    return null;
  }

  const absoluteSegmentStart = lastOpen + 1;
  const attributePattern = /(?:^|\s)([@.?])([\w:-]+)/g;
  let match;

  while ((match = attributePattern.exec(segment)) !== null) {
    const prefix = match[1];
    const localName = match[2];
    const start = absoluteSegmentStart + match.index + match[0].length - (prefix.length + localName.length);
    const end = start + prefix.length + localName.length;

    if (position >= start && position <= end) {
      return {
        tagName: tagMatch[1],
        prefix,
        localName,
        name: `${prefix}${localName}`,
        start,
        length: end - start,
      };
    }
  }

  return null;
}

export function collectLitsxAuthoredIssues(sourceText, options = {}) {
  const plugins = Array.from(new Set(["jsx", ...(options.plugins ?? [])]));
  const virtualization = createVirtualLitsxJsxSource(sourceText);
  let ast;

  try {
    ast = babelParser.parse(virtualization.code, {
      sourceType: "module",
      plugins,
    });
  } catch (error) {
    return [
      createOriginalIssue(virtualization, {
        kind: "parse-error",
        severity: "error",
        code: 91000,
        start: typeof error?.pos === "number" ? error.pos : 0,
        length: 1,
        message: `LitSX syntax could not be parsed: ${error?.message || "Unexpected syntax."}`,
      }),
    ];
  }

  const issues = [];
  const attributes = collectJsxAttributes(ast);
  issues.push(...collectStaticHoistIssues(ast, virtualization));
  issues.push(...collectReactMemoIssues(ast, virtualization));
  issues.push(...collectReactCompatSurfaceIssues(ast, virtualization));
  issues.push(...collectPropsAccessIssues(ast, virtualization));
  issues.push(...collectHoistsFirstIssues(ast, virtualization));

  for (const attribute of attributes) {
    const tagName = attribute.__litsxTagName;
    const attributeValue = attribute.value;
    const virtualSpan = {
      start: attribute.name.start ?? attribute.start ?? 0,
      length: (attribute.name.end ?? attribute.end ?? 0) - (attribute.name.start ?? attribute.start ?? 0),
    };
    const rawAttributeName = attribute.name.name;
    const attributeName = decodeVirtualAttributeName(rawAttributeName);

    if (!attributeName) {
      if (rawAttributeName === "className" && typeof tagName === "string" && /^[a-z]/.test(tagName)) {
        issues.push(
          createOriginalIssue(virtualization, {
            kind: "native-classname",
            severity: "warning",
            code: 91008,
            start: virtualSpan.start,
            length: virtualSpan.length,
            message:
              '`className` is not native LitSX syntax. Use `class` in native LitSX, or add the React compatibility layer to rewrite `className`.',
            fix: {
              text: "class",
            },
          })
        );
      }
      continue;
    }

    const prefix = attributeName[0];
    const localName = attributeName.slice(1);

    if ((prefix === "@" || prefix === ".") && attributeValue?.type !== "JSXExpressionContainer") {
      issues.push(
        createOriginalIssue(virtualization, {
          kind: "invalid-binding-value",
          severity: "error",
          code: 91001,
          start: virtualSpan.start,
          length: virtualSpan.length,
          message:
            prefix === "@"
              ? `Lit listener binding "${attributeName}" must use an expression, for example ${attributeName}={handler}.`
              : `Lit property binding "${attributeName}" must use an expression, for example ${attributeName}={value}.`,
        })
      );
      continue;
    }

    if (prefix === "?" && attributeValue?.type && attributeValue.type !== "JSXExpressionContainer") {
      issues.push(
        createOriginalIssue(virtualization, {
          kind: "invalid-binding-value",
          severity: "error",
          code: 91002,
          start: virtualSpan.start,
          length: virtualSpan.length,
          message:
            `Lit boolean binding "${attributeName}" must be bare or use an expression, for example ${attributeName} or ${attributeName}={condition}.`,
        })
      );
      continue;
    }

    if (
      attributeValue?.type === "JSXExpressionContainer" &&
      attributeValue.expression?.type === "JSXEmptyExpression"
    ) {
      issues.push(
        createOriginalIssue(virtualization, {
          kind: "invalid-binding-value",
          severity: "error",
          code: 91003,
          start: virtualSpan.start,
          length: virtualSpan.length,
          message: `Lit binding "${attributeName}" cannot use an empty expression.`,
        })
      );
    }

    if (
      prefix === "@" &&
      tagName &&
      Object.hasOwn(EVENT_COMPLETIONS_BY_TAG, tagName) &&
      !EVENT_COMPLETIONS_BY_TAG[tagName].includes(localName)
    ) {
      const suggestion = findClosestAttributeSuggestion(
        prefix,
        localName,
        EVENT_COMPLETIONS_BY_TAG[tagName].map((name) => `@${name}`),
      );
      issues.push(
        createOriginalIssue(virtualization, {
          kind: "unknown-binding",
          severity: "warning",
          code: 91006,
          start: virtualSpan.start,
          length: virtualSpan.length,
          message:
            `Listener binding "${attributeName}" is not in the known LitSX event set for <${tagName}>.${suggestion ? ` Did you mean "${suggestion}"?` : ""}`,
        })
      );
    }

    if (
      prefix === "." &&
      tagName &&
      Object.hasOwn(PROP_COMPLETIONS_BY_TAG, tagName) &&
      !PROP_COMPLETIONS_BY_TAG[tagName].includes(localName)
    ) {
      const suggestion = findClosestAttributeSuggestion(
        prefix,
        localName,
        PROP_COMPLETIONS_BY_TAG[tagName].map((name) => `.${name}`),
      );
      issues.push(
        createOriginalIssue(virtualization, {
          kind: "unknown-binding",
          severity: "warning",
          code: 91004,
          start: virtualSpan.start,
          length: virtualSpan.length,
          message:
            `Property binding "${attributeName}" is not in the known LitSX property set for <${tagName}>.${suggestion ? ` Did you mean "${suggestion}"?` : ""}`,
        })
      );
    }

    if (
      prefix === "?" &&
      tagName &&
      Object.hasOwn(BOOL_COMPLETIONS_BY_TAG, tagName) &&
      !BOOL_COMPLETIONS_BY_TAG[tagName].includes(localName)
    ) {
      const suggestion = findClosestAttributeSuggestion(
        prefix,
        localName,
        BOOL_COMPLETIONS_BY_TAG[tagName].map((name) => `?${name}`),
      );
      issues.push(
        createOriginalIssue(virtualization, {
          kind: "unknown-binding",
          severity: "warning",
          code: 91005,
          start: virtualSpan.start,
          length: virtualSpan.length,
          message:
            `Boolean binding "${attributeName}" is not in the known LitSX boolean attribute set for <${tagName}>.${suggestion ? ` Did you mean "${suggestion}"?` : ""}`,
        })
      );
    }
  }

  return issues;
}

export {
  createVirtualLitsxJsxSource,
  decodeVirtualAttributeName,
  decodeVirtualStaticHoistName,
  NATIVE_STATIC_HOISTS,
  looksLikeLitsxJsx,
  mapOriginalPositionToVirtual,
  remapTextSpanToOriginal,
  remapVirtualText,
  STATIC_HOIST_CALL_RE,
};
