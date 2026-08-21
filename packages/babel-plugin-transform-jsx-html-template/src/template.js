import { decodeVirtualAttributeName } from "@litsx/authoring";

let t;

const VOID_HTML_TAGS = new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "param",
  "source",
  "track",
  "wbr",
]);
const ATTRIBUTE_PASSTHROUGH_NAMES = new Set([
  "class", "className", "id", "slot", "style", "part", "exportparts",
  "role", "title", "tabindex", "tabIndex",
]);
const DANGEROUS_OBJECT_KEYS = new Set([
  "__proto__",
  "constructor",
  "prototype",
]);
const NOSCRIPT_COMPONENT_ATTRIBUTE = "data-litsx-noscript-component";

export function setTemplateTypes(types) {
  t = types;
}

export function collectLitAttributeSourcemapMetadata(node, mappings = [], options = {}) {
  if (!node) {
    return mappings;
  }

  if (t.isJSXElement(node)) {
    for (const attr of node.openingElement.attributes) {
      if (attr.type !== "JSXAttribute") {
        continue;
      }

      const rawName = decodeVirtualAttributeName(attr.name.name) ?? attr.name.name;
      const prefix = rawName[0];
      const generatedName =
        prefix === "." || prefix === "@" || prefix === "?"
          ? `${prefix}${rawName.slice(1)}`
          : rawName;
      const sourceLocation = attr.name?.loc ?? attr.loc ?? null;

      mappings.push({
        generatedNeedle: attr.value
          ? ` ${generatedName}=`
          : ` ${generatedName}`,
        generatedOffset: 1,
        generatedScope: "html-template",
        source: sourceLocation?.filename ?? options.sourceFileName ?? null,
        line: sourceLocation?.start?.line ?? null,
        column: sourceLocation?.start?.column ?? null,
      });
    }

    for (const child of node.children) {
      collectLitAttributeSourcemapMetadata(child, mappings, options);
    }
    return mappings;
  }

  if (t.isJSXFragment(node)) {
    for (const child of node.children) {
      collectLitAttributeSourcemapMetadata(child, mappings, options);
    }
  }

  return mappings;
}

function trimString(string) {
  return string.replace(/\s+/g, (match, offset, full) => {
    if (offset === 0) {
      return /^ *\n/.test(match) ? "" : match;
    }
    if (match.length + offset === full.length) {
      return /\n *$/.test(match) ? "" : match;
    }
    return /\n/.test(match) ? " " : match;
  });
}

function copySourceLocation(target, startNode, endNode = startNode) {
  if (!startNode?.loc || !endNode?.loc) {
    return target;
  }

  target.start = startNode.start;
  target.end = endNode.end;
  target.loc = {
    filename: startNode.loc.filename ?? endNode.loc.filename,
    identifierName: startNode.loc.identifierName,
    start: startNode.loc.start,
    end: endNode.loc.end,
  };

  return target;
}

function escapeTemplateLiteralRawSegment(value) {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/`/g, "\\`")
    .replace(/\$\{/g, "\\${");
}

function addString(strings, keys, string, startNode = null, endNode = startNode) {
  const trimmedString = trimString(string);
  if (!trimmedString) {
    return;
  }

  const escapedRawString = escapeTemplateLiteralRawSegment(trimmedString);

  if (strings.length <= keys.length) {
    const templateElement = t.templateElement(
      { raw: escapedRawString, cooked: trimmedString },
      false
    );
    copySourceLocation(templateElement, startNode, endNode);
    strings.push(templateElement);
  } else {
    const last = strings[strings.length - 1];
    last.value.raw += escapedRawString;
    last.value.cooked = (last.value.cooked ?? "") + trimmedString;
    if (startNode?.loc && !last.loc) {
      copySourceLocation(last, startNode, endNode);
    } else if (last.loc && endNode?.loc) {
      last.end = endNode.end;
      last.loc = {
        ...last.loc,
        end: endNode.loc.end,
      };
    }
  }
}

function addKey(strings, keys, key) {
  if (strings.length <= keys.length) {
    strings.push(t.templateElement({ raw: "", cooked: "" }, false));
  }
  keys.push(key);
}

function createJsxReplacement(node, opts) {
  const hasTagOption = Object.prototype.hasOwnProperty.call(opts || {}, "tag");
  const tag = hasTagOption ? opts.tag : "html";

  if (tag) {
    return createTaggedTemplate(node, opts, tag);
  }

  return buildTemplate(node, opts);
}

function lowerEmbeddedJsx(node, opts) {
  if (!node || typeof node !== "object") {
    return node;
  }

  if (t.isJSXElement(node) || t.isJSXFragment(node)) {
    return createJsxReplacement(node, opts);
  }

  const visitorKeys = t.VISITOR_KEYS?.[node.type];
  if (!visitorKeys) {
    return node;
  }

  for (const key of visitorKeys) {
    if (DANGEROUS_OBJECT_KEYS.has(key)) {
      continue;
    }

    const value = node[key];
    if (Array.isArray(value)) {
      node[key] = value.map((child) => lowerEmbeddedJsx(child, opts));
      continue;
    }

    if (value && typeof value === "object") {
      node[key] = lowerEmbeddedJsx(value, opts);
    }
  }

  return node;
}

function materializeChildExpression(node, opts) {
  const expression = lowerEmbeddedJsx(node, opts);

  if (
    (t.isArrowFunctionExpression(expression) || t.isFunctionExpression(expression)) &&
    expression.params.length === 0 &&
    expression.async !== true &&
    expression.generator !== true
  ) {
    return t.callExpression(expression, []);
  }

  return expression;
}

function stringifyJsxName(nameNode) {
  if (t.isJSXIdentifier(nameNode)) {
    return nameNode.name;
  }

  if (t.isJSXMemberExpression(nameNode)) {
    return `${stringifyJsxName(nameNode.object)}.${nameNode.property.name}`;
  }

  if (t.isJSXNamespacedName(nameNode)) {
    return `${nameNode.namespace.name}:${nameNode.name.name}`;
  }

  return "unknown";
}

function toKebab(name) {
  return name.replace(/([a-z])([A-Z])/g, "$1-$2").toLowerCase();
}

function getTag(node) {
  if (t.isJSXIdentifier(node.name)) {
    const originalName = node.name.name;
    const routedComponentName = node.__litsxRestComponentName;
    const isCapitalized =
      originalName.charAt(0) === originalName.charAt(0).toUpperCase() &&
      originalName.charAt(0) !== originalName.charAt(0).toLowerCase();

    return {
      name: isCapitalized ? toKebab(originalName) : originalName,
      isComponent: false,
      isAuthoredComponentTag: isCapitalized || Boolean(routedComponentName),
      componentExpression: routedComponentName
        ? t.identifier(routedComponentName)
        : isCapitalized
          ? t.identifier(originalName)
          : null,
    };
  }

  return {
    name: stringifyJsxName(node.name),
    isComponent: true,
    isAuthoredComponentTag: false,
    componentExpression: null,
  };
}

function isVoidHtmlTagName(name) {
  return VOID_HTML_TAGS.has(String(name).toLowerCase());
}

function isNoscriptElement(node) {
  return t.isJSXIdentifier(node?.openingElement?.name, { name: "noscript" });
}

function collectNoscriptScopedElements(node) {
  const elements = new Map();

  function visit(current) {
    if (!current || typeof current !== "object") {
      return;
    }

    if (t.isJSXElement(current)) {
      const { name, isComponent, isAuthoredComponentTag } = getTag(current.openingElement);
      if (isComponent) {
        throw new Error(
          "LitSX <noscript> fallback content does not support member-expression components.",
        );
      }
      if (isAuthoredComponentTag) {
        elements.set(name, createComponentCallee(current.openingElement.name));
      }
      const metadata = current.openingElement.attributes.find((attribute) =>
        attribute.type === "JSXAttribute" && attribute.name.name === NOSCRIPT_COMPONENT_ATTRIBUTE,
      );
      if (metadata?.value?.type === "JSXExpressionContainer") {
        elements.set(name, metadata.value.expression);
      }
    }

    const visitorKeys = t.VISITOR_KEYS?.[current.type] ?? [];
    for (const key of visitorKeys) {
      const value = current[key];
      if (Array.isArray(value)) {
        value.forEach(visit);
      } else {
        visit(value);
      }
    }
  }

  node.children.forEach(visit);
  return elements;
}

function createNoscriptFallback(node, opts) {
  const elements = collectNoscriptScopedElements(node);
  opts.__litsxNeedsNoscriptRuntime = true;
  const children = t.jsxFragment(
    t.jsxOpeningFragment(),
    t.jsxClosingFragment(),
    node.children,
  );
  const fallbackTemplate = createTaggedTemplate(children, opts, "html");
  const args = [t.arrowFunctionExpression([], fallbackTemplate)];
  if (opts.ssr === true && elements.size > 0) {
    args.push(t.objectExpression(
      [...elements].map(([tagName, ctor]) =>
        t.objectProperty(t.stringLiteral(tagName), ctor),
      ),
    ));
  }
  return t.callExpression(t.identifier("__litsxNoscript"), args);
}

function createComponent(node, opts = {}) {
  const attributes = t.objectExpression(
    node.openingElement.attributes.map((attr) => {
      if (attr.type === "JSXSpreadAttribute") {
        return t.spreadElement(attr.argument);
      }

      const rawName = decodeVirtualAttributeName(attr.name.name) ?? attr.name.name;
      const value = attr.value
        ? attr.value.expression || attr.value
        : t.booleanLiteral(true);
      const nextValue = attr.value?.type === "JSXExpressionContainer"
        ? lowerEmbeddedJsx(value, opts)
        : value;

      const isValidIdentifier = /^[$_a-zA-Z][$_a-zA-Z0-9]*$/.test(rawName);
      const key = isValidIdentifier
        ? t.identifier(rawName)
        : t.stringLiteral(rawName);

      return copySourceLocation(
        t.objectProperty(key, nextValue),
        attr,
        attr,
      );
    })
  );
  copySourceLocation(attributes, node.openingElement, node.openingElement);

  const children = t.jsxFragment(
    t.jsxOpeningFragment(),
    t.jsxClosingFragment(),
    node.children
  );
  copySourceLocation(children, node, node);

  const callExpression = t.callExpression(
    createComponentCallee(node.openingElement.name),
    [attributes, children],
  );
  return copySourceLocation(
    callExpression,
    node.openingElement,
    node.closingElement ?? node.openingElement,
  );
}

function createComponentCallee(nameNode) {
  if (t.isJSXIdentifier(nameNode)) {
    return t.identifier(nameNode.name);
  }

  if (t.isJSXMemberExpression(nameNode)) {
    return t.memberExpression(
      createComponentCallee(nameNode.object),
      t.identifier(nameNode.property.name)
    );
  }

  if (t.isJSXNamespacedName(nameNode)) {
    return t.memberExpression(
      t.identifier(nameNode.namespace.name),
      t.identifier(nameNode.name.name)
    );
  }

  return t.identifier(stringifyJsxName(nameNode));
}

function shouldLowerAuthoredComponentAttributeAsProperty(attr, rawName, opts) {
  if (
    opts?.componentAttributeFallback === false ||
    rawName.startsWith(".") || rawName.startsWith("?") || rawName.startsWith("@") ||
    rawName.startsWith("data-") || rawName.startsWith("aria-") ||
    ATTRIBUTE_PASSTHROUGH_NAMES.has(rawName) ||
    !/^[$_a-zA-Z][$_a-zA-Z0-9]*$/.test(rawName)
  ) {
    return false;
  }
  return !attr.value || attr.value.type === "JSXExpressionContainer";
}

function getAttributeValue(attr, opts) {
  if (!attr.value) {
    return t.booleanLiteral(true);
  }
  if (attr.value.type === "JSXExpressionContainer") {
    return lowerEmbeddedJsx(attr.value.expression, opts);
  }
  if (attr.value.type === "StringLiteral") {
    return t.stringLiteral(attr.value.value);
  }
  return t.cloneNode(attr.value, true);
}

function createSpreadElementCall(node, opts, name, isAuthoredComponentTag, componentExpression, namespace, childOptions) {
  const sources = [];
  let adjacentProperties = [];
  const flushAdjacentProperties = () => {
    if (adjacentProperties.length === 0) return;
    sources.push(t.objectExpression(adjacentProperties));
    adjacentProperties = [];
  };

  node.openingElement.attributes.forEach((attr) => {
    if (attr.type === "JSXSpreadAttribute") {
      flushAdjacentProperties();
      sources.push(lowerEmbeddedJsx(t.cloneNode(attr.argument, true), opts));
      return;
    }

    const jsxName = stringifyJsxName(attr.name);
    const rawName = decodeVirtualAttributeName(jsxName) ?? jsxName;
    const key = /^[$_a-zA-Z][$_a-zA-Z0-9]*$/.test(rawName)
      ? t.identifier(rawName)
      : t.stringLiteral(rawName);
    adjacentProperties.push(
      t.objectProperty(key, getAttributeValue(attr, opts)),
    );
  });
  flushAdjacentProperties();

  const children = t.jsxFragment(
    t.jsxOpeningFragment(),
    t.jsxClosingFragment(),
    node.children.map((child) => t.cloneNode(child, true))
  );
  const isVoid = isVoidHtmlTagName(name);
  const helperName = opts?.spreadHelperName || "jsxSpreadElement";
  const hasChildren = !isVoid && node.children.some(
    (child) => child.type !== "JSXText" || trimString(child.value) !== ""
  );
  const args = [
    t.stringLiteral(name),
    t.arrayExpression(sources),
    t.objectExpression([
      t.objectProperty(
        t.identifier("component"),
        componentExpression
          ? t.cloneNode(componentExpression, true)
          : t.booleanLiteral(isAuthoredComponentTag || name.includes("-"))
      ),
      t.objectProperty(t.identifier("void"), t.booleanLiteral(isVoid)),
      ...(namespace === "svg"
        ? [t.objectProperty(t.identifier("namespace"), t.stringLiteral("svg"))]
        : []),
      ...(opts?.reactCompatEvents === true
        ? [t.objectProperty(t.identifier("reactCompatEvents"), t.booleanLiteral(true))]
        : []),
      ...(opts?.reactCompatRefs === true
        ? [t.objectProperty(
          t.identifier("refAdapter"),
          t.identifier(opts?.reactRefAdapterName || "toLitRef")
        )]
        : []),
    ]),
  ];
  if (hasChildren) args.push(createJsxReplacement(children, childOptions));
  return t.callExpression(t.identifier(helperName), args);
}

const transforms = {
  JSXElement({ node, strings, keys }, opts) {
    const { name, isComponent, isAuthoredComponentTag, componentExpression } = getTag(node.openingElement);
    const inheritedNamespace = opts?.jsxNamespace ?? (opts?.tag === "svg" ? "svg" : "html");
    const namespace = inheritedNamespace === "svg" || name === "svg" ? "svg" : "html";
    const childOptions = namespace === "svg" && name === "foreignObject"
      ? { ...opts, jsxNamespace: "html" }
      : { ...opts, jsxNamespace: namespace };

    if (isComponent) {
      addKey(strings, keys, createComponent(node, opts));
      return;
    }

    const isNoscript = isNoscriptElement(node);
    const hasSpreadAttributes = node.openingElement.attributes.some(
      (attr) => attr.type === "JSXSpreadAttribute"
    );
    const routeComponentRestProps = opts?.componentRestProps === true &&
      isAuthoredComponentTag && node.openingElement.__litsxRouteRestProps === true &&
      node.openingElement.attributes.length > 0;
    if ((hasSpreadAttributes || routeComponentRestProps) && !isNoscript) {
      addKey(
        strings,
        keys,
        createSpreadElementCall(node, opts, name, isAuthoredComponentTag, componentExpression, namespace, childOptions)
      );
      return;
    }

    addString(strings, keys, `<${name}`, node.openingElement, node.openingElement.name);

    node.openingElement.attributes.forEach((attr) => {
      if (attr.type === "JSXSpreadAttribute") {
        return;
      }
      const jsxName = stringifyJsxName(attr.name);
      if (jsxName === NOSCRIPT_COMPONENT_ATTRIBUTE) {
        return;
      }
      const rawName = decodeVirtualAttributeName(jsxName) ?? jsxName;
      const prefix = rawName[0];

      if (rawName === "ref") {
        const value = attr.value?.type === "JSXExpressionContainer"
          ? lowerEmbeddedJsx(attr.value.expression, opts)
          : attr.value
            ? t.cloneNode(attr.value, true)
            : t.identifier("undefined");
        if (isAuthoredComponentTag || name.includes("-")) {
          addString(strings, keys, " .ref=", attr);
          addKey(
            strings,
            keys,
            opts?.reactCompatRefs === true
              ? t.callExpression(t.identifier(opts?.reactRefAdapterName || "toLitRef"), [value])
              : value,
          );
          return;
        }
        const adaptedValue = opts?.reactCompatRefs === true
          ? t.callExpression(t.identifier(opts?.reactRefAdapterName || "toLitRef"), [value])
          : value;
        addString(strings, keys, " ", attr);
        addKey(strings, keys, t.callExpression(
          t.identifier(opts?.refDirectiveName || "ref"),
          [adaptedValue]
        ));
        return;
      }

      if (isAuthoredComponentTag && shouldLowerAuthoredComponentAttributeAsProperty(attr, rawName, opts)) {
        addString(strings, keys, ` .${rawName}=`, attr);
        addKey(
          strings,
          keys,
          attr.value
            ? lowerEmbeddedJsx(attr.value.expression, opts)
            : t.booleanLiteral(true),
        );
        return;
      }

      if (prefix === "." || prefix === "@" || prefix === "?") {
        const litName = `${prefix}${rawName.slice(1)}`;
        addString(strings, keys, ` ${litName}=`, attr);

        if (attr.value) {
          if (attr.value.type === "JSXExpressionContainer") {
            const expression = lowerEmbeddedJsx(attr.value.expression, opts);
            addKey(
              strings,
              keys,
              rawName === ".ref" && opts?.reactCompatRefs === true
                ? t.callExpression(t.identifier(opts?.reactRefAdapterName || "toLitRef"), [expression])
                : expression,
            );
          } else if (attr.value.type === "StringLiteral") {
            addKey(strings, keys, t.stringLiteral(attr.value.value));
          } else {
            addKey(strings, keys, attr.value);
          }
        } else {
          addKey(strings, keys, t.booleanLiteral(true));
        }

        return;
      }

      addString(strings, keys, ` ${rawName}`, attr.name);

      if (attr.value) {
        addString(strings, keys, '="', attr.name, attr.value);
        if (attr.value.type === "JSXExpressionContainer") {
          addKey(strings, keys, lowerEmbeddedJsx(attr.value.expression, opts));
        } else {
          addString(strings, keys, attr.value.value, attr.value);
        }
        addString(strings, keys, '"', attr.value);
      }
    });

    if (isNoscript) {
      addString(strings, keys, ' data-litsx-noscript="', node.openingElement);
      addKey(strings, keys, createNoscriptFallback(node, opts));
      addString(strings, keys, '"', node.openingElement);
    }

    addString(strings, keys, ">", node.openingElement);

    if (node.openingElement.selfClosing) {
      if (isVoidHtmlTagName(name)) {
        return;
      }

      addString(strings, keys, `</${name}>`, node.openingElement);
      return;
    }

    if (isNoscript) {
      // parse5 intentionally treats <noscript> contents as raw text while
      // compiling hydratable Lit templates. Keep dynamic fallback content out
      // of that template and hand it to the SSR-only primitive instead.
    } else {
      node.children.forEach((child) => transforms[child.type]({ node: child, strings, keys }, childOptions));
    }

    if (!node.closingElement) return;
    addString(strings, keys, `</${stringifyJsxName(node.closingElement.name)}>`, node.closingElement);
  },
  JSXSpreadChild() {
    throw new Error("JSXSpreadChild is not supported");
  },
  JSXText({ node, strings, keys }) {
    addString(strings, keys, node.value, node);
  },
  JSXExpressionContainer({ node, strings, keys }, opts) {
    if (node.expression.type === "JSXEmptyExpression") return;
    addKey(strings, keys, materializeChildExpression(node.expression, opts));
  },
  JSXFragment({ node, strings, keys }, opts) {
    node.children.forEach((child) =>
      transforms[child.type]({ node: child, strings, keys }, opts)
    );
  },
};

export function buildTemplate(node, opts) {
  const strings = [];
  const keys = [];
  transforms[node.type]({ node, strings, keys }, opts);

  while (strings.length <= keys.length) {
    strings.push(t.templateElement({ raw: "", cooked: "" }, false));
  }

  return copySourceLocation(
    t.templateLiteral(strings, keys),
    node,
    node,
  );
}

export function createTaggedTemplate(node, opts, tag = "html") {
  const literal = buildTemplate(node, opts);
  if (!tag) {
    return literal;
  }

  return copySourceLocation(
    t.taggedTemplateExpression(t.identifier(tag), literal),
    node,
    node,
  );
}
