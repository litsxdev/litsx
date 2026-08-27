import jsxSyntaxPlugin from "@babel/plugin-syntax-jsx";
import * as babelParser from "@babel/parser";
import { isLitElementSuperClass } from "@litsx/babel-plugin-shared-hooks";
import { componentNameToTagName } from "@litsx/authoring";
import { parseWithLitsxVirtualization } from "@litsx/authoring/parser";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { normalizeFilePath } from "@litsx/typescript-session";
import { buildAvailableMap, setTypes, toKebab } from "./shared.js";

let t;

export function setScopedElementsBabelTypes(nextTypes) {
  t = nextTypes;
}
const SHADOW_MIXIN = "ShadowDomMixin";
const LIGHT_MIXIN = "LightDomMixin";
const ANNOTATE_HYDRATABLE_CUSTOM_ELEMENT = "annotateHydratableCustomElement";
const RENDER_LIGHT_MODULE = "@litsx/core/elements";
const RENDER_LIGHT_IMPORT = "__litsxRenderLight";
const NOSCRIPT_PRIMITIVE = "__litsxNoscript";
const IMPORT_RESOLUTION_EXTENSIONS = [
  ".mtsx",
  ".ctsx",
  ".jsx",
  ".mjs",
  ".cjs",
  ".js",
  ".tsx",
  ".mts",
  ".cts",
  ".ts",
];

export default function transformFunctionToClassPlugin(api, options = {}) {
  api.assertVersion("^8.0.0");
  t = api.types;
  setTypes(t);

  return {
    name: "transform-litsx-scoped-elements",
    inherits: jsxSyntaxPlugin.default || jsxSyntaxPlugin,
    visitor: {
      Program: {
        exit(programPath) {
          const availableMap = buildAvailableMap(programPath, {
            filename: programPath.hub.file?.opts?.filename || "",
          });
          annotateImportedLightDomEntries(programPath, availableMap);
          programPath.get("body").forEach((nodePath) => {
            const classPath = resolveTopLevelClassPath(nodePath);
            if (!classPath) return;
            if (!isLitElementSuperClass(classPath.node.superClass, t)) return;
            if (classPath.node._elementsTransformed) return;

            const transformed = transformClass(classPath, programPath, options, availableMap);
            if (transformed) {
              classPath.node._elementsTransformed = true;
            }
          });
        },
      },
    },
  };
}

export function resolveTopLevelClassPath(nodePath) {
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

function transformClass(classPath, programPath, options = {}, availableMap = buildAvailableMap(programPath)) {
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
    const importedEntries = ensureImportedElementCandidates(programPath, filename, importedCandidates);
    importedEntries.forEach(({ localName, originalName, lightDom }) => {
      precomputedCandidates.add(localName);
      const availableEntry = availableMap.get(localName);
      if (availableEntry) {
        availableEntry.lightDom ||= Boolean(lightDom);
        availableEntry.originalName = originalName ?? availableEntry.originalName ?? localName;
      } else {
        availableMap.set(localName, {
          originalName: originalName ?? localName,
          lightDom: Boolean(lightDom),
        });
      }
    });
  }

  const {
    elements: detectedElements,
    hasRenderableTemplate,
  } = detectElementsFromClass(classPath, programPath, availableMap, precomputedCandidates, {
    ssr: options?.ssr === true,
    reactCompat: options?.reactCompat === true,
  });
  const needsElements = detectedElements.length > 0;
  const hasExistingElementsStatic = hasStaticElementsMember(node);
  if (hasExistingElementsStatic && needsElements) {
    mergeDetectedElementsIntoStaticMember(
      node,
      detectedElements,
      programPath,
      options,
    );
  }
  const elementsStatic = hasExistingElementsStatic
    ? null
    : createClassProperty(
      "elements",
      detectedElements,
      programPath,
      options,
      needsElementsRegistry,
    );
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

function createClassProperty(name, elements, programPath, options = {}, allowEmpty = false) {
  if (!elements || (elements.length === 0 && !allowEmpty)) return null;

  const properties = createElementRegistryProperties(elements, programPath, options);

  const inheritedElements = t.logicalExpression(
    "??",
    t.memberExpression(t.super(), t.identifier("elements")),
    t.objectExpression([]),
  );
  const property = t.classProperty(
    t.identifier(name),
    t.objectExpression([
      t.spreadElement(inheritedElements),
      ...properties,
    ]),
    null,
    [],
    false
  );
  property.static = true;
  return property;
}

function createElementRegistryProperties(elements, programPath, options = {}) {
  return elements.map((entry) =>
    t.objectProperty(
      t.stringLiteral(entry.tagName),
      createElementRegistryValue(entry, programPath, options)
    )
  );
}

function isInheritedElementsSpread(property) {
  if (!t.isSpreadElement(property)) {
    return false;
  }
  const argument = property.argument;
  return (
    t.isLogicalExpression(argument, { operator: "??" }) &&
    t.isMemberExpression(argument.left) &&
    t.isSuper(argument.left.object) &&
    t.isIdentifier(argument.left.property, { name: "elements" })
  );
}

function readStaticObjectPropertyName(property) {
  if (!t.isObjectProperty(property) && !t.isObjectMethod(property)) {
    return null;
  }
  if (t.isIdentifier(property.key) && !property.computed) {
    return property.key.name;
  }
  return t.isStringLiteral(property.key) ? property.key.value : null;
}

function mergeDetectedElementsIntoStaticMember(
  node,
  elements,
  programPath,
  options = {},
) {
  const member = node.body.body.find((entry) => {
    if (!entry.static) return false;
    return (
      (t.isIdentifier(entry.key) && entry.key.name === "elements") ||
      (t.isStringLiteral(entry.key) && entry.key.value === "elements")
    );
  });
  if (!member || !("value" in member)) {
    return false;
  }

  const authoredValue = member.value;
  const authoredProperties = t.isObjectExpression(authoredValue)
    ? authoredValue.properties
    : [];
  const authoredNames = new Set(
    authoredProperties.map(readStaticObjectPropertyName).filter(Boolean),
  );
  const detectedProperties = createElementRegistryProperties(
    elements.filter((entry) => !authoredNames.has(entry.tagName)),
    programPath,
    options,
  );
  if (detectedProperties.length === 0) {
    return false;
  }

  if (t.isObjectExpression(authoredValue)) {
    const inheritedIndex = authoredProperties.findIndex(isInheritedElementsSpread);
    if (inheritedIndex >= 0) {
      authoredProperties.splice(inheritedIndex + 1, 0, ...detectedProperties);
    } else {
      authoredProperties.unshift(
        t.spreadElement(
          t.logicalExpression(
            "??",
            t.memberExpression(t.super(), t.identifier("elements")),
            t.objectExpression([]),
          ),
        ),
        ...detectedProperties,
      );
    }
    return true;
  }

  const inheritedElements = t.logicalExpression(
    "??",
    t.memberExpression(t.super(), t.identifier("elements")),
    t.objectExpression([]),
  );
  member.value = t.objectExpression([
    t.spreadElement(inheritedElements),
    ...detectedProperties,
    ...(authoredValue
      ? [t.spreadElement(t.logicalExpression("??", authoredValue, t.objectExpression([])))]
      : []),
  ]);
  return true;
}

function createElementRegistryValue(entry, programPath, options = {}) {
  const baseValue = entry.expression
    ? t.cloneNode(entry.expression, true)
    : t.identifier(entry.originalName);
  if (options?.ssr !== true) {
    return baseValue;
  }

  ensureRuntimeInfrastructureImport(
    programPath,
    ANNOTATE_HYDRATABLE_CUSTOM_ELEMENT,
  );

  return t.callExpression(
    t.identifier(ANNOTATE_HYDRATABLE_CUSTOM_ELEMENT),
    [
      baseValue,
      t.objectExpression(
        [
          t.objectProperty(
            t.identifier("tagName"),
            t.stringLiteral(entry.tagName),
          ),
          entry.moduleId
            ? t.objectProperty(
              t.identifier("moduleId"),
              t.stringLiteral(entry.moduleId),
            )
            : null,
        ].filter(Boolean),
      ),
    ],
  );
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

export function createRelativeModuleSpecifier(fromFilename, targetFilename) {
  const fromDir = path.dirname(fromFilename);
  let relativePath = normalizeFilePath(path.relative(fromDir, targetFilename));
  if (!relativePath.startsWith(".") && !relativePath.startsWith("/")) {
    relativePath = `./${relativePath}`;
  }
  return relativePath;
}

export function ensureUniqueLocalName(programPath, baseName) {
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

export function ensureImportedElementCandidates(programPath, fromFilename, importedCandidates) {
  const localEntries = [];

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
        localEntries.push({
          localName: matchingSpecifier.local.name,
          originalName: candidate.originalName,
          lightDom: Boolean(candidate.lightDom),
          moduleId: candidate.sourceSpecifier || candidate.sourceFile || null,
        });
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

    localEntries.push({
      localName,
      originalName: candidate.originalName,
      lightDom: Boolean(candidate.lightDom),
      moduleId: candidate.sourceSpecifier || candidate.sourceFile || null,
    });
  });

  return localEntries;
}

function annotateImportedLightDomEntries(programPath, availableMap) {
  const filename = normalizeFilePath(
    programPath.hub.file?.opts?.filename || path.join(process.cwd(), "__litsx_entry__.js")
  );

  programPath.get("body").forEach((nodePath) => {
    if (!nodePath.isImportDeclaration()) {
      return;
    }

    const resolvedSource = resolveImportSource(filename, nodePath.node.source.value);
    if (!resolvedSource) {
      return;
    }

    const lightDomExports = getLightDomExports(resolvedSource);
    if (lightDomExports.size === 0) {
      return;
    }

    for (const specifier of nodePath.node.specifiers) {
      const localName = specifier.local?.name;
      if (!localName || !availableMap.has(localName)) {
        continue;
      }

      const importedName = t.isImportDefaultSpecifier(specifier)
        ? "default"
        : specifier.imported?.name ?? specifier.imported?.value ?? null;

      if (importedName && lightDomExports.has(importedName)) {
        availableMap.get(localName).lightDom = true;
      }
    }
  });
}

function resolveImportSource(fromFilename, sourceValue) {
  if (typeof sourceValue !== "string" || !fromFilename) {
    return null;
  }

  const isRelative =
    sourceValue.startsWith("./") ||
    sourceValue.startsWith("../") ||
    sourceValue.startsWith("/");
  if (!isRelative) {
    return resolvePackageImportSource(fromFilename, sourceValue);
  }

  const basePath = sourceValue.startsWith("/")
    ? sourceValue
    : path.resolve(path.dirname(fromFilename), sourceValue);
  const candidates = IMPORT_RESOLUTION_EXTENSIONS.some((extension) => basePath.endsWith(extension))
    ? [basePath]
    : [
        ...IMPORT_RESOLUTION_EXTENSIONS.map((extension) => `${basePath}${extension}`),
        ...IMPORT_RESOLUTION_EXTENSIONS.map((extension) => path.join(basePath, `index${extension}`)),
      ];

  return candidates.find((candidate) => {
    try {
      return fs.statSync(candidate).isFile();
    } catch {
      return false;
    }
  }) ?? null;
}

function splitPackageSpecifier(sourceValue) {
  const parts = sourceValue.split("/");
  const packageName = sourceValue.startsWith("@")
    ? parts.slice(0, 2).join("/")
    : parts[0];
  const remainder = parts.slice(sourceValue.startsWith("@") ? 2 : 1).join("/");
  return {
    packageName,
    exportKey: remainder ? `./${remainder}` : ".",
  };
}

function selectImportExportTarget(value) {
  if (typeof value === "string") {
    return value;
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  for (const condition of ["import", "module", "default", "node", "require"]) {
    const target = selectImportExportTarget(value[condition]);
    if (target) {
      return target;
    }
  }
  return null;
}

function findPackageRoot(resolvedEntry, packageName) {
  let current = path.dirname(resolvedEntry);
  while (true) {
    const manifestPath = path.join(current, "package.json");
    try {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
      if (manifest.name === packageName) {
        return { root: current, manifest };
      }
    } catch {
      // Keep walking until the package boundary is found.
    }
    const parent = path.dirname(current);
    if (parent === current) {
      return null;
    }
    current = parent;
  }
}

function resolvePackageImportSource(fromFilename, sourceValue) {
  const { packageName, exportKey } = splitPackageSpecifier(sourceValue);
  try {
    const resolvedEntry = createRequire(fromFilename).resolve(sourceValue);
    const packageInfo = findPackageRoot(resolvedEntry, packageName);
    if (!packageInfo) {
      try {
        return fs.statSync(resolvedEntry).isFile()
          ? normalizeFilePath(resolvedEntry)
          : null;
      } catch {
        return null;
      }
    }

    const { root, manifest } = packageInfo;
    const exportDefinition = manifest.exports;
    const keyedExport = exportDefinition && typeof exportDefinition === "object" &&
      !Array.isArray(exportDefinition) &&
      Object.keys(exportDefinition).some((key) => key.startsWith("."))
      ? exportDefinition[exportKey]
      : exportKey === "." ? exportDefinition : null;
    const target = selectImportExportTarget(keyedExport) || (
      exportKey === "." && (manifest.module || manifest.main)
    );
    if (typeof target === "string") {
      const candidate = path.resolve(root, target);
      try {
        if (fs.statSync(candidate).isFile()) {
          return normalizeFilePath(candidate);
        }
      } catch {
        // Fall back to the entry resolved by Node.
      }
    }
    return normalizeFilePath(resolvedEntry);
  } catch {
    return null;
  }
}

const LIGHT_DOM_EXPORTS_BY_FILE = new Map();

function isSymbolForMetadata(node, key) {
  return (
    t.isCallExpression(node) &&
    t.isMemberExpression(node.callee) &&
    !node.callee.computed &&
    t.isIdentifier(node.callee.object, { name: "Symbol" }) &&
    t.isIdentifier(node.callee.property, { name: "for" }) &&
    node.arguments.length === 1 &&
    t.isStringLiteral(node.arguments[0], { value: key })
  );
}

function classDeclaresLightDom(node) {
  return (
    hasMixinInSuperChain(node?.superClass, LIGHT_MIXIN) ||
    (node?.body?.body ?? []).some((member) => (
      t.isClassProperty(member) &&
      member.static === true &&
      t.isBooleanLiteral(member.value, { value: true }) &&
      (
        (
          member.computed === true &&
          isSymbolForMetadata(member.key, "litsx.lightDom")
        ) ||
        (
          member.computed !== true &&
          t.isIdentifier(member.key, { name: "lightDom" })
        )
      )
    ))
  );
}

function addExportedLocal(exportedNamesByLocal, localName, exportedName) {
  if (!localName || !exportedName) {
    return;
  }
  const names = exportedNamesByLocal.get(localName) ?? new Set();
  names.add(exportedName);
  exportedNamesByLocal.set(localName, names);
}

function getLightDomExports(fileName) {
  const normalizedFileName = normalizeFilePath(fileName);
  if (LIGHT_DOM_EXPORTS_BY_FILE.has(normalizedFileName)) {
    return LIGHT_DOM_EXPORTS_BY_FILE.get(normalizedFileName);
  }

  const lightDomExports = new Set();
  LIGHT_DOM_EXPORTS_BY_FILE.set(normalizedFileName, lightDomExports);

  let sourceText = "";
  try {
    sourceText = fs.readFileSync(normalizedFileName, "utf8");
  } catch {
    return lightDomExports;
  }

  let ast;
  try {
    const plugins = /\.[cm]?tsx?$/.test(normalizedFileName)
      ? ["typescript"]
      : [];
    ast = parseWithLitsxVirtualization(babelParser.parse, sourceText, {
      sourceType: "module",
      plugins,
      sourceFilename: normalizedFileName,
    });
  } catch {
    return lightDomExports;
  }

  const exportedNamesByLocal = new Map();
  for (const node of ast.program?.body ?? []) {
    if (t.isExportNamedDeclaration(node)) {
      const declaration = node.declaration;
      if (
        (t.isFunctionDeclaration(declaration) || t.isClassDeclaration(declaration)) &&
        declaration.id?.name
      ) {
        addExportedLocal(exportedNamesByLocal, declaration.id.name, declaration.id.name);
      }
      for (const specifier of node.specifiers ?? []) {
        const localName = specifier.local?.name;
        const exportedName = specifier.exported?.name ?? specifier.exported?.value;
        if (!node.source) {
          addExportedLocal(exportedNamesByLocal, localName, exportedName);
        }
      }
      continue;
    }

    if (
      t.isExportDefaultDeclaration(node) &&
      (t.isFunctionDeclaration(node.declaration) || t.isClassDeclaration(node.declaration)) &&
      node.declaration.id?.name
    ) {
      addExportedLocal(exportedNamesByLocal, node.declaration.id.name, "default");
    }
  }

  for (const node of ast.program?.body ?? []) {
    const exportedClass = t.isExportNamedDeclaration(node) &&
      t.isClassDeclaration(node.declaration)
      ? node.declaration
      : t.isExportDefaultDeclaration(node) && t.isClassDeclaration(node.declaration)
        ? node.declaration
        : t.isClassDeclaration(node)
          ? node
          : null;
    if (
      exportedClass?.id?.name &&
      classDeclaresLightDom(exportedClass)
    ) {
      const exportedNames = t.isExportDefaultDeclaration(node)
        ? new Set(["default"])
        : exportedNamesByLocal.get(exportedClass.id.name) ?? new Set();
      exportedNames.forEach((exportedName) => lightDomExports.add(exportedName));
    } else if (
      t.isExportDefaultDeclaration(node) &&
      t.isClassDeclaration(node.declaration) &&
      !node.declaration.id &&
      classDeclaresLightDom(node.declaration)
    ) {
      lightDomExports.add("default");
    }

    const assignmentLeft = t.isExpressionStatement(node) &&
      t.isAssignmentExpression(node.expression, { operator: "=" })
      ? node.expression.left
      : null;
    if (
      !t.isMemberExpression(assignmentLeft) ||
      !t.isIdentifier(assignmentLeft.object) ||
      !(
        (
          !assignmentLeft.computed &&
          t.isIdentifier(assignmentLeft.property, { name: "lightDom" })
        ) ||
        (
          assignmentLeft.computed &&
          isSymbolForMetadata(assignmentLeft.property, "litsx.lightDom")
        )
      ) ||
      !t.isBooleanLiteral(node.expression.right, { value: true })
    ) {
      continue;
    }

    const exportedNames = exportedNamesByLocal.get(assignmentLeft.object.name) ?? new Set();
    exportedNames.forEach((exportedName) => lightDomExports.add(exportedName));
  }

  for (const node of ast.program?.body ?? []) {
    if (!node.source?.value) {
      continue;
    }
    const resolvedSource = resolveImportSource(normalizedFileName, node.source.value);
    if (!resolvedSource) {
      continue;
    }
    const sourceExports = getLightDomExports(resolvedSource);

    if (t.isExportAllDeclaration(node)) {
      sourceExports.forEach((exportedName) => {
        if (exportedName !== "default") {
          lightDomExports.add(exportedName);
        }
      });
      continue;
    }

    if (!t.isExportNamedDeclaration(node)) {
      continue;
    }
    for (const specifier of node.specifiers ?? []) {
      const importedName = specifier.local?.name ?? specifier.local?.value;
      const exportedName = specifier.exported?.name ?? specifier.exported?.value;
      if (importedName && exportedName && sourceExports.has(importedName)) {
        lightDomExports.add(exportedName);
      }
    }
  }

  return lightDomExports;
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

function getNamespaceMemberInfo(nameNode, availableMap) {
  if (!t.isJSXMemberExpression(nameNode)) return null;
  const properties = [];
  let current = nameNode;
  while (t.isJSXMemberExpression(current)) {
    if (!t.isJSXIdentifier(current.property)) return null;
    properties.unshift(current.property.name);
    current = current.object;
  }
  if (!t.isJSXIdentifier(current) || properties.length === 0) return null;
  const namespaceEntry = availableMap.get(current.name);
  if (!namespaceEntry?.namespace) return null;

  let expression = t.identifier(current.name);
  for (const property of properties) {
    expression = t.memberExpression(expression, t.identifier(property));
  }
  const parts = [current.name, ...properties];
  return {
    key: parts.join("."),
    tagName: componentNameToTagName(parts),
    expression,
    source: namespaceEntry.source,
  };
}

function detectElementsFromClass(classPath, programPath, availableMap, precomputedCandidates, options = {}) {
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
    const originalName = entry.originalName ?? candidate;
    used.set(candidate, {
      ...entry,
      originalName: candidate,
      tagName: componentNameToTagName(originalName),
    });
  });

  classPath.traverse({
    JSXOpeningElement(path) {
      if (isInsideNoscriptFallback(path)) return;
      hasRenderableTemplate = true;
      const nameNode = path.get("name");
      if (nameNode.isJSXMemberExpression()) {
        const member = getNamespaceMemberInfo(nameNode.node, availableMap);
        if (!member) return;
        nameNode.replaceWith(t.jsxIdentifier(member.tagName));
        nameToTag.set(member.key, member.tagName);
        used.set(member.key, {
          originalName: member.key,
          tagName: member.tagName,
          expression: member.expression,
          source: member.source,
        });
        return;
      }
      if (!nameNode.isJSXIdentifier()) return;
      const originalName = nameNode.node.__scopedOriginal || nameNode.node.name;
      if (!availableMap.has(originalName)) return;

      const entry = availableMap.get(originalName);
      const tagName = componentNameToTagName(originalName);
      nameNode.node.name = tagName;
      nameToTag.set(originalName, tagName);
      // Covers standalone use of this plugin before JSX has been lowered.
      // In the preset pipeline, html`` templates are handled below instead.
      maybeInsertSsrRenderLight(path, programPath, entry, options);
      used.set(originalName, {
        ...entry,
        originalName,
        tagName,
      });
    },
    JSXClosingElement(path) {
      if (isInsideNoscriptFallback(path)) return;
      hasRenderableTemplate = true;
      const nameNode = path.get("name");
      if (nameNode.isJSXMemberExpression()) {
        const member = getNamespaceMemberInfo(nameNode.node, availableMap);
        const tagName = member ? nameToTag.get(member.key) : null;
        if (tagName) nameNode.replaceWith(t.jsxIdentifier(tagName));
        return;
      }
      if (!nameNode.isJSXIdentifier()) return;
      const originalName = nameNode.node.__scopedOriginal || nameNode.node.name;
      const tagName = nameToTag.get(originalName);
      if (!tagName) return;
      nameNode.node.name = tagName;
    },
    TaggedTemplateExpression(path) {
      if (isInsideNoscriptFallback(path)) return;
      if (!t.isIdentifier(path.node.tag, { name: "html" })) return;
      hasRenderableTemplate = true;

      const quasi = path.node.quasi;
      const authoredComponentTags = new Set(
        quasi.__litsxAuthoredComponentTags || [],
      );

      availableMap.forEach((entry, originalName) => {
        const candidateTagName = toKebab(originalName);
        const replaced = replaceInTemplate(quasi, originalName, candidateTagName);
        const authoredComponentTag = authoredComponentTags.has(candidateTagName);
        const insertedRenderLight = maybeInsertSsrRenderLightTemplate(
          quasi,
          candidateTagName,
          programPath,
          entry,
          options,
        );
        if (replaced || authoredComponentTag || insertedRenderLight) {
          const tagName = componentNameToTagName(originalName);
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

// A noscript fallback is rendered by @litsx/ssr in an ephemeral scoped
// registry. It must not become part of the host's browser registry or its
// hydration metadata, even though its template is represented with html``.
export function isInsideScopedNoscriptFallback(path) {
  for (let current = path; current; current = current.parentPath) {
    if (
      current.isJSXElement?.() &&
      t.isJSXIdentifier(current.node.openingElement.name, { name: "noscript" })
    ) {
      return true;
    }
    if (
      current.isCallExpression?.() &&
      t.isIdentifier(current.node.callee, { name: NOSCRIPT_PRIMITIVE })
    ) {
      return true;
    }
  }
  return false;
}

const isInsideNoscriptFallback = isInsideScopedNoscriptFallback;

export function maybeInsertSsrRenderLight(openingPath, programPath, entry, options) {
  if (
    entry?.lightDom !== true ||
    options?.reactCompat === true
  ) {
    return;
  }

  const elementPath = openingPath.parentPath;
  if (!elementPath?.isJSXElement?.()) {
    return;
  }

  const children = elementPath.node.children ?? [];
  if (children.some((child) => !isWhitespaceJsxText(child)) || children.some(isRenderLightExpression)) {
    return;
  }

  if (openingPath.node.selfClosing) {
    openingPath.node.selfClosing = false;
    elementPath.node.closingElement = t.jsxClosingElement(t.cloneNode(openingPath.node.name));
  }

  elementPath.node.children = [
    t.jsxExpressionContainer(
      t.callExpression(ensureRenderLightImport(programPath), [])
    ),
  ];
}

export function isWhitespaceJsxText(node) {
  return t.isJSXText(node) && node.value.trim() === "";
}

export function isRenderLightExpression(node) {
  if (!t.isJSXExpressionContainer(node)) {
    return false;
  }

  const expression = node.expression;
  return (
    t.isCallExpression(expression) &&
    t.isIdentifier(expression.callee) &&
    (expression.callee.name === RENDER_LIGHT_IMPORT ||
      expression.callee.name === "renderLight")
  );
}

export function ensureRenderLightImport(programPath) {
  const existing = programPath.get("body").find(
    (nodePath) =>
      nodePath.isImportDeclaration() &&
      nodePath.node.source.value === RENDER_LIGHT_MODULE
  );

  if (existing) {
    const specifier = existing.node.specifiers.find((entry) =>
      t.isImportSpecifier(entry) &&
      t.isIdentifier(entry.imported, { name: RENDER_LIGHT_IMPORT })
    );

    if (specifier?.local?.name) {
      return t.identifier(specifier.local.name);
    }

    const localName = ensureUniqueLocalName(programPath, RENDER_LIGHT_IMPORT);
    existing.node.specifiers.push(
      t.importSpecifier(t.identifier(localName), t.identifier(RENDER_LIGHT_IMPORT))
    );
    return t.identifier(localName);
  }

  const localName = ensureUniqueLocalName(programPath, RENDER_LIGHT_IMPORT);
  programPath.unshiftContainer(
    "body",
    t.importDeclaration(
      [t.importSpecifier(t.identifier(localName), t.identifier(RENDER_LIGHT_IMPORT))],
      t.stringLiteral(RENDER_LIGHT_MODULE)
    )
  );
  return t.identifier(localName);
}

export function maybeInsertSsrRenderLightTemplate(quasi, tagName, programPath, entry, options = {}) {
  if (
    entry?.lightDom !== true ||
    options?.reactCompat === true
  ) {
    return false;
  }

  const pattern = new RegExp(`(<${tagName}(?:\\s[^>]*)?>)</${tagName}>`);
  for (let index = 0; index < quasi.quasis.length; index += 1) {
    const element = quasi.quasis[index];
    const raw = element.value.raw;
    const cooked = element.value.cooked ?? raw;
    const rawMatch = raw.match(pattern);
    const cookedMatch = cooked.match(pattern);

    if (!rawMatch || !cookedMatch) {
      continue;
    }

    const rawStart = rawMatch.index;
    const cookedStart = cookedMatch.index;
    const rawOpening = rawMatch[1];
    const cookedOpening = cookedMatch[1];
    const rawEnd = rawStart + rawMatch[0].length;
    const cookedEnd = cookedStart + cookedMatch[0].length;
    const closing = `</${tagName}>`;

    element.value.raw = `${raw.slice(0, rawStart)}${rawOpening}`;
    element.value.cooked = `${cooked.slice(0, cookedStart)}${cookedOpening}`;

    const nextElement = t.templateElement(
      {
        raw: `${closing}${raw.slice(rawEnd)}`,
        cooked: `${closing}${cooked.slice(cookedEnd)}`,
      },
      element.tail,
    );
    element.tail = false;
    quasi.quasis.splice(index + 1, 0, nextElement);
    quasi.expressions.splice(
      index,
      0,
      t.callExpression(ensureRenderLightImport(programPath), []),
    );
    return true;
  }

  return false;
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

export {
  annotateImportedLightDomEntries,
  consumeStaticIr,
  createClassProperty,
  createElementRegistryValue,
  detectElementsFromClass,
  getLightDomExports,
  getNamespaceMemberInfo,
  hasMixinInSuperChain,
  hasNamedImport,
  hasStaticElementsMember,
  insertClassProperty,
  normalizeStaticIr,
  replaceInTemplate,
  resolveImportSource,
  transformClass,
};
