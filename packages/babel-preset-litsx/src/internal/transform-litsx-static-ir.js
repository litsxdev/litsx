let t;

export function setStaticIrBabelTypes(nextTypes) {
  t = nextTypes;
}

export function createEmptyStaticIr() {
  return {
    properties: {
      inferred: [],
      authored: [],
      legacy: [],
    },
    elements: {
      localCandidates: [],
      importedCandidates: [],
      needsRegistry: false,
    },
    lightDom: false,
  };
}

function cloneImportedCandidate(candidate) {
  if (!candidate || typeof candidate !== "object") {
    return candidate;
  }

  return {
    ...candidate,
  };
}

export function normalizeStaticIr(ir = null) {
  const next = createEmptyStaticIr();
  if (!ir) {
    return next;
  }

  next.properties.inferred = (ir.properties?.inferred || []).map((entry) => ({
    ...entry,
    expression: entry.expression ? t.cloneNode(entry.expression) : null,
  }));
  next.properties.authored = (ir.properties?.authored || []).map((entry) => ({
    ...entry,
    expression: entry.expression ? t.cloneNode(entry.expression) : null,
  }));
  next.properties.legacy = (ir.properties?.legacy || []).map((entry) => ({
    ...entry,
    expression: entry.expression ? t.cloneNode(entry.expression) : null,
  }));
  next.elements.localCandidates = [...(ir.elements?.localCandidates || [])];
  next.elements.importedCandidates = (ir.elements?.importedCandidates || [])
    .map(cloneImportedCandidate);
  next.elements.needsRegistry = Boolean(ir.elements?.needsRegistry);
  next.lightDom = Boolean(ir.lightDom);
  return next;
}

export function ensureStaticIr(node) {
  if (!node) {
    return createEmptyStaticIr();
  }

  node._litsxStaticIr = normalizeStaticIr(node._litsxStaticIr);
  return node._litsxStaticIr;
}

function isStaticPropertiesCall(statement) {
  if (!t.isExpressionStatement(statement)) return null;
  if (!t.isCallExpression(statement.expression)) return null;
  if (statement.expression.arguments.length !== 1) return null;

  const callee = statement.expression.callee;
  if (t.isIdentifier(callee, { name: "__litsx_static_properties" })) {
    return "authored";
  }
  if (t.isIdentifier(callee, { name: "staticProps" })) {
    return "legacy";
  }
  return null;
}

function isStaticLightDomCall(statement) {
  if (!t.isExpressionStatement(statement)) return false;
  if (!t.isCallExpression(statement.expression)) return false;
  if (!t.isIdentifier(statement.expression.callee, { name: "__litsx_static_lightDom" })) {
    return false;
  }

  const args = statement.expression.arguments;
  return args.length === 0 || (
    args.length === 1 &&
    t.isBooleanLiteral(args[0], { value: true })
  );
}

export function collectStaticIr({
  functionPath,
  elementCandidates = new Set(),
  importedElementCandidates = [],
} = {}) {
  const ir = createEmptyStaticIr();

  if (elementCandidates instanceof Set) {
    ir.elements.localCandidates = [...elementCandidates];
  } else if (Array.isArray(elementCandidates)) {
    ir.elements.localCandidates = [...elementCandidates];
  }

  ir.elements.importedCandidates = importedElementCandidates.map(cloneImportedCandidate);

  const statements = functionPath?.node?.body?.body;
  if (!Array.isArray(statements)) {
    return ir;
  }

  statements.forEach((statement, index) => {
    const propertiesKind = isStaticPropertiesCall(statement);
    if (propertiesKind) {
      const [expression] = statement.expression.arguments;
      ir.properties[propertiesKind].push({
        index,
        expression: t.cloneNode(expression),
      });
      return;
    }

    if (isStaticLightDomCall(statement)) {
      ir.lightDom = true;
    }
  });

  return ir;
}

export function setStaticIrInferredProperties(ir, properties = []) {
  if (!ir) {
    return ir;
  }

  ir.properties ||= {
    inferred: [],
    authored: [],
    legacy: [],
  };
  ir.properties.inferred = properties.map((expression, index) => ({
    index,
    expression: t.cloneNode(expression),
  }));
  return ir;
}

export function attachStaticIr(node, ir) {
  if (!node) {
    return null;
  }

  node._litsxStaticIr = normalizeStaticIr(ir);
  return node._litsxStaticIr;
}

export function getStaticIr(node) {
  if (!node?._litsxStaticIr) {
    return null;
  }

  return normalizeStaticIr(node._litsxStaticIr);
}

export function consumeStaticIr(node) {
  const ir = getStaticIr(node);
  if (node) {
    delete node._litsxStaticIr;
  }
  return ir;
}
