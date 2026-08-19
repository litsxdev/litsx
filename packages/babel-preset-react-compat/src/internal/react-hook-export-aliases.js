import helperPluginUtils from "@babel/helper-plugin-utils";

const { declare } = helperPluginUtils;

function isCustomHookName(name) {
  return typeof name === "string" && /^use[A-Z0-9]/.test(name);
}

export default declare((api) => {
  api.assertVersion(7);

  return {
    name: "react-hook-export-aliases",
    visitor: {
      Program: {
        enter(programPath) {
          const aliases = [];
          for (const statement of programPath.node.body) {
            if (statement.type !== "ExportNamedDeclaration" || statement.source) continue;
            for (const specifier of statement.specifiers || []) {
              const localName = specifier.local?.name ?? specifier.local?.value;
              const exportedName = specifier.exported?.name ?? specifier.exported?.value;
              if (
                !localName ||
                !isCustomHookName(exportedName) ||
                isCustomHookName(localName)
              ) {
                continue;
              }
              aliases.push({ localName, exportedName, specifier });
            }
          }

          for (const { localName, exportedName, specifier } of aliases) {
            const binding = programPath.scope.getBinding(localName);
            if (!binding) continue;
            const existing = programPath.scope.getBinding(exportedName);
            if (existing && existing !== binding) {
              throw programPath.buildCodeFrameError(
                `Cannot transform exported hook "${exportedName}" because its minified local binding "${localName}" collides with another declaration named "${exportedName}".`
              );
            }
            programPath.scope.rename(localName, exportedName);
            if (specifier.local?.name) {
              specifier.local.name = exportedName;
            }
          }
        },
      },
    },
  };
});
