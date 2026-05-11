import jsxSyntaxPlugin from "@babel/plugin-syntax-jsx";
import {
  assertValidServerComponentReference,
  isServerComponentBindingName,
} from "./transform-litsx-server-components.js";
import {
  buildAvailableMap,
  buildServerComponentPropsObject,
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
      Program(programPath, state) {
        const availableMap = buildAvailableMap(programPath);
        const renderToStringBindings = collectSsrRenderBindings(programPath);
        const sharedOptions = {
          ...(state.opts || {}),
          filename: programPath.hub.file?.opts?.filename || "",
        };

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
              if (openingName.isJSXIdentifier()) {
                assertValidServerComponentReference(
                  openingName,
                  programPath,
                  {
                    ...sharedOptions,
                    requireDefaultExport: true,
                  },
                );
              }

              if (
                openingName.isJSXIdentifier() &&
                isServerComponentBindingName(
                  programPath,
                  openingName.node.name,
                  sharedOptions,
                )
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
