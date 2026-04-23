import jsxSyntaxPlugin from "@babel/plugin-syntax-jsx";
import { isLitElementSuperClass } from "../../shared/babel-plugin-shared-hooks/src/index.js";

let t;
const SHADOW_MIXIN = "ShadowDomElementsMixin";
const LIGHT_BASE_MIXIN = "LightDomMixin";
const LIGHT_MIXIN = "LightDomElementsMixin";

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
  const precomputedCandidates = new Set(node._litsxElementCandidates || []);
  const needsElementsRegistry = Boolean(node._needsElementsRegistry);
  const lightDomRequested = Boolean(node._litsxLightDom);
  delete node._litsxElementCandidates;
  delete node._needsElementsRegistry;
  delete node._litsxLightDom;

  let returnStatement;
  classPath.traverse({
    ReturnStatement(returnPath) {
      if (t.isJSXElement(returnPath.node.argument)) {
        returnStatement = returnPath.node;
      }
    },
  });

  const detectedElements = detectElementsFromClass(classPath, programPath, precomputedCandidates);
  const needsElements = detectedElements.length > 0;

  const elementsStatic = createClassProperty("elements", detectedElements);
  const needsElementsMixin = Boolean(elementsStatic) || needsElementsRegistry;
  const needsLightDomBaseMixin = lightDomRequested && !needsElementsMixin;

  if (!returnStatement && !needsElements && !needsElementsRegistry && !needsLightDomBaseMixin) {
    return false;
  }

  if (
    needsLightDomBaseMixin &&
    !hasMixinInSuperChain(node.superClass, LIGHT_BASE_MIXIN) &&
    !hasMixinInSuperChain(node.superClass, LIGHT_MIXIN)
  ) {
    ensureRuntimeInfrastructureImport(programPath, LIGHT_BASE_MIXIN);
    node.superClass = t.callExpression(
      t.identifier(LIGHT_BASE_MIXIN),
      [node.superClass]
    );
  }

  if (
    needsElementsMixin &&
    !hasMixinInSuperChain(
      node.superClass,
      lightDomRequested ? LIGHT_MIXIN : SHADOW_MIXIN
    )
  ) {
    const mixinName = lightDomRequested ? LIGHT_MIXIN : SHADOW_MIXIN;
    ensureRuntimeInfrastructureImport(programPath, mixinName);
    node.superClass = t.callExpression(
      t.identifier(mixinName),
      [node.superClass]
    );
  }

  if (lightDomRequested && hasMixinInSuperChain(node.superClass, LIGHT_BASE_MIXIN)) {
    ensureRuntimeInfrastructureImport(programPath, LIGHT_BASE_MIXIN);
  }

  if (elementsStatic) {
    insertClassProperty(node, elementsStatic);
  }

  return needsLightDomBaseMixin || needsElementsMixin;
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

function ensureRuntimeInfrastructureImport(programPath, importName) {
  if (hasNamedImport(programPath, "litsx/runtime-infrastructure", importName)) {
    return;
  }

  const runtimeImport = programPath.get("body").find(
    (nodePath) =>
      nodePath.isImportDeclaration() &&
      nodePath.node.source.value === "litsx/runtime-infrastructure"
  );

  if (runtimeImport) {
    runtimeImport.node.specifiers.push(
      t.importSpecifier(t.identifier(importName), t.identifier(importName))
    );
    return;
  }

  programPath.unshiftContainer("body", t.importDeclaration(
    [t.importSpecifier(t.identifier(importName), t.identifier(importName))],
    t.stringLiteral("litsx/runtime-infrastructure")
  ));
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

function detectElementsFromClass(classPath, programPath, precomputedCandidates) {
  const availableMap = new Map();

  programPath.get("body").forEach((nodePath) => {
    if (nodePath.isImportDeclaration()) {
      nodePath.node.specifiers.forEach((specifier) => {
        if (t.isImportSpecifier(specifier) || t.isImportDefaultSpecifier(specifier)) {
          availableMap.set(specifier.local.name, {
            originalName: specifier.local.name,
          });
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

  if (availableMap.size === 0) return [];

  const used = new Map();
  const nameToTag = new Map();

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
      const nameNode = path.get("name");
      if (!nameNode.isJSXIdentifier()) return;
      const originalName = nameNode.node.__scopedOriginal || nameNode.node.name;
      const tagName = nameToTag.get(originalName);
      if (!tagName) return;
      nameNode.node.name = tagName;
    },
    TaggedTemplateExpression(path) {
      if (!t.isIdentifier(path.node.tag, { name: "html" })) return;

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

  return Array.from(used.values());
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
