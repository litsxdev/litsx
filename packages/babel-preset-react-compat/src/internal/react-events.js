import helperPluginUtils from "@babel/helper-plugin-utils";

const { declare } = helperPluginUtils;
const EVENT_ALIASES = new Map([
  ["doubleclick", { name: "dblclick" }],
  ["focus", { name: "focusin", capture: true }],
  ["blur", { name: "focusout", capture: true }],
]);

function camelToLower(name) {
  return name.replace(/[A-Z]/g, (match) => match.toLowerCase());
}

function normalizeEventName(name, { lowercaseEventNames = true } = {}) {
  if (!lowercaseEventNames) {
    return name;
  }

  return camelToLower(name);
}

function resolveEventDescriptor(name, opts) {
  const normalized = normalizeEventName(name, opts);
  const alias = EVENT_ALIASES.get(normalized);

  if (!alias) {
    return { name: normalized, capture: false };
  }

  return {
    name: alias.name || normalized,
    capture: Boolean(alias.capture),
  };
}

function ensureBooleanOption(objectExpr, key, value, t) {
  const existing = objectExpr.properties.find(
    (prop) =>
      t.isObjectProperty(prop) &&
      !prop.computed &&
      t.isIdentifier(prop.key, { name: key })
  );

  if (existing) {
    existing.value = value;
    return objectExpr;
  }

  objectExpr.properties.push(t.objectProperty(t.identifier(key), value));
  return objectExpr;
}

function wrapWithCapture(expression) {
  const t = this;
  const captureLiteral = t.booleanLiteral(true);

  if (t.isObjectExpression(expression)) {
    const clone = t.cloneNode(expression, true);
    return ensureBooleanOption(clone, "capture", captureLiteral, t);
  }

  return t.objectExpression([
    t.objectProperty(t.identifier("handleEvent"), t.cloneNode(expression, true)),
    t.objectProperty(t.identifier("capture"), captureLiteral),
  ]);
}

function extractExpression(value, t) {
  if (!value) {
    return t.booleanLiteral(true);
  }

  if (t.isJSXExpressionContainer(value)) {
    const { expression } = value;
    if (!expression || expression.type === "JSXEmptyExpression") {
      return t.booleanLiteral(true);
    }
    return t.cloneNode(expression, true);
  }

  if (t.isStringLiteral(value)) {
    return t.stringLiteral(value.value);
  }

  return t.cloneNode(value, true);
}

function transformAttribute(attrPath, opts, t) {
  if (!attrPath.isJSXAttribute()) return false;

  const { node } = attrPath;
  if (!t.isJSXIdentifier(node.name)) return false;

  const rawName = node.name.name;
  if (!/^on[A-Z]/.test(rawName)) return false;

  let eventName = rawName.slice(2);
  let capture = false;

  if (eventName.endsWith("Capture")) {
    capture = true;
    eventName = eventName.slice(0, -7);
  }

  if (!eventName) {
    throw attrPath.buildCodeFrameError(
      `React-style event attribute \"${rawName}\" is missing a target name`
    );
  }

  const descriptor = resolveEventDescriptor(eventName, opts);
  const newIdentifier = t.jsxIdentifier(`@${descriptor.name}`);

  const expression = extractExpression(node.value, t);
  const finalExpression = capture || descriptor.capture
    ? wrapWithCapture.call(t, expression)
    : expression;
  const jsxValue = t.jsxExpressionContainer(finalExpression);

  attrPath.replaceWith(t.jsxAttribute(newIdentifier, jsxValue));
  return true;
}

function transformTemplateLiteral(quasi, opts, t) {
  const { quasis, expressions } = quasi;

  for (let index = 0; index < expressions.length; index += 1) {
    const head = quasis[index];
    const tail = quasis[index + 1];
    if (!tail) continue;

    const rawHead = head.value.raw;
    const cookedHead = head.value.cooked;

    const match = rawHead.match(/(\s*)(on)([A-Z][A-Za-z0-9]*?)(Capture)?="$/);
    if (!match) continue;

    const [, leading, , eventBase, captureSuffix] = match;
    const descriptor = resolveEventDescriptor(eventBase, opts);
    const replacement = `${leading}@${descriptor.name}=`;

    const prefixRaw = rawHead.slice(0, rawHead.length - match[0].length);
    const prefixCooked = cookedHead.slice(0, cookedHead.length - match[0].length);

    head.value.raw = `${prefixRaw}${replacement}`;
    head.value.cooked = `${prefixCooked}${replacement}`;

    if (tail.value.raw.startsWith('"')) {
      tail.value.raw = tail.value.raw.slice(1);
      tail.value.cooked = tail.value.cooked.slice(1);
    }

    if (captureSuffix || descriptor.capture) {
      expressions[index] = wrapWithCapture.call(t, expressions[index]);
    }
  }
}

export default declare((api, options) => {
  api.assertVersion(7);
  const t = api.types;

  return {
    name: "@litsx/babel-plugin-transform-react-events",
    visitor: {
      JSXOpeningElement(path) {
        path.get("attributes").forEach((attrPath) => {
          transformAttribute(attrPath, options || {}, t);
        });
      },
      TaggedTemplateExpression(path) {
        const { node } = path;
        if (!t.isTemplateLiteral(node.quasi)) return;
        transformTemplateLiteral(node.quasi, options || {}, t);
      },
    },
  };
});
