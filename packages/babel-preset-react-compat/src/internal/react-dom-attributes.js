import helperPluginUtils from "@babel/helper-plugin-utils";

const { declare } = helperPluginUtils;

const PROPERTY_VALUE_TAGS = new Set(["input", "textarea", "select"]);
const DEFAULT_VALUE_PROPERTY_TAGS = new Set(["select"]);
const DEFAULT_VALUE_ATTRIBUTE_TAGS = new Set(["input", "textarea", "option"]);
const CHANGE_EVENT_INPUT_TYPES = new Set(["checkbox", "radio", "file"]);

function stringifyJsxName(nameNode, t) {
  if (t.isJSXIdentifier(nameNode)) {
    return nameNode.name;
  }

  return null;
}

function isNativeTag(openingElement, t) {
  const name = stringifyJsxName(openingElement.name, t);
  if (!name) return false;
  return name[0] === name[0]?.toLowerCase();
}

function getTagName(openingElement, t) {
  const name = stringifyJsxName(openingElement.name, t);
  return name?.toLowerCase() ?? null;
}

function getRawAttributeName(attrPath) {
  const namePath = attrPath.get("name");
  if (!namePath.isJSXIdentifier()) return null;
  return namePath.node.name;
}

function getStaticStringAttributeValue(attrPath) {
  const valuePath = attrPath.get("value");
  if (!valuePath.node) return null;
  if (valuePath.isStringLiteral()) {
    return valuePath.node.value;
  }
  if (valuePath.isJSXExpressionContainer()) {
    const expressionPath = valuePath.get("expression");
    if (expressionPath.isStringLiteral()) {
      return expressionPath.node.value;
    }
  }
  return null;
}

function renameAttribute(attrPath, nextName, t) {
  attrPath.node.name = t.jsxIdentifier(nextName);
}

function shouldNormalizeInputChange(tagName, attrPaths) {
  if (tagName !== "input") {
    return tagName === "textarea";
  }

  const nameSet = new Set(
    attrPaths
      .map((attrPath) => getRawAttributeName(attrPath))
      .filter(Boolean)
  );

  if (nameSet.has("checked") || nameSet.has("defaultChecked") || nameSet.has("?checked")) {
    return false;
  }

  const typeAttrPath = attrPaths.find(
    (attrPath) => getRawAttributeName(attrPath) === "type"
  );
  const typeValue = typeAttrPath ? getStaticStringAttributeValue(typeAttrPath) : null;
  if (!typeValue) {
    return true;
  }

  return !CHANGE_EVENT_INPUT_TYPES.has(typeValue.toLowerCase());
}

function transformJsxOpeningElement(path, t) {
  if (!isNativeTag(path.node, t)) return;

  const tagName = getTagName(path.node, t);
  const attrPaths = path.get("attributes").filter((attrPath) => attrPath.isJSXAttribute());
  const rawNames = new Set(attrPaths.map((attrPath) => getRawAttributeName(attrPath)).filter(Boolean));

  attrPaths.forEach((attrPath) => {
    const rawName = getRawAttributeName(attrPath);
    if (!rawName) return;

    if (rawName === "htmlFor") {
      renameAttribute(attrPath, "for", t);
      return;
    }

    if (rawName === "onChange") {
      if (shouldNormalizeInputChange(tagName, attrPaths)) {
        renameAttribute(attrPath, "onInput", t);
      }
      return;
    }

    if (rawName === "value" && PROPERTY_VALUE_TAGS.has(tagName)) {
      renameAttribute(attrPath, ".value", t);
      return;
    }

    if (rawName === "checked" && tagName === "input") {
      renameAttribute(attrPath, "?checked", t);
      return;
    }

    if (rawName === "selected" && tagName === "option") {
      renameAttribute(attrPath, "?selected", t);
      return;
    }

    if (rawName === "defaultValue") {
      if (rawNames.has("value") || rawNames.has(".value")) {
        attrPath.remove();
        return;
      }

      if (DEFAULT_VALUE_PROPERTY_TAGS.has(tagName)) {
        renameAttribute(attrPath, ".value", t);
        return;
      }

      if (DEFAULT_VALUE_ATTRIBUTE_TAGS.has(tagName)) {
        renameAttribute(attrPath, "value", t);
      }
      return;
    }

    if (rawName === "defaultChecked" && tagName === "input") {
      if (rawNames.has("checked") || rawNames.has("?checked")) {
        attrPath.remove();
        return;
      }

      renameAttribute(attrPath, "?checked", t);
    }
  });
}

function getOpenTagContext(quasi, index) {
  const rawUpToHead = quasi.quasis.slice(0, index + 1).map((part) => part.value.raw).join("");
  const start = rawUpToHead.lastIndexOf("<");
  if (start === -1) return null;

  const candidate = rawUpToHead.slice(start);
  if (candidate.includes(">")) {
    return null;
  }

  const match = candidate.match(/^<([a-z][\w-]*)([\s\S]*)$/i);
  if (!match) return null;

  return {
    tagName: match[1].toLowerCase(),
    attrsSource: match[2] || "",
  };
}

function shouldNormalizeTemplateInputChange(context) {
  if (!context) return false;
  if (context.tagName === "textarea") return true;
  if (context.tagName !== "input") return false;

  if (/(?:\s|\?)(?:checked|defaultChecked)(?=\s*=|\s|$)/i.test(context.attrsSource)) {
    return false;
  }

  const typeMatch = context.attrsSource.match(/\stype="([^"]*)"/i);
  if (!typeMatch) {
    return true;
  }

  return !CHANGE_EVENT_INPUT_TYPES.has(typeMatch[1].toLowerCase());
}

function renameTemplateAttribute(head, rawName, nextName) {
  const pattern = new RegExp(`(\\s)${rawName}(?=\\s*=)`, "g");
  head.value.raw = head.value.raw.replace(pattern, `$1${nextName}`);
  head.value.cooked = head.value.cooked.replace(pattern, `$1${nextName}`);
}

function transformTemplateLiteral(quasi) {
  for (let index = 0; index < quasi.expressions.length; index += 1) {
    const head = quasi.quasis[index];
    const context = getOpenTagContext(quasi, index);
    if (!context) continue;

    if (/\shtmlFor="$/.test(head.value.raw)) {
      renameTemplateAttribute(head, "htmlFor", "for");
      continue;
    }

    if (/\sonChange="$/.test(head.value.raw) && shouldNormalizeTemplateInputChange(context)) {
      renameTemplateAttribute(head, "onChange", "onInput");
      continue;
    }

    if (/\svalue="$/.test(head.value.raw) && PROPERTY_VALUE_TAGS.has(context.tagName)) {
      renameTemplateAttribute(head, "value", ".value");
      continue;
    }

    if (/\schecked="$/.test(head.value.raw) && context.tagName === "input") {
      renameTemplateAttribute(head, "checked", "?checked");
      continue;
    }

    if (/\sdefaultValue="$/.test(head.value.raw)) {
      if (DEFAULT_VALUE_PROPERTY_TAGS.has(context.tagName)) {
        renameTemplateAttribute(head, "defaultValue", ".value");
        continue;
      }

      if (DEFAULT_VALUE_ATTRIBUTE_TAGS.has(context.tagName)) {
        renameTemplateAttribute(head, "defaultValue", "value");
        continue;
      }
    }

    if (/\sdefaultChecked="$/.test(head.value.raw) && context.tagName === "input") {
      renameTemplateAttribute(head, "defaultChecked", "?checked");
      continue;
    }

    if (/\sselected="$/.test(head.value.raw) && context.tagName === "option") {
      renameTemplateAttribute(head, "selected", "?selected");
    }
  }

  quasi.quasis.forEach((part) => {
    part.value.raw = part.value.raw.replace(/(\s)htmlFor(?=\s*=)/g, "$1for");
    part.value.cooked = part.value.cooked.replace(/(\s)htmlFor(?=\s*=)/g, "$1for");
  });
}

export default declare((api) => {
  api.assertVersion(7);
  const t = api.types;

  return {
    name: "@litsx/babel-plugin-transform-react-dom-attributes",
    visitor: {
      JSXOpeningElement(path) {
        transformJsxOpeningElement(path, t);
      },
      TaggedTemplateExpression(path) {
        transformTemplateLiteral(path.node.quasi);
      },
    },
  };
});
