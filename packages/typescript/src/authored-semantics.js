import * as babelParser from "@babel/parser";
import {
  collectComponentLikeFunctions,
  collectNativeClassNameWarnings,
  collectReactMemoWarnings,
  createVirtualLitsxJsxSource,
  decodeVirtualAttributeName,
  decodeVirtualStaticHoistName,
  NATIVE_STATIC_HOISTS,
  looksLikeLitsxJsx,
  mapOriginalPositionToVirtual,
  remapTextSpanToOriginal,
  remapVirtualText,
  STATIC_HOIST_CALL_RE,
} from "@litsx/authoring";

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
  input: ["click", "input", "change", "focus", "blur", "keydown", "keyup"],
  textarea: ["click", "input", "change", "focus", "blur", "keydown", "keyup"],
  button: ["click", "focus", "blur", "keydown", "keyup"],
  form: ["submit", "change", "input", "click"],
  video: ["click", "play", "pause", "timeupdate", "loadedmetadata", "volumechange"],
  audio: ["click", "play", "pause", "timeupdate", "loadedmetadata", "volumechange"],
  "suspense-boundary": ["click", "transitionend", "animationend"],
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

const GLOBAL_ATTRIBUTE_COMPLETIONS = [
  "class",
  "id",
  "title",
  "style",
  "role",
  "slot",
  "part",
  "tabIndex",
  "lang",
  "dir",
  "hidden",
  "inert",
  "draggable",
  "spellcheck",
  "translate",
  "accessKey",
  "contentEditable",
];

const GLOBAL_ARIA_ATTRIBUTE_COMPLETIONS = [
  "aria-label",
  "aria-hidden",
  "aria-describedby",
  "aria-labelledby",
  "aria-controls",
  "aria-expanded",
  "aria-pressed",
  "aria-current",
  "aria-live",
];

const ATTRIBUTE_COMPLETIONS_BY_TAG = {
  a: ["href", "target", "rel", "download", "hreflang"],
  audio: ["src", "controls", "autoplay", "muted", "loop", "preload"],
  button: ["type", "name", "value", "disabled", "form", "autofocus"],
  details: ["name", "open"],
  dialog: ["open"],
  form: ["action", "method", "autocomplete", "name", "novalidate"],
  iframe: ["src", "name", "title", "loading", "allow"],
  img: ["src", "alt", "width", "height", "loading", "decoding"],
  input: ["type", "name", "value", "placeholder", "checked", "disabled", "required", "readonly", "autocomplete", "min", "max", "step"],
  option: ["value", "label", "selected", "disabled"],
  select: ["name", "value", "disabled", "required", "multiple"],
  textarea: ["name", "value", "placeholder", "disabled", "required", "readonly", "rows", "cols"],
  video: ["src", "controls", "autoplay", "muted", "loop", "playsInline", "poster", "preload"],
};

const SINGLETON_STATIC_HOISTS = NATIVE_STATIC_HOISTS;

const STATIC_HOIST_DOCUMENTATION_BY_NAME = {
  "static styles": "LitSX static style hoist. Declare component-scoped styles before render-time statements.",
  "static properties": "LitSX static properties hoist. Declare reactive property metadata before render-time statements.",
  "static shadowRootOptions": "LitSX static shadow root options hoist. Declare shadow root configuration before render-time statements.",
  "static lightDom": "LitSX static light DOM hoist. Declare light DOM rendering before render-time statements.",
};

function formatStaticHoistAuthoredName(macroName) {
  return `static ${macroName}`;
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

function splitAttributeCompletionWords(name) {
  return name
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

function rankAttributeCompletion(candidate, partialName) {
  if (typeof candidate !== "string") {
    return null;
  }

  if (partialName.length === 0) {
    return {
      score: 0,
      wordIndex: -1,
      lengthDelta: candidate.length,
    };
  }

  const normalizedCandidate = candidate.toLowerCase();
  const normalizedPartial = partialName.toLowerCase();

  if (normalizedCandidate === normalizedPartial) {
    return {
      score: 0,
      wordIndex: -1,
      lengthDelta: 0,
    };
  }

  if (normalizedCandidate.startsWith(normalizedPartial)) {
    return {
      score: 1,
      wordIndex: -1,
      lengthDelta: candidate.length - partialName.length,
    };
  }

  const words = splitAttributeCompletionWords(candidate);
  const exactWordIndex = words.findIndex((word) => word === normalizedPartial);

  if (exactWordIndex !== -1) {
    return {
      score: 2,
      wordIndex: exactWordIndex,
      lengthDelta: candidate.length - partialName.length,
    };
  }

  const prefixWordIndex = words.findIndex((word) => word.startsWith(normalizedPartial));

  if (prefixWordIndex !== -1) {
    return {
      score: 3,
      wordIndex: prefixWordIndex,
      lengthDelta: candidate.length - partialName.length,
    };
  }

  const substringIndex = normalizedCandidate.indexOf(normalizedPartial);

  if (substringIndex !== -1) {
    return {
      score: 4,
      wordIndex: substringIndex,
      lengthDelta: candidate.length - partialName.length,
    };
  }

  return null;
}

function findEnclosingJsxOpeningTagStart(sourceText, position) {
  let tagStart = -1;
  let inTag = false;
  let braceDepth = 0;
  let quote = null;

  for (let index = 0; index < position; index += 1) {
    const char = sourceText[index];

    if (!inTag) {
      if (char === "<" && /[A-Za-z]/.test(sourceText[index + 1] ?? "")) {
        inTag = true;
        tagStart = index;
      }
      continue;
    }

    if (quote) {
      if (char === "\\" && index + 1 < position) {
        index += 1;
        continue;
      }

      if (char === quote) {
        quote = null;
      }
      continue;
    }

    if (char === '"' || char === "'" || char === "`") {
      quote = char;
      continue;
    }

    if (char === "{") {
      braceDepth += 1;
      continue;
    }

    if (char === "}" && braceDepth > 0) {
      braceDepth -= 1;
      continue;
    }

    if (char === ">" && braceDepth === 0) {
      inTag = false;
      tagStart = -1;
    }
  }

  return inTag ? tagStart : -1;
}

function findJsxOpeningTagEnd(sourceText, tagStart) {
  let braceDepth = 0;
  let quote = null;

  for (let index = tagStart + 1; index < sourceText.length; index += 1) {
    const char = sourceText[index];

    if (quote) {
      if (char === "\\" && index + 1 < sourceText.length) {
        index += 1;
        continue;
      }

      if (char === quote) {
        quote = null;
      }
      continue;
    }

    if (char === '"' || char === "'" || char === "`") {
      quote = char;
      continue;
    }

    if (char === "{") {
      braceDepth += 1;
      continue;
    }

    if (char === "}" && braceDepth > 0) {
      braceDepth -= 1;
      continue;
    }

    if (char === ">" && braceDepth === 0) {
      return index;
    }
  }

  return sourceText.length;
}

export function inferLitsxStaticHoistInfoAtPosition(sourceText, position) {
  if (typeof sourceText !== "string" || typeof position !== "number") {
    return null;
  }

  const staticMatch = Array.from(
    sourceText.matchAll(/(?:^|[;{}]\s*)(static\s+([A-Za-z$_][A-Za-z0-9$_]*)\s*=)/gm),
  ).find((match) => {
    const start = match.index + match[0].lastIndexOf(match[1]);
    const end = start + match[1].length;
    return position >= start && position <= end;
  });

  if (staticMatch) {
    const start = staticMatch.index + staticMatch[0].lastIndexOf(staticMatch[1]);
    const name = `static ${staticMatch[2]}`;

    return {
      name,
      start,
      length: name.length,
      documentation: STATIC_HOIST_DOCUMENTATION_BY_NAME[name]
        ?? `LitSX static hoist ${name} = .... Declare it before render-time statements in the component body.`,
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
  const seenSingletonHoistsByBody = new Map();

  function getSeenSingletonHoists(functionBody) {
    if (!functionBody || typeof functionBody !== "object") {
      return null;
    }

    let seenSingletonHoists = seenSingletonHoistsByBody.get(functionBody);
    if (!seenSingletonHoists) {
      seenSingletonHoists = new Map();
      seenSingletonHoistsByBody.set(functionBody, seenSingletonHoists);
    }
    return seenSingletonHoists;
  }

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
      const macroName = node.callee.name.slice("__litsx_static_".length);
      const authoredName = decodeVirtualStaticHoistName(node.callee.name) ?? formatStaticHoistAuthoredName(macroName);
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
            message: `LitSX static hoists such as ${authoredName} = ... must appear as a top-level statement in the component body.`,
          })
        );
      }

      const seenSingletonHoists = getSeenSingletonHoists(nextFunctionBody);
      if (seenSingletonHoists && SINGLETON_STATIC_HOISTS.has(macroName)) {
        if (seenSingletonHoists.has(macroName)) {
          issues.push(
            createOriginalIssue(virtualization, {
              kind: "duplicate-static-hoist",
              severity: "error",
              code: 91009,
              start: node.start ?? 0,
              length: Math.max(0, (node.end ?? node.start ?? 0) - (node.start ?? 0)),
              message: `Duplicate static hoist "${authoredName} = ..." found. Native LitSX hoists such as ${authoredName} = ... should only be declared once per component.`,
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

  for (const seenSingletonHoists of seenSingletonHoistsByBody.values()) {
    if (
      seenSingletonHoists.has("lightDom") &&
      seenSingletonHoists.has("shadowRootOptions")
    ) {
      const shadowRootOptionsHoist = seenSingletonHoists.get("shadowRootOptions");
      issues.push(
        createOriginalIssue(virtualization, {
          kind: "ignored-static-hoist",
          severity: "warning",
          code: 91019,
          start: shadowRootOptionsHoist.start ?? 0,
          length: Math.max(
            0,
            (shadowRootOptionsHoist.end ?? shadowRootOptionsHoist.start ?? 0) -
              (shadowRootOptionsHoist.start ?? 0),
          ),
          message: 'static shadowRootOptions = ... is ignored when static lightDom = true.',
        }),
      );
    }
  }

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

function collectReactMemoIssues(ast, virtualization) {
  return collectReactMemoWarnings(ast).map((warning) =>
    createOriginalIssue(virtualization, {
      kind: "react-memo",
      severity: "warning",
      code: warning.code,
      start: warning.start,
      length: warning.length,
      message: warning.message,
    })
  );
}

function getFunctionLikeBody(node) {
  if (!node || typeof node !== "object") {
    return null;
  }

  if (
    node.type === "FunctionDeclaration" ||
    node.type === "FunctionExpression" ||
    node.type === "ArrowFunctionExpression"
  ) {
    return node.body ?? null;
  }

  return null;
}

function getComponentLikeFunctionName(node, parent) {
  if (
    (node.type === "FunctionDeclaration" || node.type === "FunctionExpression") &&
    node.id?.type === "Identifier"
  ) {
    return node.id.name;
  }

  if (
    node.type === "ArrowFunctionExpression" &&
    parent?.type === "VariableDeclarator" &&
    parent.id?.type === "Identifier"
  ) {
    return parent.id.name;
  }

  if (
    node.type === "ArrowFunctionExpression" &&
    parent?.type === "AssignmentExpression" &&
    parent.left?.type === "Identifier"
  ) {
    return parent.left.name;
  }

  return null;
}

function parseAuthoredAst(sourceText, options = {}) {
  const plugins = Array.from(new Set(["jsx", ...(options.plugins ?? [])]));
  const virtualization = createVirtualLitsxJsxSource(sourceText);

  try {
    return {
      virtualization,
      ast: babelParser.parse(virtualization.code, {
        sourceType: "module",
        plugins,
      }),
    };
  } catch (error) {
    return {
      virtualization,
      ast: null,
      error,
    };
  }
}

function inferEmitAliases(functionNode) {
  const aliases = new Set();
  const body = getFunctionLikeBody(functionNode);

  if (!body) {
    return aliases;
  }

  walk(body, (child) => {
    if (
      child?.type === "VariableDeclarator" &&
      child.id?.type === "Identifier" &&
      child.init?.type === "CallExpression" &&
      child.init.callee?.type === "Identifier" &&
      child.init.callee.name === "useEmit"
    ) {
      aliases.add(child.id.name);
    }
  });

  return aliases;
}

function inferEmittedEventNames(functionNode) {
  const aliases = inferEmitAliases(functionNode);
  if (aliases.size === 0) {
    return [];
  }

  const emittedEventNames = new Set();
  const body = getFunctionLikeBody(functionNode);
  if (!body) {
    return [];
  }

  walk(body, (child) => {
    if (
      child?.type === "CallExpression" &&
      child.callee?.type === "Identifier" &&
      aliases.has(child.callee.name) &&
      child.arguments?.[0]?.type === "StringLiteral"
    ) {
      emittedEventNames.add(child.arguments[0].value);
    }
  });

  return Array.from(emittedEventNames).sort();
}

export function inferLitsxComponentEventNames(sourceText, options = {}) {
  const { ast } = parseAuthoredAst(sourceText, options);
  if (!ast) {
    return {};
  }

  const componentEventNames = {};

  for (const { node, parent } of collectComponentLikeFunctions(ast)) {
    const componentName = getComponentLikeFunctionName(node, parent);
    if (!componentName) {
      continue;
    }

    const emittedEventNames = inferEmittedEventNames(node);
    if (emittedEventNames.length > 0) {
      componentEventNames[componentName] = emittedEventNames;
    }
  }

  return componentEventNames;
}

function inferStaticPropertyNames(functionNode) {
  const propertyNames = new Set();
  const body = getFunctionLikeBody(functionNode);

  if (!body) {
    return [];
  }

  walk(body, (child) => {
    let propertiesObject = null;

    if (
      child?.type === "AssignmentExpression" &&
      child.operator === "=" &&
      child.left?.type === "MemberExpression" &&
      child.left.computed === false &&
      child.left.object?.type === "Identifier" &&
      child.left.object.name === "static" &&
      child.left.property?.type === "Identifier" &&
      child.left.property.name === "properties" &&
      child.right?.type === "ObjectExpression"
    ) {
      propertiesObject = child.right;
    }

    if (
      child?.type === "CallExpression" &&
      child.callee?.type === "Identifier" &&
      child.callee.name === "__litsx_static_properties" &&
      child.arguments?.[0]?.type === "ObjectExpression"
    ) {
      propertiesObject = child.arguments[0];
    }

    if (!propertiesObject) {
      return;
    }

    for (const property of propertiesObject.properties ?? []) {
      if (property?.type !== "ObjectProperty") {
        continue;
      }

      if (property.key?.type === "Identifier") {
        propertyNames.add(property.key.name);
      } else if (property.key?.type === "StringLiteral") {
        propertyNames.add(property.key.value);
      }
    }
  });

  return Array.from(propertyNames).sort();
}

export function inferLitsxComponentPropNames(sourceText, options = {}) {
  const { ast } = parseAuthoredAst(sourceText, options);
  if (!ast) {
    return {};
  }

  const componentPropNames = {};

  for (const { node, parent } of collectComponentLikeFunctions(ast)) {
    const componentName = getComponentLikeFunctionName(node, parent);
    if (!componentName) {
      continue;
    }

    const propNames = inferStaticPropertyNames(node);
    if (propNames.length > 0) {
      componentPropNames[componentName] = propNames;
    }
  }

  return componentPropNames;
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
            code: 91018,
            start: child.start ?? 0,
            length: Math.max(0, (child.end ?? child.start ?? 0) - (child.start ?? 0)),
            message: `Falling back to String for prop "${propName}" inferred from opaque props access. Prefer destructuring, TypeScript types, or static properties = ... for stronger property metadata.`,
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

function getFirstParamObjectPattern(node) {
  const firstParam = node?.params?.[0];
  if (!firstParam) {
    return null;
  }

  if (firstParam.type === "ObjectPattern") {
    return {
      pattern: firstParam,
      hasTypeAnnotation: Boolean(firstParam.typeAnnotation),
    };
  }

  if (firstParam.type === "AssignmentPattern" && firstParam.left?.type === "ObjectPattern") {
    return {
      pattern: firstParam.left,
      hasTypeAnnotation: Boolean(firstParam.left.typeAnnotation || firstParam.typeAnnotation),
    };
  }

  return null;
}

function getObjectPatternPropertyNames(pattern) {
  const names = [];

  for (const property of pattern?.properties ?? []) {
    if (property?.type !== "ObjectProperty") {
      continue;
    }

    if (property.key?.type === "Identifier") {
      names.push(property.key.name);
      continue;
    }

    if (property.key?.type === "StringLiteral") {
      names.push(property.key.value);
    }
  }

  return names;
}

function getObjectPatternImplicitMetadataNames(pattern) {
  const names = new Set();

  for (const property of pattern?.properties ?? []) {
    if (property?.type !== "ObjectProperty") {
      continue;
    }

    const keyName = property.key?.type === "Identifier"
      ? property.key.name
      : property.key?.type === "StringLiteral"
      ? property.key.value
      : null;

    if (!keyName) {
      continue;
    }

    if (property.value?.type === "AssignmentPattern") {
      names.add(keyName);
    }
  }

  return names;
}

function collectDestructuredPropsMetadataIssues(ast, virtualization) {
  const issues = [];

  for (const { node } of collectComponentLikeFunctions(ast)) {
    const firstParamPattern = getFirstParamObjectPattern(node);
    if (!firstParamPattern || firstParamPattern.hasTypeAnnotation) {
      continue;
    }

    const destructuredPropNames = getObjectPatternPropertyNames(firstParamPattern.pattern);
    if (destructuredPropNames.length === 0) {
      continue;
    }

    const staticPropNames = new Set(inferStaticPropertyNames(node));
    const implicitMetadataPropNames = getObjectPatternImplicitMetadataNames(firstParamPattern.pattern);
    const uncoveredPropNames = destructuredPropNames.filter(
      (name) => !staticPropNames.has(name) && !implicitMetadataPropNames.has(name),
    );
    if (uncoveredPropNames.length === 0) {
      continue;
    }

    const propSummary = uncoveredPropNames
      .slice(0, 3)
      .map((name) => `"${name}"`)
      .join(", ");
    const moreCount = uncoveredPropNames.length - Math.min(uncoveredPropNames.length, 3);
    const propDetails = moreCount > 0 ? `${propSummary}, and ${moreCount} more` : propSummary;

    issues.push(createOriginalIssue(virtualization, {
      kind: "destructured-props-metadata-missing",
      severity: "warning",
      code: 91020,
      start: firstParamPattern.pattern.start ?? 0,
      length: Math.max(
        0,
        (firstParamPattern.pattern.end ?? firstParamPattern.pattern.start ?? 0)
          - (firstParamPattern.pattern.start ?? 0),
      ),
      message: `Destructured component props ${propDetails} have no explicit LitSX prop metadata. Add a TypeScript annotation or static properties = ... for stronger prop semantics.`,
    }));
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
          const macroName = statement.expression.callee.name.slice("__litsx_static_".length);
          const authoredName = decodeVirtualStaticHoistName(statement.expression.callee.name) ?? formatStaticHoistAuthoredName(macroName);
          issues.push(createOriginalIssue(virtualization, {
            kind: "require-top-level-hoists-first",
            severity: "warning",
            code: 91015,
            start: statement.expression.start ?? statement.start ?? 0,
            length: Math.max(0, ((statement.expression.end ?? statement.end ?? statement.expression.start ?? statement.start ?? 0) - (statement.expression.start ?? statement.start ?? 0))),
            message: `Place static hoists such as ${authoredName} = ... before render-time statements in the component body for clearer LitSX structure.`,
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
    .map((name, index) => ({
      name,
      index,
      rank: rankAttributeCompletion(name, context.partialName),
    }))
    .filter((entry) => entry.rank)
    .sort((left, right) => {
      if (context.partialName.length === 0) {
        return left.index - right.index;
      }

      if (left.rank.score !== right.rank.score) {
        return left.rank.score - right.rank.score;
      }

      if (left.rank.wordIndex !== right.rank.wordIndex) {
        return left.rank.wordIndex - right.rank.wordIndex;
      }

      if (left.index !== right.index) {
        return left.index - right.index;
      }

      if (left.rank.lengthDelta !== right.rank.lengthDelta) {
        return left.rank.lengthDelta - right.rank.lengthDelta;
      }

      return 0;
    })
    .map((entry) => `${context.prefix}${entry.name}`);
}

export function inferLitsxAttributeCompletionContext(sourceText, position) {
  const tagStart = findEnclosingJsxOpeningTagStart(sourceText, position);

  if (tagStart === -1) {
    return null;
  }

  const prefixText = sourceText.slice(0, position);
  const lastOpen = tagStart;
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

export function inferLitsxMarkupCompletionContext(sourceText, position) {
  const tagStart = findEnclosingJsxOpeningTagStart(sourceText, position);

  if (tagStart === -1) {
    return null;
  }

  const prefixText = sourceText.slice(0, position);
  const lastOpen = tagStart;
  const openingSegment = prefixText.slice(lastOpen + 1);
  const tagMatch = /^([A-Za-z][\w:-]*)/.exec(openingSegment.trimStart());

  if (!tagMatch) {
    return null;
  }

  if (inferLitsxAttributeCompletionContext(sourceText, position)) {
    return null;
  }

  if (/\s$/.test(openingSegment)) {
    return {
      tagName: tagMatch[1],
      partialName: "",
      start: position,
      length: 0,
    };
  }

  const tailMatch = /(?:^|\s)([A-Za-z_:][\w:.-]*)?$/.exec(openingSegment);
  if (!tailMatch) {
    return null;
  }

  const tailText = tailMatch[0];
  if (/[={'"`]/.test(tailText) || tailText.trim() === "/" || tailText.includes("...")) {
    return null;
  }

  const partialName = tailMatch[1] ?? "";
  const trimmedOpening = openingSegment.trimStart();
  const afterTag = trimmedOpening.slice(tagMatch[0].length);

  if (partialName.length === 0 && !/\s$/.test(openingSegment) && afterTag.length > 0) {
    return null;
  }

  return {
    tagName: tagMatch[1],
    partialName,
    start: position - partialName.length,
    length: partialName.length,
  };
}

export function getLitsxMarkupCompletionNames(context) {
  if (!context) {
    return [];
  }

  const seen = new Set();
  const attributes = [
    ...GLOBAL_ATTRIBUTE_COMPLETIONS,
    ...(ATTRIBUTE_COMPLETIONS_BY_TAG[context.tagName] ?? []),
    ...GLOBAL_ARIA_ATTRIBUTE_COMPLETIONS,
  ]
    .filter((candidate) => {
      if (seen.has(candidate)) {
        return false;
      }
      seen.add(candidate);
      return true;
    })
    .map((name, index) => ({
      name,
      index,
      rank: rankAttributeCompletion(name, context.partialName),
    }))
    .filter((entry) => entry.rank)
    .sort((left, right) => {
      if (context.partialName.length === 0) {
        return left.index - right.index;
      }

      if (left.rank.score !== right.rank.score) {
        return left.rank.score - right.rank.score;
      }

      if (left.rank.wordIndex !== right.rank.wordIndex) {
        return left.rank.wordIndex - right.rank.wordIndex;
      }

      if (left.rank.lengthDelta !== right.rank.lengthDelta) {
        return left.rank.lengthDelta - right.rank.lengthDelta;
      }

      return left.index - right.index;
    })
    .map((entry) => entry.name);

  if (context.partialName.length > 0) {
    return attributes;
  }

  return [
    ...attributes,
    ...getLitsxAttributeCompletionNames({ ...context, prefix: "@" }),
    ...getLitsxAttributeCompletionNames({ ...context, prefix: "." }),
    ...getLitsxAttributeCompletionNames({ ...context, prefix: "?" }),
  ];
}

export function inferLitsxAttributeInfoAtPosition(sourceText, position) {
  const tagStart = findEnclosingJsxOpeningTagStart(sourceText, position);

  if (tagStart === -1) {
    return null;
  }

  const tagEnd = findJsxOpeningTagEnd(sourceText, tagStart);
  const segment = sourceText.slice(tagStart + 1, tagEnd);
  const tagMatch = /^([A-Za-z][\w:-]*)/.exec(segment.trimStart());
  if (!tagMatch) {
    return null;
  }

  const absoluteSegmentStart = tagStart + 1;
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
  const channel = options.channel === "eslint" ? "eslint" : options.channel === "all" ? "all" : "typescript";
  const { virtualization, ast, error } = parseAuthoredAst(sourceText, options);
  if (!ast) {
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
  issues.push(...collectDestructuredPropsMetadataIssues(ast, virtualization));
  issues.push(...collectPropsAccessIssues(ast, virtualization));
  issues.push(...collectHoistsFirstIssues(ast, virtualization));
  issues.push(...collectNativeClassNameWarnings(ast).map((warning) =>
    createOriginalIssue(virtualization, {
      kind: "native-classname",
      severity: "warning",
      code: warning.code,
      start: warning.start,
      length: warning.length,
      message: warning.message,
      fix: {
        text: "class",
      },
    })
  ));

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

  if (channel === "all") {
    return issues;
  }

  const eslintOnlyCodes = new Set([91015, 91016, 91017]);
  return issues.filter((issue) => (
    channel === "eslint" ? true : !eslintOnlyCodes.has(issue.code)
  ));
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
