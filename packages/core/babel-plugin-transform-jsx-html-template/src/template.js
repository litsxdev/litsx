import babelTypes from "@babel/types";
import babelGenerator from "@babel/generator";

const t = babelTypes.default || babelTypes;
const generator = babelGenerator.default || babelGenerator;

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

function addString(strings, keys, string) {
  const trimmedString = trimString(string);
  if (strings.length <= keys.length) {
    strings.push(t.templateElement({ raw: trimmedString }));
  } else {
    const last = strings[strings.length - 1];
    last.value.raw += trimmedString;
  }
}

function addKey(strings, keys, key) {
  if (strings.length <= keys.length) {
    strings.push(t.templateElement({ raw: "" }));
  }
  keys.push(key);
}

function getTag(node) {
  const name = generator(node.name).code;
  const isCapitalized = name.charAt(0) === name.charAt(0).toUpperCase();
  const isComponent = !isCapitalized && node.name.type !== "JSXIdentifier";
  if (isCapitalized) {
    console.log('DEBUG: Capitalized name:', name, 'isComponent:', isComponent);
    if (isComponent) throw new Error('Capitalized treated as component');
  }
  return { name, isComponent };
}

function createComponent(name, node) {
  const attributes = t.objectExpression(
    node.openingElement.attributes.map((attr) => {
      if (attr.type === "JSXSpreadAttribute") {
        return t.spreadElement(attr.argument);
      }

      const value = attr.value
        ? attr.value.expression || attr.value
        : t.booleanLiteral(true);

      const rawName = attr.name.name;
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

  return t.callExpression(t.identifier(name), [attributes, children]);
}

const transforms = {
  JSXElement({ node, strings, keys }, opts) {
    const { name, isComponent } = getTag(node.openingElement);

    if (isComponent) {
      addKey(strings, keys, createComponent(name, node));
      return;
    }

    addString(strings, keys, `<${name}`);

    node.openingElement.attributes.forEach((attr) => {
      if (attr.type === "JSXSpreadAttribute") {
        throw new Error("JSXSpreadAttribute is not supported");
      }

      const rawName = attr.name.name;
      const prefix = rawName[0];

      if (prefix === "." || prefix === "@" || prefix === "?") {
        const litName = `${prefix}${rawName.slice(1)}`;
        addString(strings, keys, ` ${litName}=`);

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

      addString(strings, keys, ` ${rawName}`);

      if (attr.value) {
        addString(strings, keys, '="');
        if (attr.value.type === "JSXExpressionContainer") {
          addKey(strings, keys, attr.value.expression);
        } else {
          addString(strings, keys, attr.value.value);
        }
        addString(strings, keys, '"');
      }
    });

    if (node.openingElement.selfClosing) {
      addString(strings, keys, " /");
    }
    addString(strings, keys, ">");

    node.children.forEach((child) => transforms[child.type]({ node: child, strings, keys }, opts));

    if (!node.closingElement) return;
    addString(strings, keys, `</${node.closingElement.name.name}>`);
  },
  JSXSpreadChild() {
    throw new Error("JSXSpreadChild is not supported");
  },
  JSXText({ node, strings, keys }) {
    addString(strings, keys, node.value);
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
    addString(strings, keys, "");
  }

  return t.templateLiteral(strings, keys);
}

export function createTaggedTemplate(node, opts, tag = "html") {
  const literal = buildTemplate(node, opts);
  return tag ? t.taggedTemplateExpression(t.identifier(tag), literal) : literal;
}
