import jsxSyntaxPlugin from "@babel/plugin-syntax-jsx";
import { isLitElementSuperClass } from "@litsx/babel-plugin-shared-hooks";
import path from "node:path";
import { normalizeFilePath } from "@litsx/typescript-session";

let t;
const SHADOW_MIXIN = "ShadowDomMixin";
const LIGHT_MIXIN = "LightDomMixin";

export default function transformFunctionToClassPlugin(api) {
  api.assertVersion(7);
  t = api.types;

  return {
    name: "transform-litsx-scoped-elements",
    inherits: jsxSyntaxPlugin.default || jsxSyntaxPlugin,
    visitor: {
      Program: {
        exit(programPath) {
          programPath.get("body").forEach((nodePath) => {
            const classPath = resolveTopLevelClassPath(nodePath);
            if (!classPath) return;
            if (!isLitElementSuperClass(classPath.node.superClass, t)) return;
            if (classPath.node._elementsTransformed) return;

            const transformed = transformClass(classPath, programPath);
            if (transformed) {
              classPath.node._elementsTransformed = true;
            }
          });
        },
      },
    },
  };
}

function resolveTopLevelClassPath(nodePath) {
  if (nodePath.isClassDeclaration()) {
    return nodePath;
  }

  if (nodePath.isExportNamedDeclaration()) {
    const declarationPath = nodePath.get("declaration");
    if (declarationPath && declarationPath.isClassDeclaration()) {
      return declarationPath;
    }
  }

  return null;
}

function transformClass(classPath, programPath) {
  const { node } = classPath;
  const staticIr = consumeStaticIr(node);
  const precomputedCandidates = new Set(staticIr.elements.localCandidates);
  const importedCandidates = [...staticIr.elements.importedCandidates];
  const needsElementsRegistry = Boolean(staticIr.elements.needsRegistry);
  const lightDomRequested =
    Boolean(staticIr.lightDom) ||
    hasMixinInSuperChain(node.superClass, LIGHT_MIXIN);

  const filename = normalizeFilePath(programPath.hub.file?.opts?.filename || "");
  if (importedCandidates.length > 0 && filename) {
    const localNames = ensureImportedElementCandidates(programPath, filename, importedCandidates);
    localNames.forEach((localName) => precomputedCandidates.add(localName));
  }

  const availableMap = buildAvailableMap(programPath);

  const {
    elements: detectedElements,
    hasRenderableTemplate,
  } = detectElementsFromClass(classPath, availableMap, precomputedCandidates);
  const needsElements = detectedElements.length > 0;
  const hasExistingElementsStatic = hasStaticElementsMember(node);

  const elementsStatic = hasExistingElementsStatic
    ? null
    : createClassProperty("elements", detectedElements);
  const needsElementsMixin =
    Boolean(elementsStatic) ||
    needsElementsRegistry ||
    hasExistingElementsStatic;
  const needsLightDomMixin = lightDomRequested;

  if (!hasRenderableTemplate && !needsElements && !needsElementsRegistry && !needsLightDomMixin) {
    return false;
  }

  if (
    needsLightDomMixin &&
    !hasMixinInSuperChain(node.superClass, LIGHT_MIXIN)
  ) {
    ensureRuntimeInfrastructureImport(programPath, LIGHT_MIXIN);
    node.superClass = t.callExpression(
      t.identifier(LIGHT_MIXIN),
      [node.superClass]
    );
  }

  if (
    needsElementsMixin &&
    !lightDomRequested &&
    !hasMixinInSuperChain(node.superClass, SHADOW_MIXIN)
  ) {
    ensureRuntimeInfrastructureImport(programPath, SHADOW_MIXIN);
    node.superClass = t.callExpression(
      t.identifier(SHADOW_MIXIN),
      [node.superClass]
    );
  }

  if (elementsStatic) {
    insertClassProperty(node, elementsStatic);
  }

  return needsLightDomMixin || needsElementsMixin;
}

function consumeStaticIr(node) {
  const ir = normalizeStaticIr(node?._litsxStaticIr);

  if (!node) {
    return ir;
  }

  delete node._litsxStaticIr;
  return ir;
}

function normalizeStaticIr(ir) {
  return {
    properties: {
      inferred: [...(ir?.properties?.inferred || [])],
      authored: [...(ir?.properties?.authored || [])],
      legacy: [...(ir?.properties?.legacy || [])],
    },
    elements: {
      localCandidates: [...(ir?.elements?.localCandidates || [])],
      importedCandidates: [...(ir?.elements?.importedCandidates || [])],
      needsRegistry: Boolean(ir?.elements?.needsRegistry),
    },
    lightDom: Boolean(ir?.lightDom),
  };
}

function hasMixinInSuperChain(node, mixinName) {
  if (!node) {
    return false;
  }

  if (
    t.isCallExpression(node) &&
    t.isIdentifier(node.callee) &&
    node.callee.name === mixinName
  ) {
    return true;
  }

  if (t.isCallExpression(node)) {
    return node.arguments.some((argument) =>
      t.isExpression(argument) && hasMixinInSuperChain(argument, mixinName)
    );
  }

  return false;
}

function toKebab(name) {
  return name.replace(/([a-z])([A-Z])/g, "$1-$2").toLowerCase();
}

function createClassProperty(name, elements) {
  if (!elements || elements.length === 0) return null;

  const properties = elements.map((entry) =>
    t.objectProperty(
      t.stringLiteral(entry.tagName),
      t.identifier(entry.originalName)
    )
  );

  const property = t.classProperty(
    t.identifier(name),
    t.objectExpression(properties),
    null,
    [],
    false
  );
  property.static = true;
  return property;
}

function insertClassProperty(node, property) {
  const propertiesIndex = node.body.body.findIndex(
    (el) => t.isClassProperty(el) && el.key.name === "properties"
  );

  if (propertiesIndex !== -1) {
    node.body.body.splice(propertiesIndex + 1, 0, property);
  } else {
    node.body.body.push(property);
  }
}

function hasStaticElementsMember(node) {
  return node.body.body.some((member) => {
    if (!member.static) {
      return false;
    }

    const key = member.key;
    return (
      (t.isIdentifier(key) && key.name === "elements") ||
      (t.isStringLiteral(key) && key.value === "elements")
    );
  });
}

function ensureRuntimeInfrastructureImport(programPath, importName) {
  if (hasNamedImport(programPath, "@litsx/core/elements", importName)) {
    return;
  }

  const runtimeImport = programPath.get("body").find(
    (nodePath) =>
      nodePath.isImportDeclaration() &&
      nodePath.node.source.value === "@litsx/core/elements"
  );

  if (runtimeImport) {
    runtimeImport.node.specifiers.push(
      t.importSpecifier(t.identifier(importName), t.identifier(importName))
    );
    return;
  }

  programPath.unshiftContainer("body", t.importDeclaration(
    [t.importSpecifier(t.identifier(importName), t.identifier(importName))],
    t.stringLiteral("@litsx/core/elements")
  ));
}

function createRelativeModuleSpecifier(fromFilename, targetFilename) {
  const fromDir = path.dirname(fromFilename);
  let relativePath = normalizeFilePath(path.relative(fromDir, targetFilename));
  if (!relativePath.startsWith(".") && !relativePath.startsWith("/")) {
    relativePath = `./${relativePath}`;
  }
  return relativePath;
}

function ensureUniqueLocalName(programPath, baseName) {
  programPath.scope.crawl();
  if (!programPath.scope.hasBinding(baseName)) {
    return baseName;
  }

  let index = 1;
  while (programPath.scope.hasBinding(`__litsxImported${baseName}${index}`)) {
    index += 1;
  }

  return `__litsxImported${baseName}${index}`;
}

function ensureImportedElementCandidates(programPath, fromFilename, importedCandidates) {
  const localNames = [];

  importedCandidates.forEach((candidate) => {
    const sourceValue = candidate.sourceSpecifier || createRelativeModuleSpecifier(fromFilename, candidate.sourceFile);
    const importDeclarations = programPath.get("body").filter(
      (nodePath) =>
        nodePath.isImportDeclaration() &&
        nodePath.node.source.value === sourceValue
    );

    for (const importPath of importDeclarations) {
      const matchingSpecifier = importPath.node.specifiers.find((specifier) => {
        if (candidate.importedName === "default") {
          return t.isImportDefaultSpecifier(specifier);
        }
        return (
          t.isImportSpecifier(specifier) &&
          t.isIdentifier(specifier.imported, { name: candidate.importedName })
        );
      });

      if (matchingSpecifier?.local?.name) {
        localNames.push(matchingSpecifier.local.name);
        return;
      }
    }

    const localName = ensureUniqueLocalName(programPath, candidate.originalName);
    const specifier = candidate.importedName === "default"
      ? t.importDefaultSpecifier(t.identifier(localName))
      : t.importSpecifier(
          t.identifier(localName),
          t.identifier(candidate.importedName)
        );

    if (importDeclarations[0]) {
      importDeclarations[0].node.specifiers.push(specifier);
    } else {
      programPath.unshiftContainer(
        "body",
        t.importDeclaration([specifier], t.stringLiteral(sourceValue))
      );
    }

    localNames.push(localName);
  });

  return localNames;
}

function hasNamedImport(programPath, moduleName, importName) {
  return programPath.get("body").some((n) => {
    if (!n.isImportDeclaration() || n.node.source.value !== moduleName) {
      return false;
    }

    return n.node.specifiers.some(
      (specifier) =>
        t.isImportSpecifier(specifier) &&
        t.isIdentifier(specifier.imported, { name: importName })
    );
  });
}

function unwrapNamespaceAliasExpression(node) {
  let current = node;
  while (
    t.isTSAsExpression(current) ||
    t.isTSTypeAssertion(current) ||
    t.isTSNonNullExpression(current) ||
    t.isTSSatisfiesExpression?.(current)
  ) {
    current = current.expression;
  }
  return current;
}

function buildAvailableMap(programPath) {
  const availableMap = new Map();
  const namespaceImports = new Set();

  programPath.get("body").forEach((nodePath) => {
    if (nodePath.isImportDeclaration()) {
      nodePath.node.specifiers.forEach((specifier) => {
        if (t.isImportSpecifier(specifier) || t.isImportDefaultSpecifier(specifier)) {
          availableMap.set(specifier.local.name, {
            originalName: specifier.local.name,
          });
          return;
        }

        if (t.isImportNamespaceSpecifier(specifier)) {
          namespaceImports.add(specifier.local.name);
        }
      });
      return;
    }

    const localClassPath = resolveTopLevelClassPath(nodePath);
    if (!localClassPath) return;

    const localName = localClassPath.node.id?.name;
    if (!localName) return;

    availableMap.set(localName, {
      originalName: localName,
      local: true,
    });
  });

  programPath.get("body").forEach((nodePath) => {
    if (!nodePath.isVariableDeclaration()) {
      return;
    }

    nodePath.node.declarations.forEach((declarator) => {
      if (!t.isIdentifier(declarator.id)) {
        return;
      }

      const init = unwrapNamespaceAliasExpression(declarator.init);
      if (
        !t.isMemberExpression(init) ||
        init.computed ||
        !t.isIdentifier(unwrapNamespaceAliasExpression(init.object)) ||
        !t.isIdentifier(init.property) ||
        !namespaceImports.has(unwrapNamespaceAliasExpression(init.object).name)
      ) {
        return;
      }

      availableMap.set(declarator.id.name, {
        originalName: declarator.id.name,
      });
    });
  });

  return availableMap;
}

function detectElementsFromClass(classPath, availableMap, precomputedCandidates) {
  if (availableMap.size === 0) {
    return {
      elements: [],
      hasRenderableTemplate: false,
    };
  }

  const used = new Map();
  const nameToTag = new Map();
  let hasRenderableTemplate = false;

  precomputedCandidates.forEach((candidate) => {
    if (!availableMap.has(candidate)) return;
    const entry = availableMap.get(candidate);
    used.set(candidate, {
      ...entry,
      originalName: candidate,
      tagName: toKebab(candidate),
    });
  });

  classPath.traverse({
    JSXOpeningElement(path) {
      hasRenderableTemplate = true;
      const nameNode = path.get("name");
      if (!nameNode.isJSXIdentifier()) return;
      const originalName = nameNode.node.__scopedOriginal || nameNode.node.name;
      if (!availableMap.has(originalName)) return;

      const entry = availableMap.get(originalName);
      const tagName = toKebab(originalName);
      nameNode.node.name = tagName;
      nameToTag.set(originalName, tagName);
      used.set(originalName, {
        ...entry,
        originalName,
        tagName,
      });
    },
    JSXClosingElement(path) {
      hasRenderableTemplate = true;
      const nameNode = path.get("name");
      if (!nameNode.isJSXIdentifier()) return;
      const originalName = nameNode.node.__scopedOriginal || nameNode.node.name;
      const tagName = nameToTag.get(originalName);
      if (!tagName) return;
      nameNode.node.name = tagName;
    },
    TaggedTemplateExpression(path) {
      if (!t.isIdentifier(path.node.tag, { name: "html" })) return;
      hasRenderableTemplate = true;

      const quasi = path.node.quasi;

      availableMap.forEach((entry, originalName) => {
        const tagName = toKebab(originalName);
        const replaced = replaceInTemplate(quasi, originalName, tagName);
        if (replaced) {
          used.set(originalName, {
            ...entry,
            originalName,
            tagName,
          });
          nameToTag.set(originalName, tagName);
        }
      });
    },
  });

  return {
    elements: Array.from(used.values()),
    hasRenderableTemplate,
  };
}

function replaceInTemplate(quasi, originalName, kebabName) {
  let changed = false;
  const openingPattern = new RegExp(`<${originalName}(?=[\\s>])`, "g");
  const closingPattern = new RegExp(`</${originalName}(?=[\\s>])`, "g");

  quasi.quasis.forEach((element) => {
    const raw = element.value.raw;
    const cooked = element.value.cooked;

    const newRaw = raw
      .replace(openingPattern, `<${kebabName}`)
      .replace(closingPattern, `</${kebabName}`);
    const newCooked = cooked
      .replace(openingPattern, `<${kebabName}`)
      .replace(closingPattern, `</${kebabName}`);

    if (newRaw !== raw || newCooked !== cooked) {
      element.value.raw = newRaw;
      element.value.cooked = newCooked;
      changed = true;
    }
  });

  return changed;
}
