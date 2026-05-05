import helperPluginUtils from "@babel/helper-plugin-utils";
import jsxSyntaxPlugin from "@babel/plugin-syntax-jsx";

const { declare } = helperPluginUtils;

let t;

export function setElementCandidatesBabelTypes(nextTypes) {
  t = nextTypes;
}

function isInsideFunctionOrClass(path) {
  return path.findParent(
    (p) =>
      p.isFunctionDeclaration() ||
      p.isFunctionExpression() ||
      p.isArrowFunctionExpression() ||
      p.isClassDeclaration()
  );
}

function getOrCreateAvailableNames(programPath) {
  const cached = programPath.getData("__litsxAvailableNames");
  if (cached) {
    return cached;
  }

  const availableNames = new Set();
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
      return;
    }

    if (!nodePath.isVariableDeclaration()) return;
    nodePath.get("declarations").forEach((declaratorPath) => {
      const declarator = declaratorPath.node;
      if (t.isIdentifier(declarator.id)) {
        availableNames.add(declarator.id.name);
      }
    });
  });

  programPath.setData("__litsxAvailableNames", availableNames);
  return availableNames;
}

function getOrCreateHelperPaths(programPath) {
  const cached = programPath.getData("__litsxHelperPaths");
  if (cached) {
    return cached;
  }

  const helperPaths = new Map();
  programPath.get("body").forEach((nodePath) => {
    if (nodePath.isFunctionDeclaration() && nodePath.node.id?.name) {
      helperPaths.set(nodePath.node.id.name, nodePath);
      return;
    }

    if (!nodePath.isVariableDeclaration()) return;
    nodePath.get("declarations").forEach((declaratorPath) => {
      const declarator = declaratorPath.node;
      if (!t.isIdentifier(declarator.id)) {
        return;
      }

      const initPath = declaratorPath.get("init");
      if (
        initPath?.isArrowFunctionExpression?.() ||
        initPath?.isFunctionExpression?.()
      ) {
        helperPaths.set(declarator.id.name, initPath);
      }
    });
  });

  programPath.setData("__litsxHelperPaths", helperPaths);
  return helperPaths;
}

function isCapitalizedName(name) {
  if (typeof name !== "string" || name.length === 0) {
    return false;
  }

  const first = name[0];
  return first === first.toUpperCase() && first !== first.toLowerCase();
}

function isProgramLevelBinding(binding) {
  return binding?.scope?.path?.isProgram?.() === true;
}

function validateComponentName(nameNode, pathForErrors, context) {
  if (!nameNode || nameNode.type !== "JSXIdentifier") return null;
  const originalName = nameNode.__scopedOriginal || nameNode.name;
  if (!isCapitalizedName(originalName)) return null;

  const binding = pathForErrors?.scope?.getBinding?.(originalName) || null;
  if (!binding) {
    if (context.availableNames.has(originalName)) {
      return originalName;
    }
    if (context.compatPascalNames.has(originalName)) {
      return null;
    }
    if (context.options?.allowUnknownPascalCase === true) {
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

function collectCandidates(functionPath, programPath, options = {}) {
  const candidates = new Set();
  if (!programPath || !functionPath?.node) return candidates;
  programPath.scope.crawl();

  const helperCandidateCache =
    programPath.getData("__litsxHelperCandidateCache") || new Map();
  programPath.setData("__litsxHelperCandidateCache", helperCandidateCache);
  const availableNames = getOrCreateAvailableNames(programPath);
  const helperPaths = getOrCreateHelperPaths(programPath);
  const compatPascalNames =
    programPath.getData("__litsxCompatPascalNames") || new Set();
  const context = {
    availableNames,
    helperPaths,
    compatPascalNames,
    options,
    helperCandidateCache,
  };

  function scanFunction(path, seen = new Set()) {
    if (!path?.node) {
      return new Set();
    }

    if (context.helperCandidateCache.has(path.node)) {
      return new Set(context.helperCandidateCache.get(path.node));
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
        const candidate = validateComponentName(jsxPath.node.name, jsxPath, context);
        if (candidate) {
          localCandidates.add(candidate);
        }
      },
      JSXClosingElement(jsxPath) {
        validateComponentName(jsxPath.node.name, jsxPath, context);
      },
      Identifier(identifierPath) {
        if (!identifierPath.isReferencedIdentifier()) {
          return;
        }

        if (!context.helperPaths.has(identifierPath.node.name)) {
          return;
        }

        referencedHelpers.add(identifierPath.node.name);
      },
    });

    referencedHelpers.forEach((helperName) => {
      const helperCandidates = scanFunction(context.helperPaths.get(helperName), nextSeen);
      helperCandidates.forEach((candidate) => localCandidates.add(candidate));
    });

    context.helperCandidateCache.set(path.node, new Set(localCandidates));
    return localCandidates;
  }

  scanFunction(functionPath).forEach((candidate) => candidates.add(candidate));
  return candidates;
}

export function getAnnotatedElementCandidates(path, programPath, options = {}) {
  if (path?.node?._litsxElementCandidates instanceof Set) {
    return new Set(path.node._litsxElementCandidates);
  }

  return collectCandidates(path, programPath, options);
}

export default declare((api) => {
  api.assertVersion(7);
  t = api.types;

  return {
    name: "transform-litsx-element-candidates",
    inherits: jsxSyntaxPlugin.default || jsxSyntaxPlugin,
    visitor: {
      Program: {
        enter(path) {
          path.scope.crawl();
          path.setData("__litsxAvailableNames", null);
          path.setData("__litsxHelperPaths", null);
          path.setData("__litsxHelperCandidateCache", new Map());
        },
      },
      FunctionDeclaration: {
        exit(path, state) {
          if (isInsideFunctionOrClass(path)) {
            return;
          }

          const programPath = path.findParent((entry) => entry.isProgram());
          path.node._litsxElementCandidates = collectCandidates(
            path,
            programPath,
            state.opts || {}
          );
        },
      },
      ArrowFunctionExpression: {
        exit(path, state) {
          if (isInsideFunctionOrClass(path)) {
            return;
          }

          const programPath = path.findParent((entry) => entry.isProgram());
          path.node._litsxElementCandidates = collectCandidates(
            path,
            programPath,
            state.opts || {}
          );
        },
      },
      FunctionExpression: {
        exit(path, state) {
          if (isInsideFunctionOrClass(path)) {
            return;
          }

          const programPath = path.findParent((entry) => entry.isProgram());
          path.node._litsxElementCandidates = collectCandidates(
            path,
            programPath,
            state.opts || {}
          );
        },
      },
    },
  };
});
