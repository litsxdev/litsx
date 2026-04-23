import { decodeVirtualAttributeName } from "../../jsx-authoring/src/index.js";

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

export function setTemplateTypes(types) {
  t = types;
}

export function collectLitAttributeSourcemapMetadata(node, mappings = [], options = {}) {
  if (!node) {
    return mappings;
  }

  if (t.isJSXElement(node)) {
    const { isComponent } = getTag(node.openingElement);

    if (!isComponent) {
      for (const attr of node.openingElement.attributes) {
        if (attr.type !== "JSXAttribute") {
          continue;
        }

        const rawName = decodeVirtualAttributeName(attr.name.name) ?? attr.name.name;
        const prefix = rawName[0];
        if (prefix === "." || prefix === "@" || prefix === "?") {
          mappings.push({
            generatedNeedle: ` ${prefix}${rawName.slice(1)}=`,
            generatedOffset: 1,
            source: attr.loc?.filename ?? options.sourceFileName ?? null,
            line: attr.loc?.start?.line ?? null,
            column: attr.loc?.start?.column ?? null,
          });
        }
      }
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

function addString(strings, keys, string, startNode = null, endNode = startNode) {
  const trimmedString = trimString(string);
  if (!trimmedString) {
    return;
  }

  if (strings.length <= keys.length) {
    const templateElement = t.templateElement(
      { raw: trimmedString, cooked: trimmedString },
      false
    );
    copySourceLocation(templateElement, startNode, endNode);
    strings.push(templateElement);
  } else {
    const last = strings[strings.length - 1];
    last.value.raw += trimmedString;
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

function getTag(node) {
  const name = stringifyJsxName(node.name);
  const isCapitalized = name.charAt(0) === name.charAt(0).toUpperCase();
  const isComponent = !isCapitalized && node.name.type !== "JSXIdentifier";
  return { name, isComponent };
}

function isVoidHtmlTagName(name) {
  return VOID_HTML_TAGS.has(String(name).toLowerCase());
}

function createComponent(node) {
  const attributes = t.objectExpression(
    node.openingElement.attributes.map((attr) => {
      if (attr.type === "JSXSpreadAttribute") {
        return t.spreadElement(attr.argument);
      }

      const value = attr.value
        ? attr.value.expression || attr.value
        : t.booleanLiteral(true);

      const rawName = decodeVirtualAttributeName(attr.name.name) ?? attr.name.name;
      const isValidIdentifier = /^[$_a-zA-Z][$_a-zA-Z0-9]*$/.test(rawName);
      const key = isValidIdentifier
        ? t.identifier(rawName)
        : t.stringLiteral(rawName);

      return t.objectProperty(key, value);
    })
  );

  const children = t.jsxFragment(
    t.jsxOpeningFragment(),
    t.jsxClosingFragment(),
    node.children
  );

  return t.callExpression(createComponentCallee(node.openingElement.name), [attributes, children]);
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

const transforms = {
  JSXElement({ node, strings, keys }, opts) {
    const { name, isComponent } = getTag(node.openingElement);

    if (isComponent) {
      addKey(strings, keys, createComponent(node));
      return;
    }

    addString(strings, keys, `<${name}`, node.openingElement, node.openingElement.name);

    node.openingElement.attributes.forEach((attr) => {
      if (attr.type === "JSXSpreadAttribute") {
        throw new Error("JSXSpreadAttribute is not supported");
      }

      const rawName = decodeVirtualAttributeName(attr.name.name) ?? attr.name.name;
      const prefix = rawName[0];

      if (prefix === "." || prefix === "@" || prefix === "?") {
        const litName = `${prefix}${rawName.slice(1)}`;
        addString(strings, keys, ` ${litName}=`, attr);

        if (attr.value) {
          if (attr.value.type === "JSXExpressionContainer") {
            addKey(strings, keys, attr.value.expression);
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
          addKey(strings, keys, attr.value.expression);
        } else {
          addString(strings, keys, attr.value.value, attr.value);
        }
        addString(strings, keys, '"', attr.value);
      }
    });

    addString(strings, keys, ">", node.openingElement);

    if (node.openingElement.selfClosing) {
      if (isVoidHtmlTagName(name)) {
        return;
      }

      addString(strings, keys, `</${name}>`, node.openingElement);
      return;
    }

    node.children.forEach((child) => transforms[child.type]({ node: child, strings, keys }, opts));

    if (!node.closingElement) return;
    addString(strings, keys, `</${stringifyJsxName(node.closingElement.name)}>`, node.closingElement);
  },
  JSXSpreadChild() {
    throw new Error("JSXSpreadChild is not supported");
  },
  JSXText({ node, strings, keys }) {
    addString(strings, keys, node.value, node);
  },
  JSXExpressionContainer({ node, strings, keys }) {
    if (node.expression.type === "JSXEmptyExpression") return;
    addKey(strings, keys, node.expression);
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

  return t.templateLiteral(strings, keys);
}

export function createTaggedTemplate(node, opts, tag = "html") {
  const literal = buildTemplate(node, opts);
  if (!tag) {
    return literal;
  }

  return t.taggedTemplateExpression(t.identifier(tag), literal);
}
