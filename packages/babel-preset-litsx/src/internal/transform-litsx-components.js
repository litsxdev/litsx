import jsxSyntaxPlugin from "@babel/plugin-syntax-jsx";
import {
  createTypeResolver,
  ensureTypescriptModule,
  extractProperties,
  setPropertyBabelTypes,
} from "./transform-litsx-properties.js";
import {
  assertStaticHoistsStayTopLevel,
  processStaticHoists,
  setStaticHoistsBabelTypes,
} from "./transform-litsx-static-hoists.js";
import {
  collectNativeClassNameWarnings,
  createHandlerClassMember,
  processHandlers,
  setHandlersBabelTypes,
} from "./transform-litsx-handlers.js";
import {
  handlePotentialComponentExport,
  maybeTransformWrappedVariableDeclarator,
  setWrapperUtilsBabelTypes,
} from "./transform-litsx-wrapper-utils.js";
import {
  createComponentInstanceRefSyncStatement,
  hasRefProp,
  lowerForwardedElementRefs,
  setRefsBabelTypes,
} from "./transform-litsx-refs.js";
import {
  buildClassMembers,
  createComponentClass,
  setClassGenerationBabelTypes,
} from "./transform-litsx-class-generation.js";
import {
  replaceParamReferences,
  setParamRewriteBabelTypes,
  transformJSXExpressions,
} from "./transform-litsx-param-rewrites.js";
import {
  finalizeProgram,
  setProgramBabelTypes,
} from "./transform-litsx-program.js";

let t;

function isCapitalizedComponentName(name) {
  if (typeof name !== "string" || name.length === 0) {
    return false;
  }

  const first = name[0];
  return first === first.toUpperCase() && first !== first.toLowerCase();
}

export function createTransformFunctionToClassPlugin(defaultPluginOptions = {}) {
  return function transformFunctionToClassPlugin(_api, pluginOptions = {}) {
    ensureTypescriptModule();
    t = _api.types;
    setPropertyBabelTypes(t);
    setStaticHoistsBabelTypes(t);
    setHandlersBabelTypes(t);
    setWrapperUtilsBabelTypes(t);
    setRefsBabelTypes(t);
    setClassGenerationBabelTypes(t);
    setParamRewriteBabelTypes(t);
    setProgramBabelTypes(t);
    const resolvedPluginOptions = {
      ...defaultPluginOptions,
      ...pluginOptions,
    };

    const getWrapperMetadata =
      typeof resolvedPluginOptions.getWrapperMetadata === "function"
        ? resolvedPluginOptions.getWrapperMetadata
        : null;

    return {
      name: "transform-function-to-class",
      inherits: jsxSyntaxPlugin.default || jsxSyntaxPlugin,
      pre() {
        this.__litsxTransformCount = 0;
        this.__litsxNeedsCss = false;
        this.__litsxNeedsUnsafeCss = false;
        this.__litsxNeedsStaticHoistsMixin = false;
        this.__litsxNeedsLightDomMixin = false;
        this.__litsxNeedsCallbackRef = false;
        this.__litsxNeedsRendererCallImport = false;
        this.__litsxWarnings = [];
        this.__litsxResolvedPluginOptions = resolvedPluginOptions;
        this.__litsxTypeResolver = fileLikelyNeedsTypeResolver(this)
          ? createTypeResolver(
              this.file?.opts?.filename,
              this.file?.code,
              resolvedPluginOptions
            )
          : undefined;
      },
      post() {
        if (!this.file) return;
        this.file.metadata ||= {};
        this.file.metadata.litsxWarnings = this.__litsxWarnings || [];
      },
      visitor: {
        Program: {
          exit(programPath) {
            finalizeProgram(programPath, this);
          },
        },
        ExportNamedDeclaration(exportPath) {
          handlePotentialComponentExport({
            exportPath,
            state: this,
            transformFunction,
            isInsideFunctionOrClass,
            updateTransformState,
            getWrapperMetadata,
          });
        },
        ExportDefaultDeclaration(exportPath) {
          handlePotentialComponentExport({
            exportPath,
            state: this,
            isDefault: true,
            transformFunction,
            isInsideFunctionOrClass,
            updateTransformState,
            getWrapperMetadata,
          });
        },
        VariableDeclarator(varPath) {
          if (
            varPath.findParent(
              (p) => p.isExportNamedDeclaration?.() || p.isExportDefaultDeclaration?.()
            )
          ) {
            return;
          }

          const initPath = varPath.get("init");

          if (
            maybeTransformWrappedVariableDeclarator({
              varPath,
              resolvedPluginOptions,
              state: this,
              transformFunction,
              updateTransformState,
              getWrapperMetadata,
            })
          ) {
            return;
          }

          if (
            initPath &&
            initPath.isArrowFunctionExpression() &&
            !isInsideFunctionOrClass(varPath) &&
            t.isIdentifier(varPath.node.id) &&
            isCapitalizedComponentName(varPath.node.id.name)
          ) {
            const programPath = varPath.findParent((p) => p.isProgram());
            const classNode = transformFunction(
              initPath,
              programPath,
              varPath.node.id.name,
              {
                ...resolvedPluginOptions,
                state: this,
                typeResolver: getTypeResolverForFunction(initPath, this),
                warn: (warning) => {
                  this.__litsxWarnings.push(warning);
                },
              }
            );

            if (!classNode) return;

            const declarationPath = varPath.parentPath;
            if (!declarationPath.isVariableDeclaration()) return;

            varPath.scope.removeBinding(varPath.node.id.name);
            declarationPath.replaceWith(classNode);
            declarationPath.requeue();
            updateTransformState(this, classNode);
          }
        },
        FunctionDeclaration(funcPath) {
          if (
            !funcPath.parentPath?.isExportNamedDeclaration?.() &&
            !funcPath.parentPath?.isExportDefaultDeclaration?.() &&
            !isInsideFunctionOrClass(funcPath) &&
            funcPath.node.id &&
            isCapitalizedComponentName(funcPath.node.id.name)
          ) {
            const programPath = funcPath.findParent((p) => p.isProgram());
            const classNode = transformFunction(
              funcPath,
              programPath,
              undefined,
              {
                ...resolvedPluginOptions,
                state: this,
                typeResolver: getTypeResolverForFunction(funcPath, this),
                warn: (warning) => {
                  this.__litsxWarnings.push(warning);
                },
              }
            );

            if (!classNode) return;

            if (funcPath.node.id) {
              funcPath.scope.removeBinding(funcPath.node.id.name);
            }
            funcPath.replaceWith(classNode);
            funcPath.requeue();
            updateTransformState(this, classNode);
          }
        },
      },
    };
  };
}

export default createTransformFunctionToClassPlugin();
export { isCapitalizedComponentName };

function getOrCreateModuleStaticHoistSymbol(programPath, hoistName) {
  let symbolMap = programPath.getData("__litsxStaticHoistSymbols");
  if (!symbolMap) {
    symbolMap = new Map();
    programPath.setData("__litsxStaticHoistSymbols", symbolMap);
  }

  if (symbolMap.has(hoistName)) {
    return symbolMap.get(hoistName);
  }

  const symbolId = programPath.scope.generateUidIdentifier(`litsx_static_${hoistName}`);
  const declaration = t.variableDeclaration("const", [
    t.variableDeclarator(
      symbolId,
      t.callExpression(t.identifier("Symbol"), [t.stringLiteral(`litsx.static.${hoistName}`)])
    ),
  ]);

  const entry = { symbolId, declaration };
  symbolMap.set(hoistName, entry);
  return entry;
}


function updateTransformState(state, classNode) {
  if (!state || !classNode) {
    return;
  }

  state.__litsxTransformCount = (state.__litsxTransformCount || 0) + 1;
  state.__litsxNeedsCss ||= Boolean(classNode._needsCss);
  state.__litsxNeedsUnsafeCss ||= Boolean(classNode._needsUnsafeCss);
  state.__litsxNeedsStaticHoistsMixin ||= Boolean(
    classNode._needsStaticHoistsMixin
  );
  state.__litsxNeedsLightDomMixin ||= Boolean(
    classNode._needsLightDomMixin
  );
  state.__litsxNeedsCallbackRef ||= Boolean(
    classNode._needsCallbackRef
  );
}

// Verifica si el nodo está dentro de otra función o clase
function isInsideFunctionOrClass(path) {
  return path.findParent(
    (p) => p.isFunctionDeclaration() || p.isFunctionExpression() || p.isArrowFunctionExpression() || p.isClassDeclaration()
  );
}

function getOrCreateTypeResolver(state) {
  if (state.__litsxTypeResolver !== undefined) {
    return state.__litsxTypeResolver;
  }

  state.__litsxTypeResolver = createTypeResolver(
    state.file?.opts?.filename,
    state.file?.code,
    state.__litsxResolvedPluginOptions
  );
  return state.__litsxTypeResolver;
}

function fileLikelyNeedsTypeResolver(state) {
  const filename = state?.file?.opts?.filename || "";
  if (/\.(?:[cm]?ts|tsx)$/i.test(filename)) {
    return true;
  }

  const source = state?.file?.code || "";
  return /\b(?:type|interface|enum)\b/.test(source);
}

function functionNeedsTypeResolver(functionPath, state) {
  const params = functionPath.get("params");
  if (!Array.isArray(params) || params.length === 0) {
    return false;
  }

  if (fileLikelyNeedsTypeResolver(state)) {
    return true;
  }

  return params.some((paramPath) => containsTypeResolutionSyntax(paramPath));
}

function containsTypeResolutionSyntax(path) {
  if (!path?.node) {
    return false;
  }

  if (
    path.isIdentifier?.() ||
    path.isObjectPattern?.() ||
    path.isArrayPattern?.() ||
    path.isAssignmentPattern?.()
  ) {
    if (path.node.typeAnnotation) {
      return true;
    }
  }

  if (path.isAssignmentPattern?.()) {
    return containsTypeResolutionSyntax(path.get("left"));
  }

  if (path.isObjectPattern?.()) {
    return path.get("properties").some((propertyPath) => {
      if (propertyPath.isRestElement()) {
        return containsTypeResolutionSyntax(propertyPath.get("argument"));
      }
      if (propertyPath.isObjectProperty()) {
        return containsTypeResolutionSyntax(propertyPath.get("value"));
      }
      return false;
    });
  }

  if (path.isArrayPattern?.()) {
    return path.get("elements").some((elementPath) => {
      if (!elementPath?.node) return false;
      return containsTypeResolutionSyntax(elementPath);
    });
  }

  return false;
}

function getTypeResolverForFunction(functionPath, state) {
  if (!functionNeedsTypeResolver(functionPath, state)) {
    return null;
  }

  return getOrCreateTypeResolver(state);
}

function transformFunction(functionPath, programPath, className, options = {}) {
  const { node } = functionPath;
  const elementCandidates = collectElementCandidates(functionPath, programPath, options);
  const forwardRefOptions = options.forwardRef || null;
  let resolvedName = className;
  if (!resolvedName && node && node.id && t.isIdentifier(node.id)) {
    resolvedName = node.id.name;
  }
  if (!resolvedName) {
    resolvedName = "AnonymousComponent";
  }

  className = resolvedName;

  const {
    properties: propertiesStatic,
    propertyNames,
    bindings,
    defaults,
    nestedInitializers,
  } = extractProperties(
    functionPath,
    programPath,
    options
  );

  assertStaticHoistsStayTopLevel(functionPath);
  collectNativeClassNameWarnings(functionPath, options.warn, options);

  let returnStatement;
  functionPath.traverse({
    ReturnStatement(returnPath) {
      if (t.isJSXElement(returnPath.node.argument)) {
        returnStatement = returnPath.node;
        transformJSXExpressions(returnPath, bindings, options.state ?? null);
      }
    },
  });

  if (!returnStatement) return;

  const capturedPropAliasStatements = replaceParamReferences(functionPath, bindings, propertyNames);

  const usedNames = new Set([
    ...Object.keys(functionPath.scope.bindings || {}),
    "render",
    "properties",
    "constructor",
  ]);

  const handlerInfos = processHandlers(functionPath, usedNames);

  const renderStatements = t.isBlockStatement(node.body)
    ? [...node.body.body]
    : [t.returnStatement(node.body)];

  const resolvedRefPropName = forwardRefOptions?.propName ||
    (propertyNames.has("ref") || hasRefProp(functionPath) ? "ref" : null);
  let needsCallbackRef = false;

  if (resolvedRefPropName) {
    renderStatements.unshift(
      ...lowerForwardedElementRefs(functionPath, resolvedRefPropName)
    );
    needsCallbackRef = renderStatements.some(
      (statement) =>
        t.isExpressionStatement(statement) &&
        t.isCallExpression(statement.expression) &&
        t.isIdentifier(statement.expression.callee, { name: "useCallbackRef" })
    ) || needsCallbackRef;
  }

  if (resolvedRefPropName && !forwardRefOptions) {
    renderStatements.unshift(createComponentInstanceRefSyncStatement());
    needsCallbackRef = true;
  }

  if (capturedPropAliasStatements.length > 0) {
    renderStatements.unshift(...capturedPropAliasStatements);
  }

  if (nestedInitializers.length > 0) {
    const initializerStatements = nestedInitializers.map(({ pattern, root, defaultValue }) =>
      createNestedInitializerStatement(pattern, root, defaultValue, t)
    );
    renderStatements.unshift(...initializerStatements);
  }

  const classMembers = [];

  const {
    lightDomRequested,
    hoistMembers,
    hoistSymbolDeclarations,
    needsStaticHoistsMixin,
    needsCss,
    needsUnsafeCss,
  } = processStaticHoists({
    functionPath,
    node,
    renderStatements,
    programPath,
    propertiesStatic,
    classMembers,
    options,
    getOrCreateModuleStaticHoistSymbol,
  });

  buildClassMembers({
    classMembers,
    defaults,
    renderStatements,
    handlerInfos,
    createHandlerClassMember,
  });

  const classNode = createComponentClass({
    className,
    classMembers,
    hoistMembers,
    hoistSymbolDeclarations,
    needsStaticHoistsMixin,
    lightDomRequested,
    needsCss,
    needsUnsafeCss,
    needsCallbackRef,
  });

  if (classNode && elementCandidates.size) {
    classNode._litsxElementCandidates &&= new Set(classNode._litsxElementCandidates);
    const elementSet = classNode._litsxElementCandidates ||= new Set();
    elementCandidates.forEach((candidate) => elementSet.add(candidate));
  }

  return classNode;
}

function ensureClassIdentifier(classNode, fallbackName) {
  if (classNode.id && t.isIdentifier(classNode.id)) {
    return classNode.id;
  }

  const safeName =
    typeof fallbackName === "string" && fallbackName
      ? fallbackName
      : "AnonymousComponent";
  const identifier = t.identifier(safeName);
  classNode.id = identifier;
  return identifier;
}

function createThisMemberExpression(propName) {
  return t.memberExpression(t.thisExpression(), t.identifier(propName));
}

function createNestedInitializerStatement(pattern, root, defaultValue, t) {
  const rootAccess = createThisMemberExpression(root);
  let sourceExpression = rootAccess;

  if (defaultValue) {
    sourceExpression = t.logicalExpression(
      "??",
      t.cloneNode(rootAccess),
      t.cloneNode(defaultValue)
    );
  }

  return t.variableDeclaration("const", [
    t.variableDeclarator(t.cloneNode(pattern), sourceExpression),
  ]);
}

function collectElementCandidates(functionPath, programPath, options = {}) {
  const candidates = new Set();
  if (!programPath) return candidates;
  programPath.scope.crawl();
  const compatPascalNames =
    programPath.getData("__litsxCompatPascalNames") || new Set();

  const availableNames = new Set();
  const helperPaths = new Map();
  programPath.get("body").forEach((nodePath) => {
    if (nodePath.isImportDeclaration()) {
      nodePath.node.specifiers.forEach((specifier) => {
        if (specifier.local?.name) {
          availableNames.add(specifier.local.name);
        }
      });
      return;
    }

    if (nodePath.isClassDeclaration() && nodePath.node.id?.name) {
      availableNames.add(nodePath.node.id.name);
      return;
    }

    if (
      (nodePath.isExportNamedDeclaration() || nodePath.isExportDefaultDeclaration()) &&
      nodePath.get("declaration")?.isClassDeclaration?.() &&
      nodePath.node.declaration?.id?.name
    ) {
      availableNames.add(nodePath.node.declaration.id.name);
      return;
    }

    if (nodePath.isFunctionDeclaration() && nodePath.node.id?.name) {
      availableNames.add(nodePath.node.id.name);
      helperPaths.set(nodePath.node.id.name, nodePath);
      return;
    }

    if (!nodePath.isVariableDeclaration()) return;
    nodePath.get("declarations").forEach((declaratorPath) => {
      const declarator = declaratorPath.node;
      if (!t.isIdentifier(declarator.id)) {
        return;
      }

      availableNames.add(declarator.id.name);

      const initPath = declaratorPath.get("init");
      if (
        initPath?.isArrowFunctionExpression?.() ||
        initPath?.isFunctionExpression?.()
      ) {
        helperPaths.set(declarator.id.name, initPath);
      }
    });
  });

  const helperCandidateCache = new Map();

  function isCapitalizedName(name) {
    if (typeof name !== "string" || name.length === 0) {
      return false;
    }

    const first = name[0];
    return first === first.toUpperCase() && first !== first.toLowerCase();
  }

  function toKebab(name) {
    return name.replace(/([a-z])([A-Z])/g, "$1-$2").toLowerCase();
  }

  function isProgramLevelBinding(binding) {
    return binding?.scope?.path?.isProgram?.() === true;
  }

  function maybeRewriteComponentName(nameNode, pathForErrors = null) {
    if (!nameNode || nameNode.type !== "JSXIdentifier") return null;
    const originalName = nameNode.__scopedOriginal || nameNode.name;
    if (!isCapitalizedName(originalName)) return null;
    const binding = pathForErrors?.scope?.getBinding?.(originalName) || null;
    if (!binding) {
      if (availableNames.has(originalName)) {
        return originalName;
      }
      if (compatPascalNames.has(originalName)) {
        return null;
      }
      if (options?.allowUnknownPascalCase === true) {
        return null;
      }
      throw (pathForErrors?.buildCodeFrameError?.(
        `Unknown LitSX component "${originalName}". Add an import or declare it in this module before using it in JSX.`
      ) || new Error(
        `Unknown LitSX component "${originalName}". Add an import or declare it in this module before using it in JSX.`
      ));
    }

    if (!isProgramLevelBinding(binding)) {
      return null;
    }

    return originalName;
  }

  function scanFunction(path, seen = new Set()) {
    if (!path?.node) {
      return new Set();
    }

    if (helperCandidateCache.has(path.node)) {
      return new Set(helperCandidateCache.get(path.node));
    }

    if (seen.has(path.node)) {
      return new Set();
    }

    const nextSeen = new Set(seen);
    nextSeen.add(path.node);
    const localCandidates = new Set();
    const referencedHelpers = new Set();

    path.traverse({
      JSXOpeningElement(jsxPath) {
        const candidate = maybeRewriteComponentName(jsxPath.node.name, jsxPath);
        if (candidate) {
          localCandidates.add(candidate);
        }
      },
      JSXClosingElement(jsxPath) {
        maybeRewriteComponentName(jsxPath.node.name, jsxPath);
      },
      Identifier(identifierPath) {
        if (!identifierPath.isReferencedIdentifier()) {
          return;
        }

        if (!helperPaths.has(identifierPath.node.name)) {
          return;
        }

        referencedHelpers.add(identifierPath.node.name);
      },
    });

    referencedHelpers.forEach((helperName) => {
      const helperCandidates = scanFunction(helperPaths.get(helperName), nextSeen);
      helperCandidates.forEach((candidate) => localCandidates.add(candidate));
    });

    helperCandidateCache.set(path.node, new Set(localCandidates));
    return localCandidates;
  }

  scanFunction(functionPath).forEach((candidate) => candidates.add(candidate));

  return candidates;
}
