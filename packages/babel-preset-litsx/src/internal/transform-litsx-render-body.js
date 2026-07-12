import { collectImplicitChildrenProjectionIssues } from "@litsx/authoring";
import {
  createComponentInstanceRefSyncStatement,
  hasRefProp,
  hasExplicitRefForwarding,
  lowerForwardedElementRefs,
} from "./transform-litsx-refs.js";
import {
  replaceParamReferences,
  transformJSXExpressions,
} from "./transform-litsx-param-rewrites.js";
import { transformJSXRendererCalls } from "./transform-litsx-renderer-calls.js";

let t;

export function setRenderBodyBabelTypes(nextTypes) {
  t = nextTypes;
}

function createThisMemberExpression(propName) {
  return t.memberExpression(t.thisExpression(), t.identifier(propName));
}

function createNestedInitializerStatement(pattern, root, defaultValue) {
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

function throwFirstImplicitChildrenProjectionIssue(functionPath) {
  const [issue] = collectImplicitChildrenProjectionIssues(functionPath.node);
  if (!issue) {
    return;
  }

  let issuePath = null;
  functionPath.traverse({
    enter(path) {
      if (path.node === issue.node) {
        issuePath = path;
        path.stop();
      }
    },
  });

  if (issuePath) {
    throw issuePath.buildCodeFrameError(issue.message);
  }

  throw functionPath.buildCodeFrameError(issue.message);
}

function isRenderableJsx(node) {
  return t.isJSXElement(node) || t.isJSXFragment(node);
}

function collectReturnStatement(functionPath, bindings, state) {
  let returnStatement = null;

  functionPath.traverse({
    ReturnStatement(returnPath) {
      if (returnPath.getFunctionParent() !== functionPath) {
        return;
      }

      if (isRenderableJsx(returnPath.node.argument)) {
        returnStatement = returnPath.node;
        transformJSXRendererCalls(returnPath, bindings, state);
        transformJSXExpressions(returnPath, bindings, state);
      }
    },
  });

  return returnStatement;
}

export function prepareComponentRender(functionPath, node, propertyNames, bindings, nestedInitializers, options = {}) {
  throwFirstImplicitChildrenProjectionIssue(functionPath);

  const returnStatement = collectReturnStatement(
    functionPath,
    bindings,
    options.state ?? null
  );

  if (!returnStatement) {
    return null;
  }

  const capturedPropAliasStatements = replaceParamReferences(
    functionPath,
    bindings,
    propertyNames,
    options.state ?? null
  );
  const prefixStatements = [];

  const forwardRefOptions = options.forwardRef || null;
  const resolvedRefPropName =
    forwardRefOptions?.propName ||
    "ref";
  let needsCallbackRef = false;
  const hasExplicitForwarding = resolvedRefPropName
    ? hasExplicitRefForwarding(functionPath, resolvedRefPropName)
    : false;
  const forwardedElementRefStatements = resolvedRefPropName
    ? lowerForwardedElementRefs(functionPath, resolvedRefPropName)
    : [];

  if (forwardedElementRefStatements.length > 0) {
    prefixStatements.push(...forwardedElementRefStatements);
    needsCallbackRef =
      prefixStatements.some(
        (statement) =>
          t.isExpressionStatement(statement) &&
          t.isCallExpression(statement.expression) &&
          t.isIdentifier(statement.expression.callee, { name: "useCallbackRef" })
      ) || needsCallbackRef;
  }

  if (resolvedRefPropName && !forwardRefOptions && !hasExplicitForwarding) {
    prefixStatements.push(createComponentInstanceRefSyncStatement());
    needsCallbackRef = true;
  }

  if (capturedPropAliasStatements.length > 0) {
    prefixStatements.push(...capturedPropAliasStatements);
  }

  if (nestedInitializers.length > 0) {
    const initializerStatements = nestedInitializers.map(({ pattern, root, defaultValue }) =>
      createNestedInitializerStatement(pattern, root, defaultValue)
    );
    prefixStatements.push(...initializerStatements);
  }

  return {
    needsCallbackRef,
    prefixStatements,
    returnStatement,
  };
}
