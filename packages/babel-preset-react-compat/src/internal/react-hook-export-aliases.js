import helperPluginUtils from "@babel/helper-plugin-utils";

const { declare } = helperPluginUtils;

function isCustomHookName(name) {
  return typeof name === "string" && /^use[A-Z0-9]/.test(name);
}

function isComponentName(name) {
  return typeof name === "string" && /^[A-Z]/.test(name);
}

export default declare((api) => {
  api.assertVersion(7);
  const t = api.types;

  function promoteBindingToNamedExport(programPath, localName) {
    const binding = programPath.scope.getBinding(localName);
    if (!binding?.path) return;

    if (binding.path.isFunctionDeclaration()) {
      if (binding.path.parentPath?.isExportNamedDeclaration()) return;
      const replacement = binding.path.replaceWith(t.exportNamedDeclaration(binding.path.node, []));
      replacement?.requeue?.();
      programPath.scope.crawl();
      return;
    }

    if (!binding.path.isVariableDeclarator()) return;
    const declarationPath = binding.path.parentPath;
    if (!declarationPath?.isVariableDeclaration()) return;
    if (declarationPath.parentPath?.isExportNamedDeclaration()) return;
    const declarationNode = declarationPath.node;
    const targetIndex = declarationNode.declarations.indexOf(binding.path.node);
    if (targetIndex === -1) return;
    const replacements = [];
    const before = declarationNode.declarations.slice(0, targetIndex);
    const after = declarationNode.declarations.slice(targetIndex + 1);
    if (before.length > 0) {
      replacements.push(t.variableDeclaration(declarationNode.kind, before));
    }
    replacements.push(
      t.exportNamedDeclaration(
        t.variableDeclaration(declarationNode.kind, [binding.path.node]),
        [],
      ),
    );
    if (after.length > 0) {
      replacements.push(t.variableDeclaration(declarationNode.kind, after));
    }
    const replacementPaths = declarationPath.replaceWithMultiple(replacements);
    for (const replacementPath of replacementPaths || []) {
      replacementPath.requeue?.();
    }
    programPath.scope.crawl();
  }

  return {
    name: "react-public-export-aliases",
    visitor: {
      Program: {
        enter(programPath) {
          const aliases = [];
          for (const statementPath of programPath.get("body")) {
            const statement = statementPath.node;
            if (statement.type !== "ExportNamedDeclaration" || statement.source) continue;
            for (const specifier of statement.specifiers || []) {
              const localName = specifier.local?.name ?? specifier.local?.value;
              const exportedName = specifier.exported?.name ?? specifier.exported?.value;
              const needsHookName =
                isCustomHookName(exportedName) && !isCustomHookName(localName);
              const needsComponentName =
                isComponentName(exportedName) && localName !== exportedName;
              if (!localName || (!needsHookName && !needsComponentName)) {
                continue;
              }
              aliases.push({ localName, exportedName, specifier, statementPath });
            }
          }

          for (const { localName, exportedName, specifier, statementPath } of aliases) {
            const binding = programPath.scope.getBinding(localName);
            if (!binding) continue;
            const existing = programPath.scope.getBinding(exportedName);
            if (existing && existing !== binding) {
              throw programPath.buildCodeFrameError(
                `Cannot transform exported React symbol "${exportedName}" because its minified local binding "${localName}" collides with another declaration named "${exportedName}".`
              );
            }
            programPath.scope.rename(localName, exportedName);
            if (specifier.local?.name) {
              specifier.local.name = exportedName;
            }
            promoteBindingToNamedExport(programPath, exportedName);
            statementPath.node.specifiers = statementPath.node.specifiers.filter(
              (candidate) => candidate !== specifier,
            );
            if (
              statementPath.node.specifiers.length === 0 &&
              !statementPath.node.declaration
            ) {
              statementPath.remove();
            }
          }
        },
      },
    },
  };
});
