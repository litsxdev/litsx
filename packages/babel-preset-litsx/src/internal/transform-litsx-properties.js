import { createRequire } from "module";

import { createNoopStagePlugin } from "./noop-stage-plugin.js";

let ts;
let t;
const TYPE_RESOLVER_CACHE = new Map();
const TYPE_RESOLVER_CACHE_LIMIT = 200;
const nodeRequire = (() => {
  try {
    return createRequire(import.meta.url);
  } catch {
    return null;
  }
})();

const TYPE_RESOLUTION_MODES = {
  AUTO: "auto",
  IN_MEMORY: "in-memory",
};

const VIRTUAL_SOURCE_FILENAME = "/__litsx_virtual__/inline-input.tsx";
const VIRTUAL_LIB_FILENAME = "/__litsx_virtual__/lib.playground.d.ts";
const DEFAULT_IN_MEMORY_LIB = `
type PropertyKey = string | number | symbol;
interface Object {}
interface Function {}
interface CallableFunction extends Function {}
interface NewableFunction extends Function {}
interface IArguments {
  length: number;
  callee: Function;
  [index: number]: any;
}
interface String {}
interface Number {}
interface Boolean {}
interface Symbol {}
interface Array<T> {
  length: number;
  [n: number]: T;
}
interface ReadonlyArray<T> {
  readonly length: number;
  readonly [n: number]: T;
}
interface Date {}
type Partial<T> = { [P in keyof T]?: T[P] };
type Required<T> = { [P in keyof T]-?: T[P] };
type Readonly<T> = { readonly [P in keyof T]: T[P] };
type Pick<T, K extends keyof T> = { [P in K]: T[P] };
type Exclude<T, U> = T extends U ? never : T;
type Omit<T, K extends keyof any> = Pick<T, Exclude<keyof T, K>>;
type Record<K extends keyof any, T> = { [P in K]: T };
`;

const DEFAULT_IN_MEMORY_FILES = {
  [VIRTUAL_LIB_FILENAME]: DEFAULT_IN_MEMORY_LIB,
};

function normalizeTypescriptModule(moduleValue) {
  return moduleValue?.default ?? moduleValue ?? null;
}

export function ensureTypescriptModule() {
  if (ts) {
    return ts;
  }

  if (
    nodeRequire &&
    (typeof process === "undefined" || process.browser !== true)
  ) {
    try {
      ts = normalizeTypescriptModule(nodeRequire("typescript"));
      return ts;
    } catch {
      // Fall through to the explicit runtime error below.
    }
  }

  throw new Error(
    "The LitSX transform needs a TypeScript runtime. Load it before using the transform in browser workers, or install the local 'typescript' package for Node-based transforms."
  );
}

export function setTypescriptModule(moduleValue) {
  ts = normalizeTypescriptModule(moduleValue);
  return ts;
}

export function setPropertyBabelTypes(types) {
  t = types;
}

function normalizeFilePath(value) {
  if (!value) return "";
  return String(value).replace(/\\/g, "/").replace(/\/+/g, "/");
}

function dirname(filePath) {
  const normalized = normalizeFilePath(filePath);
  const lastSlash = normalized.lastIndexOf("/");
  if (lastSlash <= 0) {
    return "/";
  }
  return normalized.slice(0, lastSlash);
}

function normalizeInMemoryFiles(files = {}) {
  const normalizedFiles = new Map();
  Object.entries({
    ...DEFAULT_IN_MEMORY_FILES,
    ...files,
  }).forEach(([filePath, fileSource]) => {
    normalizedFiles.set(normalizeFilePath(filePath), fileSource);
  });
  return normalizedFiles;
}

function hashSource(text) {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16);
}

function getTypeResolverCacheKey(filename, source, mode = TYPE_RESOLUTION_MODES.AUTO) {
  const normalizedFilename = filename
    ? normalizeFilePath(filename)
    : VIRTUAL_SOURCE_FILENAME;
  return `${mode}:${normalizedFilename}:${hashSource(source)}`;
}

function rememberTypeResolver(cacheKey, resolver) {
  TYPE_RESOLVER_CACHE.set(cacheKey, resolver);
  if (TYPE_RESOLVER_CACHE.size <= TYPE_RESOLVER_CACHE_LIMIT) return resolver;

  const oldestKey = TYPE_RESOLVER_CACHE.keys().next().value;
  if (oldestKey) {
    TYPE_RESOLVER_CACHE.delete(oldestKey);
  }
  return resolver;
}

export function createTypeResolver(filename, source, options = {}) {
  if (!source) {
    return null;
  }

  ensureTypescriptModule();

  const typeResolutionMode =
    options?.typeResolutionMode === TYPE_RESOLUTION_MODES.IN_MEMORY
      ? TYPE_RESOLUTION_MODES.IN_MEMORY
      : TYPE_RESOLUTION_MODES.AUTO;

  const cacheKey = getTypeResolverCacheKey(filename, source, typeResolutionMode);
  const cached = TYPE_RESOLVER_CACHE.get(cacheKey);
  if (cached) {
    TYPE_RESOLVER_CACHE.delete(cacheKey);
    TYPE_RESOLVER_CACHE.set(cacheKey, cached);
    return cached;
  }

  const shouldUseInMemoryResolution = typeResolutionMode === TYPE_RESOLUTION_MODES.IN_MEMORY;
  const resolvedFilename =
    shouldUseInMemoryResolution || !filename
      ? VIRTUAL_SOURCE_FILENAME
      : normalizeFilePath(filename);
  const normalizedFilename = normalizeFilePath(resolvedFilename);
  const compilerOptions = {
    target: ts.ScriptTarget.ESNext,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    jsx: ts.JsxEmit.Preserve,
    allowJs: true,
    checkJs: false,
    skipLibCheck: true,
    strict: false,
    esModuleInterop: true,
    allowSyntheticDefaultImports: true,
  };

  if (shouldUseInMemoryResolution || !filename) {
    return createInMemoryTypeResolver(
      normalizedFilename,
      source,
      compilerOptions,
      cacheKey,
      options?.inMemoryFiles
    );
  }

  const host = ts.createCompilerHost(compilerOptions, true);
  const originalReadFile = host.readFile.bind(host);
  const originalFileExists = host.fileExists.bind(host);
  const originalGetSourceFile = host.getSourceFile.bind(host);

  host.readFile = (filePath) => {
    const resolvedPath = normalizeFilePath(filePath);
    if (resolvedPath === normalizedFilename) {
      return source;
    }
    return originalReadFile(filePath);
  };

  host.fileExists = (filePath) => {
    const resolvedPath = normalizeFilePath(filePath);
    if (resolvedPath === normalizedFilename) {
      return true;
    }
    return originalFileExists(filePath);
  };

  host.getSourceFile = (filePath, languageVersion, onError, shouldCreateNewSourceFile) => {
    const resolvedPath = normalizeFilePath(filePath);
    if (resolvedPath === normalizedFilename) {
      return ts.createSourceFile(filePath, source, languageVersion, true);
    }
    return originalGetSourceFile(filePath, languageVersion, onError, shouldCreateNewSourceFile);
  };

  try {
    const program = ts.createProgram([normalizedFilename], compilerOptions, host);
    const sourceFile = program.getSourceFile(normalizedFilename);
    if (!sourceFile) return null;
    const checker = program.getTypeChecker();

    return rememberTypeResolver(cacheKey, {
      filename: normalizedFilename,
      sourceFile,
      checker,
      getNodeAtSpan(start, end, predicate) {
        return findTsNodeAtSpan(sourceFile, start, end, predicate);
      },
    });
  } catch {
    return null;
  }
}

function createInMemoryTypeResolver(
  filename,
  source,
  compilerOptions,
  cacheKey,
  inMemoryFiles = {}
) {
  const sourceFilename = normalizeFilePath(filename || VIRTUAL_SOURCE_FILENAME);
  const sourceDir = dirname(sourceFilename);
  const files = normalizeInMemoryFiles(inMemoryFiles);
  files.set(sourceFilename, source);

  const inMemoryCompilerOptions = {
    ...compilerOptions,
    noLib: true,
  };

  const host = {
    getSourceFile(filePath, languageVersion) {
      const normalizedPath = normalizeFilePath(filePath);
      const fileSource = files.get(normalizedPath);
      if (fileSource == null) return undefined;
      return ts.createSourceFile(normalizedPath, fileSource, languageVersion, true);
    },
    readFile(filePath) {
      return files.get(normalizeFilePath(filePath));
    },
    fileExists(filePath) {
      return files.has(normalizeFilePath(filePath));
    },
    writeFile() {},
    getDefaultLibFileName() {
      return VIRTUAL_LIB_FILENAME;
    },
    getCurrentDirectory() {
      return sourceDir;
    },
    getDirectories() {
      return [];
    },
    directoryExists(dirPath) {
      const normalizedPath = normalizeFilePath(dirPath);
      return normalizedPath === sourceDir || normalizedPath === dirname(VIRTUAL_LIB_FILENAME);
    },
    getCanonicalFileName(filePath) {
      return normalizeFilePath(filePath);
    },
    useCaseSensitiveFileNames() {
      return true;
    },
    getNewLine() {
      return "\n";
    },
  };

  try {
    const program = ts.createProgram(
      [sourceFilename, VIRTUAL_LIB_FILENAME],
      inMemoryCompilerOptions,
      host
    );
    const sourceFile = program.getSourceFile(sourceFilename);
    if (!sourceFile) return null;
    const checker = program.getTypeChecker();

    return rememberTypeResolver(cacheKey, {
      filename: sourceFilename,
      sourceFile,
      checker,
      getNodeAtSpan(start, end, predicate) {
        return findTsNodeAtSpan(sourceFile, start, end, predicate);
      },
    });
  } catch {
    return null;
  }
}

function findTsNodeAtSpan(sourceFile, start, end, predicate) {
  let found = null;

  function visit(node) {
    if (found) return;
    if (start < node.pos || end > node.end) return;

    if (node.pos === start && node.end === end && (!predicate || predicate(node))) {
      found = node;
      return;
    }

    ts.forEachChild(node, visit);

    if (!found && start >= node.getStart(sourceFile) && end <= node.end && (!predicate || predicate(node))) {
      found = node;
    }
  }

  visit(sourceFile);
  return found;
}

export function createPropertyConfig(type = null, options = {}) {
  return {
    type: type ? t.cloneNode(type) : null,
    attribute: options.attribute,
  };
}

function normalizePropertyConfigInput(input) {
  if (!input) return createPropertyConfig();
  if (t.isIdentifier(input)) return createPropertyConfig(input);
  return clonePropertyConfig(input);
}

function clonePropertyConfig(config) {
  return createPropertyConfig(config?.type || null, { attribute: config?.attribute });
}

export function createPropertyValue(config, defaultType = true) {
  const normalized = config || createPropertyConfig();
  const properties = [];
  const typeNode = normalized.type || (defaultType ? t.identifier("String") : null);

  if (typeNode) {
    properties.push(t.objectProperty(t.identifier("type"), t.cloneNode(typeNode)));
  }

  if (normalized.attribute === false) {
    properties.push(
      t.objectProperty(t.identifier("attribute"), t.booleanLiteral(false))
    );
  }

  return t.objectExpression(properties);
}

export function mergePropertyConfig(entry, config, defaultType = false) {
  if (!entry || !entry.node || !t.isObjectExpression(entry.node.value) || !config) {
    return;
  }

  const value = entry.node.value;

  if (config.type) {
    const typeProp = value.properties.find(
      (prop) =>
        t.isObjectProperty(prop) &&
        t.isIdentifier(prop.key, { name: "type" })
    );

    if (!typeProp) {
      value.properties.unshift(
        t.objectProperty(t.identifier("type"), t.cloneNode(config.type))
      );
    } else if (
      t.isIdentifier(typeProp.value) &&
      typeProp.value.name === "String" &&
      t.isIdentifier(config.type) &&
      config.type.name !== "String"
    ) {
      typeProp.value = t.cloneNode(config.type);
    }
  } else if (defaultType) {
    const hasType = value.properties.some(
      (prop) =>
        t.isObjectProperty(prop) &&
        t.isIdentifier(prop.key, { name: "type" })
    );
    if (!hasType) {
      value.properties.unshift(
        t.objectProperty(t.identifier("type"), t.identifier("String"))
      );
    }
  }

  if (config.attribute === false) {
    const attributeProp = value.properties.find(
      (prop) =>
        t.isObjectProperty(prop) &&
        t.isIdentifier(prop.key, { name: "attribute" })
    );

    if (!attributeProp) {
      value.properties.push(
        t.objectProperty(t.identifier("attribute"), t.booleanLiteral(false))
      );
    } else {
      attributeProp.value = t.booleanLiteral(false);
    }
  }
}

function mapLiteralTypeToLit(tsType) {
  if (!t.isTSLiteralType(tsType)) return null;
  const literal = tsType.literal;
  if (t.isStringLiteral(literal)) return t.identifier("String");
  if (t.isNumericLiteral(literal)) return t.identifier("Number");
  if (literal.type === "BooleanLiteral") return t.identifier("Boolean");
  return null;
}

function mapCheckerTypeToPropertyConfig(type, checker, seen = new Set()) {
  if (!type) return createPropertyConfig(t.identifier("Object"));

  const nonNullable = checker.getNonNullableType
    ? checker.getNonNullableType(type)
    : type;

  if (nonNullable.isUnion?.()) {
    const configs = nonNullable.types.map((item) =>
      mapCheckerTypeToPropertyConfig(item, checker, seen)
    );
    const uniqueTypes = [...new Set(
      configs
        .map((config) => (config?.type && t.isIdentifier(config.type) ? config.type.name : null))
        .filter(Boolean)
    )];
    const attributeFalse = configs.every((config) => config?.attribute === false);
    if (uniqueTypes.length === 1) {
      return createPropertyConfig(t.identifier(uniqueTypes[0]), {
        attribute: attributeFalse ? false : undefined,
      });
    }
    return createPropertyConfig(t.identifier("Object"), {
      attribute: attributeFalse ? false : undefined,
    });
  }

  if (nonNullable.isIntersection?.()) {
    const configs = nonNullable.types.map((item) =>
      mapCheckerTypeToPropertyConfig(item, checker, seen)
    );
    const primitiveNames = ["String", "Number", "Boolean", "Array", "Date"];
    const uniqueTypes = [...new Set(
      configs
        .map((config) => (config?.type && t.isIdentifier(config.type) ? config.type.name : null))
        .filter(Boolean)
    )];
    const preferredPrimitive = primitiveNames.find((name) => uniqueTypes.includes(name));
    const attributeFalse = configs.every((config) => config?.attribute === false);
    if (preferredPrimitive) {
      return createPropertyConfig(t.identifier(preferredPrimitive), {
        attribute: attributeFalse ? false : undefined,
      });
    }
    if (uniqueTypes.length === 1) {
      return createPropertyConfig(t.identifier(uniqueTypes[0]), {
        attribute: attributeFalse ? false : undefined,
      });
    }
    return createPropertyConfig(t.identifier("Object"), {
      attribute: attributeFalse ? false : undefined,
    });
  }

  const callSignatures = checker.getSignaturesOfType(nonNullable, ts.SignatureKind.Call);
  if (callSignatures.length) {
    return createPropertyConfig(t.identifier("Object"), { attribute: false });
  }

  if (nonNullable.flags & (ts.TypeFlags.String | ts.TypeFlags.StringLike)) {
    return createPropertyConfig(t.identifier("String"));
  }
  if (nonNullable.flags & (ts.TypeFlags.Number | ts.TypeFlags.NumberLike)) {
    return createPropertyConfig(t.identifier("Number"));
  }
  if (nonNullable.flags & (ts.TypeFlags.Boolean | ts.TypeFlags.BooleanLike)) {
    return createPropertyConfig(t.identifier("Boolean"));
  }
  if (nonNullable.flags & ts.TypeFlags.BigIntLike) {
    return createPropertyConfig(t.identifier("Object"));
  }

  if (checker.isArrayType?.(nonNullable) || checker.isTupleType?.(nonNullable)) {
    return createPropertyConfig(t.identifier("Array"));
  }

  const symbol = nonNullable.getSymbol?.();
  const symbolName = symbol?.getName?.();
  if (symbolName === "Date") {
    return createPropertyConfig(t.identifier("Date"));
  }

  if (symbol && !seen.has(symbol)) {
    seen.add(symbol);
  }

  return createPropertyConfig(t.identifier("Object"));
}

function getCheckerTypeForBabelNode(node, typeResolver) {
  if (!typeResolver || typeof node?.start !== "number" || typeof node?.end !== "number") {
    return null;
  }

  const tsNode = typeResolver.getNodeAtSpan(node.start, node.end);
  if (!tsNode) return null;

  try {
    return typeResolver.checker.getTypeAtLocation(tsNode);
  } catch {
    return null;
  }
}

function getCheckerPropertyMapForPattern(node, typeResolver) {
  const type = getCheckerTypeForBabelNode(node, typeResolver);
  if (!type) return null;
  const checker = typeResolver.checker;
  const nonNullable = checker.getNonNullableType
    ? checker.getNonNullableType(type)
    : type;

  if (
    checker.isArrayType?.(nonNullable) ||
    checker.isTupleType?.(nonNullable) ||
    (nonNullable.flags & (
      ts.TypeFlags.StringLike |
      ts.TypeFlags.NumberLike |
      ts.TypeFlags.BooleanLike |
      ts.TypeFlags.BigIntLike
    ))
  ) {
    return null;
  }

  if (checker.getSignaturesOfType(nonNullable, ts.SignatureKind.Call).length) {
    return null;
  }

  const propertyMap = new Map();
  for (const symbol of checker.getPropertiesOfType(nonNullable)) {
    const valueDeclaration = symbol.valueDeclaration || symbol.declarations?.[0];
    if (!valueDeclaration) continue;
    const symbolType = checker.getTypeOfSymbolAtLocation(symbol, valueDeclaration);
    propertyMap.set(
      symbol.getName(),
      mapCheckerTypeToPropertyConfig(symbolType, checker)
    );
  }

  return propertyMap.size ? propertyMap : null;
}

function findTypeDeclaration(programPath, name) {
  if (!programPath) return null;
  const bodyPaths = programPath.get("body");
  for (const path of bodyPaths) {
    if (path.isTSTypeAliasDeclaration() && path.node.id.name === name) {
      return path.node;
    }
    if (path.isTSInterfaceDeclaration() && path.node.id.name === name) {
      return path.node;
    }
  }
  return null;
}

function getTypeLiteralMembers(node, programPath, seen = new Set()) {
  if (!node) return [];

  if (t.isTSTypeAliasDeclaration(node)) {
    return getTypeLiteralMembers(node.typeAnnotation, programPath, seen);
  }

  if (t.isTSInterfaceDeclaration(node)) {
    const members = [...node.body.body];
    for (const extension of node.extends || []) {
      if (!t.isIdentifier(extension.expression)) continue;
      const name = extension.expression.name;
      if (seen.has(name)) continue;
      seen.add(name);
      const declaration = findTypeDeclaration(programPath, name);
      members.unshift(...getTypeLiteralMembers(declaration, programPath, seen));
    }
    return members;
  }

  if (t.isTSTypeLiteral(node)) {
    return [...node.members];
  }

  if (t.isTSIntersectionType(node)) {
    return node.types.flatMap((typeNode) =>
      getTypeLiteralMembers(typeNode, programPath, seen)
    );
  }

  if (t.isTSParenthesizedType(node)) {
    return getTypeLiteralMembers(node.typeAnnotation, programPath, seen);
  }

  if (t.isTSTypeReference(node) && programPath && t.isIdentifier(node.typeName)) {
    const name = node.typeName.name;
    if (seen.has(name)) return [];
    seen.add(name);
    const declaration = findTypeDeclaration(programPath, name);
    return getTypeLiteralMembers(declaration, programPath, seen);
  }

  return [];
}

function mapTsTypeToLit(tsType, programPath, seen = new Set()) {
  if (!tsType) return createPropertyConfig(t.identifier("Object"));

  if (t.isTSParenthesizedType(tsType)) {
    return mapTsTypeToLit(tsType.typeAnnotation, programPath, seen);
  }

  switch (tsType.type) {
    case "TSStringKeyword":
      return createPropertyConfig(t.identifier("String"));
    case "TSNumberKeyword":
      return createPropertyConfig(t.identifier("Number"));
    case "TSBooleanKeyword":
      return createPropertyConfig(t.identifier("Boolean"));
    case "TSArrayType":
    case "TSTupleType":
      return createPropertyConfig(t.identifier("Array"));
    case "TSFunctionType":
    case "TSConstructorType":
      return createPropertyConfig(t.identifier("Object"), { attribute: false });
    case "TSLiteralType": {
      const literalType = mapLiteralTypeToLit(tsType);
      return createPropertyConfig(literalType || t.identifier("Object"));
    }
    case "TSUnionType": {
      const inferred = tsType.types
        .map((typeNode) => mapTsTypeToLit(typeNode, programPath, seen))
        .filter(Boolean);
      const uniqueTypes = [...new Set(
        inferred
          .map((config) => (t.isIdentifier(config.type) ? config.type.name : null))
          .filter(Boolean)
      )];
      const attributeFalse = inferred.every((config) => config.attribute === false);
      if (uniqueTypes.length === 1) {
        return createPropertyConfig(t.identifier(uniqueTypes[0]), {
          attribute: attributeFalse ? false : undefined,
        });
      }
      return createPropertyConfig(t.identifier("Object"), {
        attribute: attributeFalse ? false : undefined,
      });
    }
    case "TSIntersectionType": {
      if (
        getTypeLiteralMembers(tsType, programPath, new Set(seen)).length > 0
      ) {
        return createPropertyConfig(t.identifier("Object"));
      }
      return createPropertyConfig(t.identifier("Object"));
    }
    case "TSTypeReference": {
      if (
        t.isIdentifier(tsType.typeName) &&
        (tsType.typeName.name === "Array" || tsType.typeName.name === "ReadonlyArray")
      ) {
        return createPropertyConfig(t.identifier("Array"));
      }
      if (t.isIdentifier(tsType.typeName) && tsType.typeName.name === "Record") {
        return createPropertyConfig(t.identifier("Object"));
      }
      if (t.isIdentifier(tsType.typeName) && tsType.typeName.name === "Date") {
        return createPropertyConfig(t.identifier("Date"));
      }
      if (t.isIdentifier(tsType.typeName)) {
        const name = tsType.typeName.name;
        if (seen.has(name)) {
          return createPropertyConfig(t.identifier("Object"));
        }
        const nextSeen = new Set(seen);
        nextSeen.add(name);
        const declaration = findTypeDeclaration(programPath, name);
        if (declaration) {
          if (getTypeLiteralMembers(declaration, programPath, nextSeen).length > 0) {
            return createPropertyConfig(t.identifier("Object"));
          }
          if (t.isTSTypeAliasDeclaration(declaration)) {
            return mapTsTypeToLit(declaration.typeAnnotation, programPath, nextSeen);
          }
          if (t.isTSInterfaceDeclaration(declaration)) {
            return createPropertyConfig(t.identifier("Object"));
          }
        }
      }
      return createPropertyConfig(t.identifier("Object"));
    }
    default:
      return createPropertyConfig(t.identifier("Object"));
  }
}

function inferTypeFromDefault(node) {
  if (t.isNumericLiteral(node)) {
    return t.identifier("Number");
  }
  if (t.isBooleanLiteral(node)) {
    return t.identifier("Boolean");
  }
  if (t.isArrayExpression(node)) {
    return t.identifier("Array");
  }
  if (t.isObjectExpression(node)) {
    return t.identifier("Object");
  }
  return t.identifier("String");
}

function extractParamName(param) {
  if (t.isIdentifier(param)) return param.name;
  if (t.isRestElement(param) && t.isIdentifier(param.argument)) {
    return param.argument.name;
  }
  if (t.isAssignmentPattern(param) && t.isIdentifier(param.left)) {
    return param.left.name;
  }
  if (t.isObjectProperty(param) && t.isIdentifier(param.value)) {
    return param.value.name;
  }
  if (
    t.isObjectProperty(param) &&
    t.isAssignmentPattern(param.value) &&
    t.isIdentifier(param.value.left)
  ) {
    return param.value.left.name;
  }
  if (
    t.isObjectProperty(param) &&
    t.isIdentifier(param.key) &&
    !param.shorthand &&
    !t.isIdentifier(param.value)
  ) {
    return param.key.name;
  }
  return null;
}

function getTsLiteralPropertyTypes(typeAnnotation, programPath, seen = new Set()) {
  const map = new Map();
  if (!typeAnnotation) return map;
  const tsType =
    typeAnnotation.type === "TSTypeAnnotation"
      ? typeAnnotation.typeAnnotation
      : typeAnnotation;
  if (!tsType) return map;

  if (t.isTSTypeAliasDeclaration(tsType)) {
    return getTsLiteralPropertyTypes(tsType.typeAnnotation, programPath, seen);
  } else if (t.isTSTypeLiteral(tsType)) {
    tsType.members.forEach((member) => {
      if (
        t.isTSPropertySignature(member) &&
        t.isIdentifier(member.key) &&
        member.typeAnnotation
      ) {
        map.set(
          member.key.name,
          mapTsTypeToLit(member.typeAnnotation.typeAnnotation, programPath, seen)
        );
      }
    });
  } else if (t.isTSInterfaceDeclaration(tsType)) {
    getTypeLiteralMembers(tsType, programPath, seen).forEach((member) => {
      if (
        t.isTSPropertySignature(member) &&
        t.isIdentifier(member.key) &&
        member.typeAnnotation
      ) {
        map.set(
          member.key.name,
          mapTsTypeToLit(member.typeAnnotation.typeAnnotation, programPath, seen)
        );
      }
    });
  } else if (t.isTSIntersectionType(tsType)) {
    tsType.types.forEach((typeNode) => {
      const nextMap = getTsLiteralPropertyTypes(typeNode, programPath, seen);
      nextMap.forEach((value, key) => {
        if (!map.has(key)) map.set(key, value);
      });
    });
  } else if (t.isTSMappedType(tsType)) {
    map.set("default", createPropertyConfig(t.identifier("Object")));
  } else if (t.isTSTypeReference(tsType) && programPath) {
    const typeName = tsType.typeName;
    if (t.isIdentifier(typeName)) {
      const aliasName = typeName.name;
      if (!seen.has(aliasName)) {
        seen.add(aliasName);
        const declaration = findTypeDeclaration(programPath, aliasName);
        if (declaration) {
          const aliasMap = getTsLiteralPropertyTypes(
            declaration,
            programPath,
            seen
          );
          aliasMap.forEach((value, key) => {
            if (!map.has(key)) {
              map.set(key, value);
            }
          });
        }
      }
    }
  }

  return map;
}

export function extractProperties(functionPath, programPath, options = {}) {
  const typeResolver = options.typeResolver || null;
  const warn =
    typeof options.warn === "function"
      ? options.warn
      : null;
  const propertyMap = new Map();
  const bindings = new Map();
  const defaults = new Map();
  const nestedInitializers = [];
  const forwardRefOptions = options.forwardRef;

  function isSpecialRefPropName(name) {
    return name === "ref";
  }

  function getSpecialRefPropertyConfig() {
    return createPropertyConfig(t.identifier("Object"), { attribute: false });
  }

  function addNestedInitializer(pattern, rootName, defaultValue) {
    nestedInitializers.push({
      pattern: t.cloneNode(pattern),
      root: rootName,
      defaultValue: defaultValue ? t.cloneNode(defaultValue) : null,
    });
  }

  function ensureProperty(propName, config, options = {}) {
    if (!propName || propName === "props") return null;
    let normalizedConfig = normalizePropertyConfigInput(config);
    if (isSpecialRefPropName(propName)) {
      const refConfig = getSpecialRefPropertyConfig();
      normalizedConfig = createPropertyConfig(
        normalizedConfig.type || refConfig.type,
        {
          attribute:
            normalizedConfig.attribute === false || refConfig.attribute === false
              ? false
              : normalizedConfig.attribute,
        }
      );
    }
    let entry = propertyMap.get(propName);

    if (!entry) {
      entry = {
        node: t.objectProperty(
          t.identifier(propName),
          createPropertyValue(normalizedConfig, options.defaultType !== false)
        ),
      };
      propertyMap.set(propName, entry);
      return entry;
    }

    mergePropertyConfig(entry, normalizedConfig, options.defaultType !== false);

    return entry;
  }

  function registerBinding(localName, propName) {
    if (!localName || !propName) return;
    bindings.set(localName, propName);
  }

  function recordDefault(propName, expression) {
    if (!propName || !expression) return;
    if (!defaults.has(propName)) {
      defaults.set(propName, t.cloneNode(expression));
    }
  }

  function handleIdentifier(identifier, config, options = {}) {
    const propertyConfig = isSpecialRefPropName(identifier.name)
      ? getSpecialRefPropertyConfig()
      : config || createPropertyConfig(t.identifier("String"));
    ensureProperty(identifier.name, propertyConfig);
    if (options.bindKey) {
      registerBinding(identifier.name, options.bindKey);
    } else {
      registerBinding(identifier.name, identifier.name);
    }
  }

  function handleRestElement(restEl, explicitType, options = {}) {
    const name = extractParamName(restEl);
    if (!name) return;
    const propertyConfig = isSpecialRefPropName(name)
      ? getSpecialRefPropertyConfig()
      : explicitType || createPropertyConfig(t.identifier("Array"));
    ensureProperty(name, propertyConfig);
    registerBinding(name, options.bindKey || name);
  }

  function handleAssignmentPattern(pattern, explicitType) {
    const name = extractParamName(pattern);
    if (!name) return;
    let propertyConfig = isSpecialRefPropName(name)
      ? getSpecialRefPropertyConfig()
      : explicitType || createPropertyConfig(t.identifier("String"));
    if (!explicitType && pattern.right) {
      propertyConfig = createPropertyConfig(inferTypeFromDefault(pattern.right));
    }
    if (isSpecialRefPropName(name)) {
      propertyConfig = getSpecialRefPropertyConfig();
    }
    ensureProperty(name, propertyConfig);
    registerBinding(name, name);
    if (pattern.right) {
      recordDefault(name, pattern.right);
    }
  }

  function handleObjectPattern(pattern) {
    const typeMap =
      getCheckerPropertyMapForPattern(pattern, typeResolver) ||
      getTsLiteralPropertyTypes(pattern.typeAnnotation, programPath);
    pattern.properties.forEach((prop) => {
      if (t.isRestElement(prop) && t.isIdentifier(prop.argument)) {
        const restName = prop.argument.name;
        ensureProperty(restName, createPropertyConfig(t.identifier("Object")));
        registerBinding(restName, restName);
        return;
      }

      if (!t.isObjectProperty(prop)) return;

      const keyName = t.isIdentifier(prop.key)
        ? prop.key.name
        : t.isStringLiteral(prop.key)
        ? prop.key.value
        : null;

      if (!keyName) return;

      let localName;
      let propertyConfig = isSpecialRefPropName(keyName)
        ? getSpecialRefPropertyConfig()
        : typeMap.get(keyName) || createPropertyConfig(t.identifier("String"));

      if (t.isIdentifier(prop.value)) {
        localName = prop.value.name;
      } else if (t.isAssignmentPattern(prop.value)) {
        const assignment = prop.value;
        if (t.isIdentifier(assignment.left)) {
          localName = assignment.left.name;
          if (
            t.isIdentifier(propertyConfig.type) &&
            propertyConfig.type.name === "String"
          ) {
            propertyConfig = createPropertyConfig(inferTypeFromDefault(assignment.right));
          }
        } else if (t.isObjectPattern(assignment.left)) {
          propertyConfig = createPropertyConfig(t.identifier("Object"));
          addNestedInitializer(assignment.left, keyName, assignment.right);
        } else if (t.isArrayPattern(assignment.left)) {
          propertyConfig = createPropertyConfig(t.identifier("Array"));
          addNestedInitializer(assignment.left, keyName, assignment.right);
        }
      } else if (prop.shorthand && t.isIdentifier(prop.key)) {
        localName = prop.key.name;
      } else if (t.isObjectPattern(prop.value)) {
        propertyConfig = createPropertyConfig(t.identifier("Object"));
        addNestedInitializer(prop.value, keyName, null);
      } else if (t.isArrayPattern(prop.value)) {
        propertyConfig = createPropertyConfig(t.identifier("Array"));
        addNestedInitializer(prop.value, keyName, null);
      }

      ensureProperty(keyName, propertyConfig);
      registerBinding(localName || keyName, keyName);
      if (t.isAssignmentPattern(prop.value)) {
        recordDefault(keyName, prop.value.right);
      }
    });
  }

  function ensureAttributeFalse(entry) {
    mergePropertyConfig(entry, createPropertyConfig(null, { attribute: false }));
  }

  function inferOpaquePropsMemberAccess(bindingName) {
    if (!bindingName) return;

    const binding = functionPath.scope.getBinding(bindingName);
    if (!binding) return;

    binding.referencePaths.forEach((refPath) => {
      if (!refPath.node) return;
      if (!refPath.parentPath || !refPath.parentPath.isMemberExpression()) return;
      if (refPath.parentKey !== "object") return;

      const memberPath = refPath.parentPath;
      if (memberPath.node.computed || !t.isIdentifier(memberPath.node.property)) return;

      const propName = memberPath.node.property.name;
      if (!propName || propName === "props") return;

      if (!propertyMap.has(propName) && warn) {
        warn({
          code: "LITSX_PROP_FALLBACK_STRING",
          message: `Falling back to String for prop "${propName}" inferred from opaque props access. Prefer destructuring, TypeScript types, or ^properties(...) for stronger property metadata.`,
          propName,
          localName: bindingName,
          line: memberPath.node.loc?.start?.line ?? null,
          column: memberPath.node.loc?.start?.column ?? null,
        });
      }

      ensureProperty(propName, createPropertyConfig(t.identifier("String")));
    });
  }

  function tryRegisterTypedAliasBinding(identifier) {
    if (!t.isIdentifier(identifier)) return false;

    const checkerPropertyMap = getCheckerPropertyMapForPattern(identifier, typeResolver);
    if (checkerPropertyMap?.size) {
      registerBinding(identifier.name, {
        kind: "alias",
        properties: checkerPropertyMap,
      });
      checkerPropertyMap.forEach((propType, propName) => {
        ensureProperty(propName, propType);
      });
      return true;
    }

    const typeAnnotation = identifier.typeAnnotation && identifier.typeAnnotation.typeAnnotation;
    if (t.isTSTypeReference(typeAnnotation) && t.isIdentifier(typeAnnotation.typeName)) {
      const declaration = findTypeDeclaration(programPath, typeAnnotation.typeName.name);
      if (declaration) {
        const typeMembers = getTypeLiteralMembers(declaration, programPath, new Set());
        if (typeMembers.length > 0) {
          const aliasProperties = new Map();
          typeMembers.forEach((member) => {
            if (
              t.isTSPropertySignature(member) &&
              t.isIdentifier(member.key) &&
              member.typeAnnotation
            ) {
              const propName = member.key.name;
              const propType = mapTsTypeToLit(member.typeAnnotation.typeAnnotation, programPath);
              ensureProperty(propName, propType);
              aliasProperties.set(propName, propType);
            }
          });
          registerBinding(identifier.name, {
            kind: "alias",
            properties: aliasProperties,
          });
          return true;
        }
      }
    }

    return false;
  }

  functionPath.node.params.forEach((param, paramIndex) => {
    if (
      forwardRefOptions &&
      paramIndex === forwardRefOptions.paramIndex &&
      t.isIdentifier(param)
    ) {
      const propName = forwardRefOptions.propName || param.name;
      const entry = ensureProperty(propName, createPropertyConfig(t.identifier("Object")));
      ensureAttributeFalse(entry);
      registerBinding(param.name, propName);
      return;
    }

    if (t.isIdentifier(param)) {
      let propertyConfig = createPropertyConfig(t.identifier("String"));
      const checkerType = getCheckerTypeForBabelNode(param, typeResolver);
      if (checkerType) {
        propertyConfig = mapCheckerTypeToPropertyConfig(checkerType, typeResolver.checker);
      } else if (param.typeAnnotation) {
        propertyConfig = mapTsTypeToLit(param.typeAnnotation.typeAnnotation, programPath);
      }
      if (tryRegisterTypedAliasBinding(param)) return;

      handleIdentifier(param, propertyConfig);

      if (param.name === "props") {
        inferOpaquePropsMemberAccess(param.name);
      }

      return;
    }

    if (t.isRestElement(param)) {
      const typeAnnotation = param.typeAnnotation
        ? mapTsTypeToLit(param.typeAnnotation.typeAnnotation, programPath)
        : createPropertyConfig(t.identifier("Array"));
      handleRestElement(param, typeAnnotation);
      return;
    }

    if (t.isAssignmentPattern(param)) {
      if (t.isIdentifier(param.left) && tryRegisterTypedAliasBinding(param.left)) {
        if (param.left.name === "props") {
          inferOpaquePropsMemberAccess(param.left.name);
        }
        return;
      }

      const explicitType = param.left.typeAnnotation
        ? mapTsTypeToLit(param.left.typeAnnotation.typeAnnotation, programPath)
        : null;
      handleAssignmentPattern(param, explicitType);
      return;
    }

    if (t.isObjectPattern(param)) {
      handleObjectPattern(param);
      return;
    }
  });

  const properties = Array.from(propertyMap.values()).map((entry) => entry.node);
  const propertyNames = new Set(propertyMap.keys());

  return { properties, propertyNames, bindings, defaults, nestedInitializers };
}

export default createNoopStagePlugin("transform-litsx-properties");
