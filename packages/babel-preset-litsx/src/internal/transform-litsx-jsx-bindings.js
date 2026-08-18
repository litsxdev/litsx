import helperPluginUtils from "@babel/helper-plugin-utils";
import jsxSyntaxPlugin from "@babel/plugin-syntax-jsx";
import { decodeVirtualAttributeName } from "@litsx/authoring";
import {
  createTypeResolver,
  ensureTypescriptModule,
  extractProperties,
  setPropertyBabelTypes,
} from "./transform-litsx-properties.js";

const { declare } = helperPluginUtils;

// `?name` controls attribute presence, so it is only equivalent to JSX's
// boolean value for HTML boolean attributes. Boolean-valued enumerated
// attributes such as draggable and spellcheck must serialize "true"/"false".
const HTML_BOOLEAN_ATTRIBUTE_NAMES = new Set([
  "allowfullscreen",
  "async",
  "autofocus",
  "autoplay",
  "checked",
  "controls",
  "default",
  "defer",
  "disabled",
  "formnovalidate",
  "hidden",
  "inert",
  "ismap",
  "itemscope",
  "loop",
  "multiple",
  "muted",
  "nomodule",
  "novalidate",
  "open",
  "playsinline",
  "readonly",
  "required",
  "reversed",
  "selected",
]);
const HTML_BOOLEAN_VALUE_ATTRIBUTE_NAMES = new Set([
  "contenteditable",
  "draggable",
  "spellcheck",
]);
const HTML_ATTRIBUTE_ALIASES = new Map([
  ["acceptCharset", "accept-charset"],
  ["className", "class"],
  ["htmlFor", "for"],
  ["httpEquiv", "http-equiv"],
]);
const EVENT_ALIASES = new Map([
  ["doubleclick", { name: "dblclick" }],
  ["focus", { name: "focusin", capture: true }],
  ["blur", { name: "focusout", capture: true }],
]);
const INPUT_CHANGE_TYPES = new Set(["checkbox", "radio", "file"]);
const LIVE_VALUE_TAGS = new Set(["input", "textarea", "select"]);
const REACT_BOUNDARY_ATTRIBUTES = new Map([
  ["ErrorBoundary", new Set(["fallback", "onError", "key"])],
  ["Suspense", new Set(["fallback", "key"])],
  ["SuspenseList", new Set(["revealOrder", "tail", "key"])],
]);

function isPascalCaseName(name) {
  return typeof name === "string" && /^[A-Z]/.test(name);
}

function isComponentName(name, t) {
  return t.isJSXMemberExpression(name) || (
    t.isJSXIdentifier(name) && isPascalCaseName(name.name)
  );
}

function getRootJsxIdentifier(name, t) {
  let current = name;
  while (t.isJSXMemberExpression(current)) current = current.object;
  return t.isJSXIdentifier(current) ? current.name : null;
}

function getReactBoundaryKind(path, tagNode, t) {
  const rootName = getRootJsxIdentifier(tagNode, t);
  if (!rootName) return null;
  const binding = path.scope.getBinding(rootName);
  const bindingPath = binding?.path;
  const importPath = bindingPath?.findParent((entry) => entry.isImportDeclaration?.());
  if (!importPath || importPath.node.source.value !== "react") return null;

  if (bindingPath.isImportSpecifier?.()) {
    const imported = bindingPath.node.imported;
    const importedName = t.isIdentifier(imported) || t.isStringLiteral(imported)
      ? imported.name ?? imported.value
      : null;
    return importedName === "Suspense" || importedName === "SuspenseList"
      ? importedName
      : null;
  }

  if (
    (bindingPath.isImportDefaultSpecifier?.() || bindingPath.isImportNamespaceSpecifier?.()) &&
    t.isJSXMemberExpression(tagNode) &&
    t.isJSXIdentifier(tagNode.property)
  ) {
    const propertyName = tagNode.property.name;
    return propertyName === "Suspense" || propertyName === "SuspenseList"
      ? propertyName
      : null;
  }
  return null;
}

function isReactContextMember(path, tagNode, t) {
  if (
    !t.isJSXMemberExpression(tagNode) ||
    !t.isJSXIdentifier(tagNode.object) ||
    !t.isJSXIdentifier(tagNode.property) ||
    (tagNode.property.name !== "Provider" && tagNode.property.name !== "Consumer")
  ) {
    return false;
  }
  const binding = path.scope.getBinding(tagNode.object.name);
  // This mirrors react-context's own disambiguation: namespace imports can
  // legitimately export components named Provider/Consumer, whereas local or
  // named-imported objects use those members as Context operators.
  return !binding?.path?.isImportNamespaceSpecifier?.();
}

function isNamespaceComponentMember(path, tagNode, t) {
  if (!t.isJSXMemberExpression(tagNode)) return false;
  const rootName = getRootJsxIdentifier(tagNode, t);
  if (!rootName) return false;
  const binding = path.scope.getBinding(rootName);
  if (!binding?.path?.isImportNamespaceSpecifier?.()) return false;
  const source = binding.path.parentPath?.node?.source?.value;
  return source !== "react" && source !== "@litsx/react" && !source?.startsWith?.("react/");
}

function getTagName(name, t) {
  return t.isJSXIdentifier(name) ? name.name : null;
}

function getAttributeName(attribute, t) {
  if (!t.isJSXAttribute(attribute) || !t.isJSXIdentifier(attribute.name)) {
    return null;
  }
  return decodeVirtualAttributeName(attribute.name.name) ?? attribute.name.name;
}

function getStaticStringValue(attribute, t) {
  if (!t.isJSXAttribute(attribute) || !attribute.value) return null;
  if (t.isStringLiteral(attribute.value)) return attribute.value.value;
  if (
    t.isJSXExpressionContainer(attribute.value) &&
    t.isStringLiteral(attribute.value.expression)
  ) {
    return attribute.value.expression.value;
  }
  return null;
}

function isInsideSvg(path, t) {
  let current = path.parentPath;
  while (current) {
    if (current.isJSXElement?.()) {
      const name = getTagName(current.node.openingElement?.name, t);
      if (name === "svg") return true;
      if (name === "foreignObject") return false;
    }
    current = current.parentPath;
  }
  return false;
}

function getTsNode(typeResolver, node) {
  if (!typeResolver || typeof node?.start !== "number" || typeof node?.end !== "number") {
    return null;
  }
  return typeResolver.getNodeAtSpan(node.start, node.end);
}

function getTypeOfSymbol(checker, symbol, location) {
  if (!symbol) return null;
  try {
    return checker.getTypeOfSymbolAtLocation(
      symbol,
      symbol.valueDeclaration || symbol.declarations?.[0] || location,
    );
  } catch {
    return null;
  }
}

function getComponentPropsType(typeResolver, tagNode) {
  const ts = ensureTypescriptModule();
  const tsNode = getTsNode(typeResolver, tagNode);
  if (!tsNode) return null;

  const { checker } = typeResolver;
  let componentType;
  try {
    componentType = checker.getTypeAtLocation(tsNode);
  } catch {
    return null;
  }

  const callSignature = checker.getSignaturesOfType(
    componentType,
    ts.SignatureKind.Call,
  )[0];
  const propsSymbol = callSignature?.getParameters?.()[0];
  if (propsSymbol) {
    return getTypeOfSymbol(checker, propsSymbol, tsNode);
  }

  const constructSignature = checker.getSignaturesOfType(
    componentType,
    ts.SignatureKind.Construct,
  )[0];
  if (constructSignature) {
    try {
      return checker.getReturnTypeOfSignature(constructSignature);
    } catch {
      return null;
    }
  }

  return null;
}

function getGlobalElementType(typeResolver, tagName, location, svg) {
  const ts = ensureTypescriptModule();
  const { checker } = typeResolver;
  const mapNames = svg
    ? ["SVGElementTagNameMap", "HTMLElementTagNameMap"]
    : ["HTMLElementTagNameMap", "SVGElementTagNameMap"];

  for (const mapName of mapNames) {
    let mapSymbol;
    try {
      mapSymbol = checker.resolveName(mapName, location, ts.SymbolFlags.Type, false);
    } catch {
      mapSymbol = null;
    }
    if (!mapSymbol) continue;

    const mapType = checker.getDeclaredTypeOfSymbol(mapSymbol);
    const elementSymbol = checker.getPropertyOfType(mapType, tagName);
    const elementType = getTypeOfSymbol(checker, elementSymbol, location);
    if (elementType) return elementType;
  }

  return null;
}

function getIntrinsicElementPropsType(typeResolver, tagName, location) {
  const ts = ensureTypescriptModule();
  const { checker } = typeResolver;
  let jsxSymbol;
  try {
    jsxSymbol = checker.resolveName(
      "JSX",
      location,
      ts.SymbolFlags.Namespace,
      false,
    );
  } catch {
    return null;
  }
  if (!jsxSymbol) return null;

  let intrinsicElementsSymbol;
  try {
    intrinsicElementsSymbol = checker
      .getExportsOfModule(jsxSymbol)
      .find((symbol) => symbol.name === "IntrinsicElements");
  } catch {
    return null;
  }
  if (!intrinsicElementsSymbol) return null;

  let intrinsicElementsType;
  try {
    intrinsicElementsType = checker.getDeclaredTypeOfSymbol(intrinsicElementsSymbol);
  } catch {
    return null;
  }
  const elementSymbol = checker.getPropertyOfType(intrinsicElementsType, tagName);
  return getTypeOfSymbol(checker, elementSymbol, location);
}

function getPropertyType(typeResolver, targetType, propertyName, location) {
  if (!targetType) return null;
  const symbol = typeResolver.checker.getPropertyOfType(targetType, propertyName);
  return getTypeOfSymbol(typeResolver.checker, symbol, location);
}

function nonNullableParts(type, checker, ts) {
  let normalized = type;
  try {
    normalized = checker.getNonNullableType(type);
  } catch {
    // Keep the original type when the checker cannot normalize it.
  }
  const parts = normalized?.isUnion?.() ? normalized.types : [normalized];
  return parts.filter((part) => part && !(part.flags & (ts.TypeFlags.Null | ts.TypeFlags.Undefined)));
}

function isBooleanType(type, checker) {
  if (!type) return false;
  const ts = ensureTypescriptModule();
  const parts = nonNullableParts(type, checker, ts);
  return parts.length > 0 && parts.every((part) => Boolean(part.flags & ts.TypeFlags.BooleanLike));
}

function isAttributePrimitiveType(type, checker) {
  if (!type) return false;
  const ts = ensureTypescriptModule();
  const primitiveFlags =
    ts.TypeFlags.StringLike |
    ts.TypeFlags.NumberLike |
    ts.TypeFlags.BigIntLike |
    ts.TypeFlags.EnumLike;
  const parts = nonNullableParts(type, checker, ts);
  return parts.length > 0 && parts.every((part) => Boolean(part.flags & primitiveFlags));
}

function renameAttribute(attribute, name, t) {
  attribute.name = t.jsxIdentifier(name);
}

function wrapCapture(attribute, t) {
  const expression = t.isJSXExpressionContainer(attribute.value)
    ? attribute.value.expression
    : attribute.value || t.booleanLiteral(true);
  attribute.value = t.jsxExpressionContainer(
    t.objectExpression([
      t.objectProperty(t.identifier("handleEvent"), t.cloneNode(expression, true)),
      t.objectProperty(t.identifier("capture"), t.booleanLiteral(true)),
    ]),
  );
}

function resolveEvent(rawName, tagName, attributes, t) {
  if (!/^on[A-Z]/.test(rawName)) return null;

  let eventName = rawName.slice(2);
  let capture = false;
  if (eventName.endsWith("Capture")) {
    capture = true;
    eventName = eventName.slice(0, -7);
  }

  let normalized = eventName.replace(/[A-Z]/g, (match) => match.toLowerCase());
  const alias = EVENT_ALIASES.get(normalized);
  if (alias) {
    normalized = alias.name;
    capture ||= alias.capture;
  }

  if (normalized === "change" && (tagName === "input" || tagName === "textarea")) {
    const checked = attributes.some((attribute) => {
      const name = getAttributeName(attribute, t);
      return name === "checked" || name === "defaultChecked" || name === "?checked";
    });
    const typeAttribute = attributes.find(
      (attribute) => getAttributeName(attribute, t) === "type",
    );
    const inputType = getStaticStringValue(typeAttribute, t)?.toLowerCase() ?? null;
    if (tagName === "textarea" || (!checked && (!inputType || !INPUT_CHANGE_TYPES.has(inputType)))) {
      normalized = "input";
    }
  }

  return { name: normalized, capture };
}

function normalizeHtmlAttributeName(rawName) {
  return HTML_ATTRIBUTE_ALIASES.get(rawName) ?? rawName.toLowerCase();
}

function hasExplicitPrimitiveAttributeValue(attribute, typeResolver, t) {
  if (t.isStringLiteral(attribute.value)) return true;
  if (!t.isJSXExpressionContainer(attribute.value)) return false;
  const tsNode = getTsNode(typeResolver, attribute.value.expression);
  if (!tsNode) return false;
  try {
    const valueType = typeResolver.checker.getTypeAtLocation(tsNode);
    return isAttributePrimitiveType(valueType, typeResolver.checker);
  } catch {
    return false;
  }
}

function classifyDeclaredProperty(propertyType, checker) {
  if (isBooleanType(propertyType, checker)) return "boolean";
  if (isAttributePrimitiveType(propertyType, checker)) return "attribute";
  return "property";
}

function getLocalComponentFunctionPath(path, tagNode, t) {
  if (!t.isJSXIdentifier(tagNode)) return null;
  const binding = path.scope.getBinding(tagNode.name);
  if (!binding) return null;
  if (binding.path.isFunctionDeclaration?.()) return binding.path;

  const declaratorPath = binding.path.isVariableDeclarator?.()
    ? binding.path
    : binding.path.parentPath?.isVariableDeclarator?.()
      ? binding.path.parentPath
      : null;
  const initPath = declaratorPath?.get?.("init");
  if (initPath?.isArrowFunctionExpression?.() || initPath?.isFunctionExpression?.()) {
    return initPath;
  }
  return null;
}

function getObjectPropertyName(property, t) {
  if (!t.isObjectProperty(property)) return null;
  if (t.isIdentifier(property.key)) return property.key.name;
  if (t.isStringLiteral(property.key)) return property.key.value;
  return null;
}

function classifyLocalProperty(property, t) {
  if (!t.isObjectProperty(property) || !t.isObjectExpression(property.value)) {
    return "property";
  }

  const options = new Map(
    property.value.properties
      .map((entry) => [getObjectPropertyName(entry, t), entry])
      .filter(([name]) => name),
  );
  const attribute = options.get("attribute");
  if (attribute && t.isBooleanLiteral(attribute.value, { value: false })) {
    return "property";
  }

  const type = options.get("type")?.value;
  if (t.isIdentifier(type, { name: "Boolean" })) return "boolean";
  if (t.isIdentifier(type) && (type.name === "String" || type.name === "Number")) {
    return "attribute";
  }
  return "property";
}

function getLocalPropertyKinds(path, tagNode, state, t) {
  const functionPath = getLocalComponentFunctionPath(path, tagNode, t);
  if (!functionPath) return null;
  if (state.__litsxLocalPropertyKinds.has(functionPath.node)) {
    return state.__litsxLocalPropertyKinds.get(functionPath.node);
  }

  const programPath = functionPath.findParent((entry) => entry.isProgram());
  const result = extractProperties(functionPath, programPath, {
    typeResolver: state.__litsxJsxBindingTypeResolver,
  });
  const kinds = new Map(
    result.properties
      .map((property) => [
        getObjectPropertyName(property, t),
        classifyLocalProperty(property, t),
      ])
      .filter(([name]) => name),
  );
  state.__litsxLocalPropertyKinds.set(functionPath.node, kinds);
  return kinds;
}

function transformOpeningElement(path, state, t) {
  const typeResolver = state.__litsxJsxBindingTypeResolver;
  const tagNode = path.node.name;
  // React context members are semantic operators consumed later by
  // react-compat, not namespace component elements.
  if (state.__litsxDeferReactBoundaryAttributes && isReactContextMember(path, tagNode, t)) return;
  if (t.isJSXMemberExpression(tagNode) && !isNamespaceComponentMember(path, tagNode, t)) return;
  const tagName = getTagName(tagNode, t);
  const component = isComponentName(tagNode, t);
  const svg = tagName === "svg" || isInsideSvg(path, t);
  // A custom element name contains a hyphen by definition. Keep both custom
  // elements and SVG out of HTML attribute-name/boolean inference.
  const nativeHtml = Boolean(tagName && !tagName.includes("-") && !svg);
  const customElement = Boolean(tagName?.includes("-"));
  const reactBoundaryKind = state.__litsxDeferReactBoundaryAttributes
    ? getReactBoundaryKind(path, tagNode, t)
    : null;
  const localPropertyKinds = component
    ? getLocalPropertyKinds(path, tagNode, state, t)
    : null;
  const tsTagNode = getTsNode(typeResolver, tagNode);
  const targetType = component
    ? getComponentPropsType(typeResolver, tagNode)
    : tagName && typeResolver && tsTagNode
      ? getGlobalElementType(typeResolver, tagName, tsTagNode, svg) ||
        getIntrinsicElementPropsType(typeResolver, tagName, tsTagNode)
      : null;

  for (const attribute of path.node.attributes) {
    const rawName = getAttributeName(attribute, t);
    if (!rawName || rawName.startsWith(".") || rawName.startsWith("?") || rawName.startsWith("@")) {
      continue;
    }
    if (rawName === "ref") continue;

    if (
      state.__litsxDeferReactBoundaryAttributes &&
      (REACT_BOUNDARY_ATTRIBUTES.get(tagName)?.has(rawName) ||
        REACT_BOUNDARY_ATTRIBUTES.get(reactBoundaryKind)?.has(rawName))
    ) {
      continue;
    }

    const propertyType = typeResolver && tsTagNode
      ? getPropertyType(typeResolver, targetType, rawName, tsTagNode)
      : null;

    if (component) {
      if (rawName.startsWith("data-") || rawName.startsWith("aria-")) {
        continue;
      }
      const localKind = localPropertyKinds?.get(rawName);
      if (localKind) {
        if (localKind === "boolean") renameAttribute(attribute, `?${rawName}`, t);
        if (localKind === "property") renameAttribute(attribute, `.${rawName}`, t);
        continue;
      }
      if (propertyType) {
        const kind = classifyDeclaredProperty(propertyType, typeResolver.checker);
        if (kind === "boolean") renameAttribute(attribute, `?${rawName}`, t);
        if (kind === "property") renameAttribute(attribute, `.${rawName}`, t);
        continue;
      }
      if (!t.isStringLiteral(attribute.value)) {
        renameAttribute(attribute, `.${rawName}`, t);
      }
      continue;
    }

    if (rawName === "className") {
      if (!state.__litsxSuppressNativeClassNameWarning) {
        state.file.metadata ||= {};
        const warnings = state.file.metadata.litsxWarnings ||= [];
        warnings.push({
          code: "LITSX_NATIVE_CLASSNAME",
          message: '`className` is not native LitSX syntax. Use `class` in native LitSX, or add the React compatibility layer to rewrite `className`.',
          attributeName: "className",
          tagName,
          line: attribute.loc?.start?.line ?? null,
          column: attribute.loc?.start?.column ?? null,
        });
      }
      renameAttribute(attribute, "class", t);
      continue;
    }
    if (rawName === "htmlFor") {
      renameAttribute(attribute, "for", t);
      continue;
    }
    if (tagName === "input" && rawName === "defaultChecked") {
      renameAttribute(attribute, "?checked", t);
      continue;
    }
    if (tagName === "input" && rawName === "checked") {
      renameAttribute(attribute, "?checked", t);
      continue;
    }
    if (tagName === "option" && rawName === "selected") {
      renameAttribute(attribute, "?selected", t);
      continue;
    }
    if (tagName && LIVE_VALUE_TAGS.has(tagName) && (rawName === "value" || rawName === "defaultValue")) {
      renameAttribute(attribute, ".value", t);
      continue;
    }

    // A package can publish a concrete JSX.IntrinsicElements contract for its
    // lowercase custom-element tag. Treat non-primitive members of that API as
    // properties before applying the untyped `onX` custom-event fallback.
    if (customElement && propertyType) {
      const kind = classifyDeclaredProperty(propertyType, typeResolver.checker);
      if (kind !== "attribute") renameAttribute(attribute, `.${rawName}`, t);
      continue;
    }

    const event = resolveEvent(rawName, tagName, path.node.attributes, t);
    if (event) {
      renameAttribute(attribute, `@${event.name}`, t);
      if (event.capture) wrapCapture(attribute, t);
      continue;
    }

    const htmlAttributeName = nativeHtml
      ? normalizeHtmlAttributeName(rawName)
      : rawName;

    if (nativeHtml && HTML_BOOLEAN_ATTRIBUTE_NAMES.has(htmlAttributeName)) {
      if (hasExplicitPrimitiveAttributeValue(attribute, typeResolver, t)) {
        if (htmlAttributeName !== rawName) renameAttribute(attribute, htmlAttributeName, t);
      } else {
        renameAttribute(attribute, `?${htmlAttributeName}`, t);
      }
      continue;
    }

    if (
      nativeHtml &&
      HTML_BOOLEAN_VALUE_ATTRIBUTE_NAMES.has(htmlAttributeName) &&
      !attribute.value
    ) {
      attribute.value = t.jsxExpressionContainer(t.booleanLiteral(true));
      if (htmlAttributeName !== rawName) renameAttribute(attribute, htmlAttributeName, t);
      continue;
    }

    if (propertyType) {
      const kind = classifyDeclaredProperty(propertyType, typeResolver.checker);
      if (kind === "property") {
        renameAttribute(attribute, `.${rawName}`, t);
      } else if (htmlAttributeName !== rawName) {
        renameAttribute(attribute, htmlAttributeName, t);
      }
      continue;
    }

    if (htmlAttributeName !== rawName) renameAttribute(attribute, htmlAttributeName, t);
  }
}

export default declare((api, options = {}) => {
  api.assertVersion(7);
  const t = api.types;
  setPropertyBabelTypes(t);

  return {
    name: "transform-litsx-jsx-bindings",
    inherits: jsxSyntaxPlugin.default || jsxSyntaxPlugin,
    pre() {
      this.__litsxLocalPropertyKinds = new WeakMap();
      this.__litsxDeferReactBoundaryAttributes = options.reactCompatBoundaries === true;
      this.__litsxSuppressNativeClassNameWarning = options.suppressNativeClassNameWarning === true;
      this.__litsxJsxBindingTypeResolver = createTypeResolver(
        this.file?.opts?.filename,
        this.file?.code,
        options,
      );
    },
    visitor: {
      Program: {
        enter(path) {
          path.scope.crawl();
          path.traverse({
            JSXOpeningElement: (openingPath) => transformOpeningElement(openingPath, this, t),
          });
        },
      },
    },
  };
});
