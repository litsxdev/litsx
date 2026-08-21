let t;

const RUNTIME_MODULE = "@litsx/core/react-compat";

function ensureRuntimeImport(programPath, state) {
  if (state.runtimeLocalName) return state.runtimeLocalName;
  const localName = programPath.scope.hasBinding("createReactRef")
    ? programPath.scope.generateUidIdentifier("createReactRef").name
    : "createReactRef";
  const existing = programPath.get("body").find(
    (path) => path.isImportDeclaration() && path.node.source.value === RUNTIME_MODULE
  );
  const specifier = t.importSpecifier(t.identifier(localName), t.identifier("createReactRef"));
  if (existing) existing.node.specifiers.push(specifier);
  else programPath.unshiftContainer(
    "body",
    t.importDeclaration([specifier], t.stringLiteral(RUNTIME_MODULE))
  );
  state.runtimeLocalName = localName;
  return localName;
}

function isReactNamespaceBinding(binding) {
  const path = binding?.path;
  return Boolean(
    (path?.isImportDefaultSpecifier?.() || path?.isImportNamespaceSpecifier?.()) &&
    path.parentPath?.isImportDeclaration?.() &&
    path.parentPath.node.source.value === "react"
  );
}

export default function reactRefsPlugin(api) {
  api.assertVersion?.(7);
  t = api.types;
  return {
    name: "transform-react-create-ref",
    visitor: {
      Program: {
        enter(_path, state) {
          state.runtimeLocalName = null;
        },
        exit(path) {
          path.scope.crawl();
          for (const child of path.get("body")) {
            if (!child.isImportDeclaration() || child.node.source.value !== "react") continue;
            child.node.specifiers = child.node.specifiers.filter((specifier) => {
              if (!t.isImportSpecifier(specifier) ||
                  !t.isIdentifier(specifier.imported, { name: "createRef" })) return true;
              return Boolean(child.scope.getBinding(specifier.local.name)?.referenced);
            });
            if (child.node.specifiers.length === 0) child.remove();
          }
        },
      },
      CallExpression(path, state) {
        const callee = path.get("callee");
        let isReactCreateRef = false;
        if (callee.isIdentifier()) {
          const binding = path.scope.getBinding(callee.node.name);
          isReactCreateRef = Boolean(
            binding?.path?.isImportSpecifier?.() &&
            t.isIdentifier(binding.path.node.imported, { name: "createRef" }) &&
            binding.path.parentPath?.node?.source?.value === "react"
          );
        } else if (callee.isMemberExpression({ computed: false })) {
          const object = callee.get("object");
          const property = callee.get("property");
          isReactCreateRef = object.isIdentifier() &&
            property.isIdentifier({ name: "createRef" }) &&
            isReactNamespaceBinding(path.scope.getBinding(object.node.name));
        }
        if (!isReactCreateRef) return;

        const programPath = path.findParent((parent) => parent.isProgram());
        const localName = ensureRuntimeImport(programPath, state);
        callee.replaceWith(t.identifier(localName));
      },
    },
  };
}
