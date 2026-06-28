import * as babelParser from "@babel/parser";
import jsxSyntaxPlugin from "@babel/plugin-syntax-jsx";
import { isLitElementSuperClass } from "@litsx/babel-plugin-shared-hooks";
import { parseWithLitsxVirtualization } from "@litsx/authoring/parser";
import fs from "node:fs";
import path from "node:path";
import { normalizeFilePath } from "@litsx/typescript-session";
import { buildAvailableMap, setTypes, toKebab } from "./shared.js";

let t;
const SHADOW_MIXIN = "ShadowDomMixin";
const LIGHT_MIXIN = "LightDomMixin";
const RENDER_LIGHT_MODULE = "@lit-labs/ssr-client/directives/render-light.js";
const RENDER_LIGHT_IMPORT = "renderLight";
const IMPORT_RESOLUTION_EXTENSIONS = [
  ".litsx",
  ".litsx.jsx",
  ".jsx",
  ".js",
  ".tsx",
  ".ts",
];

export default function transformFunctionToClassPlugin(api, options = {}) {
  api.assertVersion(7);
  t = api.types;
  setTypes(t);

  return {
    name: "transform-litsx-scoped-elements",
    inherits: jsxSyntaxPlugin.default || jsxSyntaxPlugin,
    visitor: {
      Program: {
        exit(programPath) {
          const availableMap = buildAvailableMap(programPath);
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
  });
  const needsElements = detectedElements.length > 0;
  const hasExistingElementsStatic = hasStaticElementsMember(node);
  const needsScopedElements =
    needsElements ||
    needsElementsRegistry ||
    hasExistingElementsStatic;

  // `static elements` belongs to the shadow/scoped-elements path only.
  // Light DOM components may still be valid, but only when they do not require
  // scoped element resolution at all.
  const elementsStatic = hasExistingElementsStatic || lightDomRequested
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

  if (needsLightDomMixin && needsScopedElements) {
    throw classPath.buildCodeFrameError(
      "LitSX does not support scoped elements in light DOM. Remove `static lightDom`, remove `static elements`, or switch the component to shadow DOM."
    );
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
    });
  });

  return localEntries;
}

function annotateImportedLightDomEntries(programPath, availableMap) {
  const filename = normalizeFilePath(programPath.hub.file?.opts?.filename || "");
  if (!filename) {
    return;
  }

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
  if (
    typeof sourceValue !== "string" ||
    !(
      sourceValue.startsWith("./") ||
      sourceValue.startsWith("../") ||
      sourceValue.startsWith("/")
    )
  ) {
    return null;
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

const LIGHT_DOM_EXPORTS_BY_FILE = new Map();

function getLightDomExports(fileName) {
  const normalizedFileName = normalizeFilePath(fileName);
  if (LIGHT_DOM_EXPORTS_BY_FILE.has(normalizedFileName)) {
    return LIGHT_DOM_EXPORTS_BY_FILE.get(normalizedFileName);
  }

  let sourceText = "";
  try {
    sourceText = fs.readFileSync(normalizedFileName, "utf8");
  } catch {
    const empty = new Set();
    LIGHT_DOM_EXPORTS_BY_FILE.set(normalizedFileName, empty);
    return empty;
  }

  let ast;
  try {
    ast = parseWithLitsxVirtualization(babelParser.parse, sourceText, { sourceType: "module" });
  } catch {
    const empty = new Set();
    LIGHT_DOM_EXPORTS_BY_FILE.set(normalizedFileName, empty);
    return empty;
  }

  const lightDomExports = new Set();
  for (const node of ast.program?.body ?? []) {
    if (t.isExportNamedDeclaration(node)) {
      const declaration = node.declaration;
      if (
        (t.isFunctionDeclaration(declaration) || t.isClassDeclaration(declaration)) &&
        declaration.id?.name &&
        nodeHasLightDomHoist(declaration)
      ) {
        lightDomExports.add(declaration.id.name);
      }
      continue;
    }

    if (
      t.isExportDefaultDeclaration(node) &&
      nodeHasLightDomHoist(node.declaration)
    ) {
      lightDomExports.add("default");
    }
  }

  LIGHT_DOM_EXPORTS_BY_FILE.set(normalizedFileName, lightDomExports);
  return lightDomExports;
}

function nodeHasLightDomHoist(node) {
  const body = node?.body?.body;
  if (!Array.isArray(body)) {
    return false;
  }

  return body.some((statement) => (
    t.isExpressionStatement(statement) &&
    t.isCallExpression(statement.expression) &&
    t.isIdentifier(statement.expression.callee, { name: "__litsx_static_lightDom" })
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
      tagName: toKebab(originalName),
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
        const insertedRenderLight = maybeInsertSsrRenderLightTemplate(
          quasi,
          tagName,
          programPath,
          entry,
          options,
        );
        if (replaced || insertedRenderLight) {
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

function maybeInsertSsrRenderLight(openingPath, programPath, entry, options) {
  if (options?.ssr !== true || entry?.lightDom !== true) {
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

function isWhitespaceJsxText(node) {
  return t.isJSXText(node) && node.value.trim() === "";
}

function isRenderLightExpression(node) {
  if (!t.isJSXExpressionContainer(node)) {
    return false;
  }

  const expression = node.expression;
  return (
    t.isCallExpression(expression) &&
    t.isIdentifier(expression.callee, { name: RENDER_LIGHT_IMPORT })
  );
}

function ensureRenderLightImport(programPath) {
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

function maybeInsertSsrRenderLightTemplate(quasi, tagName, programPath, entry, options = {}) {
  if (options?.ssr !== true || entry?.lightDom !== true) {
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
