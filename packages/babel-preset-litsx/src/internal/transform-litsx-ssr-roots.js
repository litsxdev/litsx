import jsxSyntaxPlugin from "@babel/plugin-syntax-jsx";
import { decodeVirtualAttributeName } from "@litsx/jsx-authoring";
import { isServerComponentBindingName } from "./transform-litsx-server-components.js";
import {
  buildAvailableMap,
  collectScopedEntries,
  ensureNamedImport,
  setSsrSharedBabelTypes,
} from "./transform-litsx-ssr-shared.js";
let t;

const SSR_MODULE = "@litsx/ssr";
const RUNTIME_INFRASTRUCTURE_MODULE = "@litsx/core/elements";
const SCOPED_TEMPLATE_HELPER = "__litsxScopedTemplate";
const SERVER_COMPONENT_CALL_HELPER = "__litsxServerComponentCall";

export default function transformLitsxSsrRoots(api) {
  api.assertVersion(7);
  t = api.types;
  setSsrSharedBabelTypes(t);

  return {
    name: "transform-litsx-ssr-roots",
    inherits: jsxSyntaxPlugin.default || jsxSyntaxPlugin,
    visitor: {
      Program(programPath) {
        const availableMap = buildAvailableMap(programPath);
        const renderToStringBindings = collectSsrRenderBindings(programPath);

        if (renderToStringBindings.size === 0) {
          return;
        }

        programPath.traverse({
          CallExpression(callPath) {
            if (!callPath.get("callee").isIdentifier()) {
              return;
            }

            const calleeName = callPath.node.callee.name;
            if (!renderToStringBindings.has(calleeName)) {
              return;
            }

            const firstArgument = callPath.get("arguments.0");
            if (
              !firstArgument ||
              (!firstArgument.isJSXElement() && !firstArgument.isJSXFragment())
            ) {
              return;
            }

            if (firstArgument.isJSXElement()) {
              const openingName = firstArgument.get("openingElement.name");
              if (
                openingName.isJSXIdentifier() &&
                isServerComponentBindingName(programPath, openingName.node.name)
              ) {
                firstArgument.replaceWith(
                  t.callExpression(t.identifier(SERVER_COMPONENT_CALL_HELPER), [
                    t.identifier(openingName.node.name),
                    buildServerComponentPropsObject(firstArgument.get("openingElement")),
                  ]),
                );
                ensureNamedImport(
                  programPath,
                  RUNTIME_INFRASTRUCTURE_MODULE,
                  SERVER_COMPONENT_CALL_HELPER,
                );
                return;
              }
            }

            const scopeEntries = collectScopedEntries(firstArgument, availableMap);
            const jsxRoot = firstArgument.node;
            ensureNamedImport(
              programPath,
              RUNTIME_INFRASTRUCTURE_MODULE,
              SCOPED_TEMPLATE_HELPER,
            );

            firstArgument.replaceWith(
              t.callExpression(t.identifier(SCOPED_TEMPLATE_HELPER), [
                jsxRoot,
                t.objectExpression(
                  scopeEntries.map((entry) =>
                    t.objectProperty(
                      t.stringLiteral(entry.tagName),
                      t.identifier(entry.originalName),
                    ),
                  ),
                ),
              ]),
            );
          },
        });
      },
    },
  };
}

function collectSsrRenderBindings(programPath) {
  const bindings = new Set();

  programPath.get("body").forEach((nodePath) => {
    if (
      !nodePath.isImportDeclaration() ||
      nodePath.node.source.value !== SSR_MODULE
    ) {
      return;
    }

    for (const specifier of nodePath.node.specifiers) {
      if (
        t.isImportSpecifier(specifier) &&
        t.isIdentifier(specifier.imported, { name: "renderToString" })
      ) {
        bindings.add(specifier.local.name);
      }
    }
  });

  return bindings;
}

function buildServerComponentPropsObject(openingElementPath) {
  const properties = [];

  for (const attributePath of openingElementPath.get("attributes")) {
    if (!attributePath.isJSXAttribute()) {
      continue;
    }

    if (!attributePath.get("name").isJSXIdentifier()) {
      continue;
    }

    const authoredName = decodeVirtualAttributeName(attributePath.node.name.name) ??
      attributePath.node.name.name;

    if (!authoredName.startsWith(".")) {
      continue;
    }

    const propName = authoredName.slice(1);
    const valuePath = attributePath.get("value");

    let valueExpression;
    if (!valuePath.node) {
      valueExpression = t.booleanLiteral(true);
    } else if (valuePath.isJSXExpressionContainer()) {
      valueExpression = valuePath.node.expression;
    } else if (valuePath.isStringLiteral()) {
      valueExpression = valuePath.node;
    } else {
      continue;
    }

    properties.push(
      t.objectProperty(
        t.identifier(propName),
        t.cloneNode(valueExpression, true),
      ),
    );
  }

  return t.objectExpression(properties);
}
