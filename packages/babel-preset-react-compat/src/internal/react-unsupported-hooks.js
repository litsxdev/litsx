import { declare } from "@babel/helper-plugin-utils";

const SUPPORTED_REACT_HOOKS = new Set([
  "useState",
  "useRef",
  "useContext",
  "useEffect",
  "useLayoutEffect",
  "useMemo",
  "useCallback",
  "useReducer",
  "useId",
  "useImperativeHandle",
  "useSyncExternalStore",
  "useOptimistic",
  "useTransition",
  "useDeferredValue",
  "startTransition",
]);

function getImportedName(specifier) {
  if (specifier.type === "ImportDefaultSpecifier") return "default";
  if (specifier.type === "ImportNamespaceSpecifier") return "*";
  return specifier.imported?.name ?? specifier.imported?.value ?? null;
}

function isReactHookName(name) {
  return typeof name === "string" && (
    /^use[A-Z0-9]/.test(name) ||
    name === "startTransition"
  );
}

function throwUnsupported(path, name, source) {
  if (SUPPORTED_REACT_HOOKS.has(name)) {
    throw path.buildCodeFrameError(
      `Cannot transform React hook "${name}" from "${source}" because its enclosing function was not recognized as a LitSX component or custom hook, so no host could be assigned. The dependency transformation stopped at this compiled component boundary.`
    );
  }
  throw path.buildCodeFrameError(
    `Cannot transform React hook "${name}" from "${source}" because react-compat has no LitSX equivalent. The dependency transformation stopped at this hook boundary.`
  );
}

export default declare((api) => {
  api.assertVersion("^8.0.0");
  const t = api.types;

  return {
    name: "react-unsupported-hook-boundaries",
    visitor: {
      Program: {
        exit(programPath) {
          for (const statementPath of programPath.get("body")) {
            if (!statementPath.isImportDeclaration()) continue;
            const source = statementPath.node.source.value;
            if (source !== "react" && source !== "react-dom") continue;

            for (const specifierPath of statementPath.get("specifiers")) {
              const importedName = getImportedName(specifierPath.node);
              const localName = specifierPath.node.local?.name;
              if (!localName) continue;
              const binding = programPath.scope.getBinding(localName);

              if (importedName !== "*" && importedName !== "default") {
                if (isReactHookName(importedName) && binding?.referenced) {
                  throwUnsupported(specifierPath, importedName, source);
                }
                continue;
              }

              for (const referencePath of binding?.referencePaths || []) {
                const memberPath = referencePath.parentPath;
                if (
                  !memberPath?.isMemberExpression({ computed: false }) ||
                  memberPath.get("object").node !== referencePath.node
                ) {
                  continue;
                }
                const propertyPath = memberPath.get("property");
                if (propertyPath.isIdentifier() && isReactHookName(propertyPath.node.name)) {
                  throwUnsupported(propertyPath, propertyPath.node.name, source);
                }
              }
            }
          }

          programPath.traverse({
            MemberExpression(memberPath) {
              const property = memberPath.node.property;
              if (
                memberPath.node.computed === false &&
                t.isIdentifier(property) &&
                /INTERNAL|^__/.test(property.name)
              ) {
                const object = memberPath.get("object");
                if (object.isIdentifier({ name: "React" }) || object.isIdentifier({ name: "ReactDOM" })) {
                  throw memberPath.buildCodeFrameError(
                    `Cannot transform access to React internal "${property.name}". The dependency transformation stopped at a private React runtime boundary.`
                  );
                }
              }
            },
          });
        },
      },
    },
  };
});
