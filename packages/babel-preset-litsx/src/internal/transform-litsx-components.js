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
        this.__litsxWarnings = [];
        this.__litsxResolvedPluginOptions = resolvedPluginOptions;
        this.__litsxTypeResolver = createTypeResolver(
          this.file?.opts?.filename,
          this.file?.code,
          resolvedPluginOptions
        );
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

          if (initPath && initPath.isArrowFunctionExpression() && !isInsideFunctionOrClass(varPath)) {
            const programPath = varPath.findParent((p) => p.isProgram());
            const elementCandidates = collectElementCandidates(initPath, programPath);
            const classNode = transformFunction(
              initPath,
              programPath,
              varPath.node.id.name,
              {
                ...resolvedPluginOptions,
                typeResolver: this.__litsxTypeResolver,
                warn: (warning) => {
                  this.__litsxWarnings.push(warning);
                },
              }
            );

            if (!classNode) return;

            if (elementCandidates.size) {
              classNode._litsxElementCandidates &&= new Set(classNode._litsxElementCandidates);
              const elementSet = classNode._litsxElementCandidates ||= new Set();
              elementCandidates.forEach((candidate) => elementSet.add(candidate));
            }

            const declarationPath = varPath.parentPath;
            if (!declarationPath.isVariableDeclaration()) return;

            varPath.scope.removeBinding(varPath.node.id.name);
            declarationPath.replaceWith(classNode);
            declarationPath.requeue();
            updateTransformState(this, classNode);
          }
        },
        FunctionDeclaration(funcPath) {
          if (!isInsideFunctionOrClass(funcPath)) {
            const programPath = funcPath.findParent((p) => p.isProgram());
            const elementCandidates = collectElementCandidates(funcPath, programPath);
            const classNode = transformFunction(
              funcPath,
              programPath,
              undefined,
              {
                ...resolvedPluginOptions,
                typeResolver: this.__litsxTypeResolver,
                warn: (warning) => {
                  this.__litsxWarnings.push(warning);
                },
              }
            );

            if (!classNode) return;

            if (funcPath.node.id) {
              funcPath.scope.removeBinding(funcPath.node.id.name);
            }
            if (elementCandidates.size) {
              classNode._litsxElementCandidates &&= new Set(classNode._litsxElementCandidates);
              const elementSet = classNode._litsxElementCandidates ||= new Set();
              elementCandidates.forEach((candidate) => elementSet.add(candidate));
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

function transformFunction(functionPath, programPath, className, options = {}) {
  const { node } = functionPath;
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
        transformJSXExpressions(returnPath, bindings);
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

  return createComponentClass({
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

function collectElementCandidates(functionPath, programPath) {
  const candidates = new Set();
  if (!programPath) return candidates;

  const importNames = new Set();
  programPath.get("body").forEach((nodePath) => {
    if (!nodePath.isImportDeclaration()) return;
    nodePath.node.specifiers.forEach((specifier) => {
      if (specifier.local) {
        importNames.add(specifier.local.name);
      }
    });
  });

  functionPath.traverse({
    JSXOpeningElement(path) {
      if (!path.node.name || path.node.name.type !== "JSXIdentifier") return;
      const originalName = path.node.name.name;
      if (!importNames.has(originalName)) return;

      path.node.__scopedOriginal = originalName;
      candidates.add(originalName);
    },
    JSXClosingElement(path) {
      if (!path.node.name || path.node.name.type !== "JSXIdentifier") return;
      const originalName = path.node.name.name;
      if (!importNames.has(originalName)) return;
      path.node.__scopedOriginal = originalName;
    },
  });

  return candidates;
}
