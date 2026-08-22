import { declare } from "@babel/helper-plugin-utils";
import jsxSyntaxPlugin from "@babel/plugin-syntax-jsx";
import {
  decodeVirtualAttributeName,
  isBooleanHostAttributeName,
  isBooleanValueHostAttributeName,
  isNativeDomEventHandlerPropertyName,
  isStandardHostAttributeName,
  resolveExplicitJsxEventName,
} from "@litsx/authoring";
import {
  createTypeResolver,
  ensureTypescriptModule,
  extractProperties,
  setPropertyBabelTypes,
} from "./transform-litsx-properties.js";


const HTML_ATTRIBUTE_ALIASES = new Map([
  ["acceptCharset", "accept-charset"],
  ["className", "class"],
  ["htmlFor", "for"],
  ["httpEquiv", "http-equiv"],
]);
const LIVE_VALUE_TAGS = new Set(["input", "textarea", "select"]);
const REACT_BOUNDARY_ATTRIBUTES = new Map([
  ["ErrorBoundary", new Set(["fallback", "onError", "key"])],
  ["Suspense", new Set(["fallback", "key"])],
  ["SuspenseList", new Set(["revealOrder", "tail", "key"])],
]);
const RUNTIME_COMPONENT_BINDING_ATTRIBUTE = "litsx-runtime-component-binding";

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

function jsxNameToExpression(name, t) {
  if (t.isJSXIdentifier(name)) return t.identifier(name.name);
  if (t.isJSXMemberExpression(name)) {
    return t.memberExpression(
      jsxNameToExpression(name.object, t),
      t.identifier(name.property.name),
    );
  }
  return null;
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
  if (!t.isJSXAttribute(attribute)) return null;
  if (t.isJSXNamespacedName(attribute.name)) {
    return `${attribute.name.namespace.name}:${attribute.name.name.name}`;
  }
  if (!t.isJSXIdentifier(attribute.name)) return null;
  return decodeVirtualAttributeName(attribute.name.name) ?? attribute.name.name;
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
  const info = { kinds, restProps: result.restProps };
  state.__litsxLocalPropertyKinds.set(functionPath.node, info);
  return info;
}

function isExternalComponentRequiringRuntimeRouting(path, tagNode, t) {
  const rootName = getRootJsxIdentifier(tagNode, t);
  if (!rootName) return false;
  const bindingPath = path.scope.getBinding(rootName)?.path;
  if (!bindingPath?.isImportSpecifier?.() &&
      !bindingPath?.isImportDefaultSpecifier?.() &&
      !bindingPath?.isImportNamespaceSpecifier?.()) {
    return false;
  }
  const source = bindingPath.parentPath?.node?.source?.value;
  return typeof source === "string" &&
    source !== "react" &&
    source !== "react-error-boundary" &&
    !source.startsWith("react/") &&
    source !== "@litsx/core" &&
    !source.startsWith("@litsx/core/");
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
  const localPropertyInfo = component
    ? getLocalPropertyKinds(path, tagNode, state, t)
    : null;
  if (
    component &&
    (localPropertyInfo?.restProps || (
      state.__litsxRouteImportedRestProps &&
      isExternalComponentRequiringRuntimeRouting(path, tagNode, t)
    ))
  ) {
    path.node.__litsxRouteRestProps = true;
  }
  const localPropertyKinds = localPropertyInfo?.kinds ?? null;
  const tsTagNode = getTsNode(typeResolver, tagNode);
  const targetType = component
    ? getComponentPropsType(typeResolver, tagNode)
    : tagName && typeResolver && tsTagNode
      ? getGlobalElementType(typeResolver, tagName, tsTagNode, svg) ||
        getIntrinsicElementPropsType(typeResolver, tagName, tsTagNode)
      : null;
  let routeRuntimeComponentBinding = component && path.node.attributes.some(
    (attribute) => t.isJSXSpreadAttribute(attribute)
  );

  for (const attribute of path.node.attributes) {
    const rawName = getAttributeName(attribute, t);
    const explicitEventName = resolveExplicitJsxEventName(rawName);
    if (rawName?.startsWith("on:") && !explicitEventName) {
      throw path.buildCodeFrameError(
        `Declarative event "${rawName.slice(3)}" must use lowercase kebab-case. ` +
        "Use addEventListener() for event names outside that convention.",
      );
    }
    if (explicitEventName) {
      renameAttribute(attribute, `@${explicitEventName}`, t);
      continue;
    }
    if (!rawName || rawName.startsWith(".") || rawName.startsWith("?") || rawName.startsWith("@")) {
      continue;
    }
    if (rawName === "ref" || rawName === "style") continue;

    if (state.__litsxDeferReactEvents && !component && /^on[A-Z]/.test(rawName)) {
      continue;
    }

    if (
      state.__litsxDeferReactBoundaryAttributes &&
      (REACT_BOUNDARY_ATTRIBUTES.get(reactBoundaryKind)?.has(rawName) ||
        (tagName === "ErrorBoundary" &&
          REACT_BOUNDARY_ATTRIBUTES.get(tagName)?.has(rawName)))
    ) {
      continue;
    }

    if (state.__litsxTransformReactKeys && rawName === "key") continue;

    const propertyType = typeResolver && tsTagNode
      ? getPropertyType(typeResolver, targetType, rawName, tsTagNode)
      : null;

    if (component) {
      if (rawName.startsWith("data-") || rawName.startsWith("aria-")) {
        continue;
      }
      // PascalCase JSX names address the component's public prop API. Boolean,
      // object-valued, opaque dynamic, and camelCase names must remain
      // properties: a Lit boolean attribute is not equivalent when the public
      // attribute has another name (for example iconOnly / icon-only).
      // Explicit kebab-case names address the attribute API and need constructor
      // metadata at runtime to preserve declared boolean-presence semantics.
      if (rawName.includes("-")) {
        path.node.__litsxRouteRestProps = true;
        routeRuntimeComponentBinding = true;
        continue;
      }
      const localKind = localPropertyKinds?.get(rawName);
      const declaredKind = propertyType
        ? classifyDeclaredProperty(propertyType, typeResolver.checker)
        : null;
      const effectiveKind = localKind ?? declaredKind;
      if (
        effectiveKind == null &&
        (
          isStandardHostAttributeName(rawName) ||
          isBooleanHostAttributeName(rawName) ||
          isBooleanValueHostAttributeName(rawName)
        )
      ) {
        if (isBooleanHostAttributeName(rawName)) {
          if (!hasExplicitPrimitiveAttributeValue(attribute, typeResolver, t)) {
            renameAttribute(attribute, `?${rawName.toLowerCase()}`, t);
          }
        } else if (isBooleanValueHostAttributeName(rawName) && !attribute.value) {
          attribute.value = t.jsxExpressionContainer(t.booleanLiteral(true));
        }
        continue;
      }
      const camelCaseProperty = /[A-Z]/.test(rawName);
      const booleanProperty = effectiveKind === "boolean";
      const objectProperty = effectiveKind === "property";
      const opaqueDynamicProperty = effectiveKind == null &&
        !t.isStringLiteral(attribute.value);
      if (booleanProperty || objectProperty || camelCaseProperty || opaqueDynamicProperty) {
        attribute.name = t.jsxIdentifier(`.${rawName}`);
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
    // Custom elements and SVG elements inherit the native `on*` IDL handler
    // properties too; exact lowercase spellings are property assignments on
    // every DOM element, not only built-in HTML tags.
    if (!component && isNativeDomEventHandlerPropertyName(rawName)) {
      renameAttribute(attribute, `.${rawName}`, t);
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

    const htmlAttributeName = nativeHtml
      ? normalizeHtmlAttributeName(rawName)
      : rawName;

    if (nativeHtml && isBooleanHostAttributeName(htmlAttributeName)) {
      if (hasExplicitPrimitiveAttributeValue(attribute, typeResolver, t)) {
        if (htmlAttributeName !== rawName) renameAttribute(attribute, htmlAttributeName, t);
      } else {
        renameAttribute(attribute, `?${htmlAttributeName}`, t);
      }
      continue;
    }

    if (
      nativeHtml &&
      isBooleanValueHostAttributeName(htmlAttributeName) &&
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

  if (routeRuntimeComponentBinding) {
    const componentExpression = jsxNameToExpression(tagNode, t);
    if (componentExpression) {
      path.node.attributes.push(t.jsxAttribute(
        t.jsxIdentifier(RUNTIME_COMPONENT_BINDING_ATTRIBUTE),
        t.jsxExpressionContainer(componentExpression),
      ));
    }
  }
}

export default declare((api, options = {}) => {
  api.assertVersion("^8.0.0");
  const t = api.types;
  setPropertyBabelTypes(t);

  return {
    name: "transform-litsx-jsx-bindings",
    inherits: jsxSyntaxPlugin.default || jsxSyntaxPlugin,
    pre() {
      this.__litsxLocalPropertyKinds = new WeakMap();
      this.__litsxDeferReactBoundaryAttributes = options.reactCompatBoundaries === true;
      this.__litsxTransformReactKeys = options.reactCompatKeys === true;
      this.__litsxDeferReactEvents = options.reactCompatEvents === true;
      this.__litsxSuppressNativeClassNameWarning = options.suppressNativeClassNameWarning === true;
      this.__litsxRouteImportedRestProps = options.importedComponentRestProps === true;
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
