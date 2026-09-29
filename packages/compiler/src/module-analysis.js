import * as babelTypes from "@babel/types";
import { componentNameToTagName } from "@litsx/authoring";

function isPascalCaseIdentifier(value) {
  return typeof value === "string" && /^[A-Z][A-Za-z0-9_$]*$/.test(value);
}

function isObjectExpressionLike(node) {
  return node?.type === "ObjectExpression";
}

function classifyDeclarationNode(node) {
  if (!node) {
    return "unknown";
  }

  switch (node.type) {
    case "FunctionDeclaration":
      return "function";
    case "ClassDeclaration":
      return "class";
    case "ObjectExpression":
      return "const-object";
    case "FunctionExpression":
      return "const-function";
    case "ArrowFunctionExpression":
      return "const-arrow-function";
    default:
      return "variable";
  }
}

function classifyExportNode(node) {
  if (!node) {
    return "unknown";
  }

  switch (node.type) {
    case "ObjectExpression":
      return "default-object";
    case "FunctionDeclaration":
      return "function";
    case "ClassDeclaration":
      return "class";
    case "VariableDeclaration": {
      const declarator = node.declarations?.[0];
      return isObjectExpressionLike(declarator?.init) ? "named-object" : "variable";
    }
    default:
      return "unknown";
  }
}

function classifyImportKind(node) {
  const declarationKind = node.importKind === "type" ? "type" : "value";
  let hasValue = declarationKind === "value";
  let hasType = declarationKind === "type";

  for (const specifier of node.specifiers || []) {
    const kind = specifier.importKind === "type" ? "type" : declarationKind;
    hasValue ||= kind === "value";
    hasType ||= kind === "type";
  }

  if (hasValue && hasType) {
    return "mixed";
  }

  return hasType ? "type" : "value";
}

function isLikelyAuthoredModuleSource(source) {
  return typeof source === "string" && (
    source.startsWith("./") ||
    source.startsWith("../") ||
    source.startsWith("/")
  ) && /\.(?:tsx|jsx|ts|mts|cts|mjs|cjs|js)$/.test(source);
}

function collectTopLevelDeclarations(program, declarations, declarationsByLocalName) {
  for (const statement of program.body || []) {
    const node = statement.type === "ExportNamedDeclaration"
      ? statement.declaration
      : statement.type === "ExportDefaultDeclaration"
        ? statement.declaration
        : statement;

    if (!node) {
      continue;
    }

    if (node.type === "FunctionDeclaration" || node.type === "ClassDeclaration") {
      const localName = node.id?.name;
      if (!localName) {
        continue;
      }

      const entry = {
        localName,
        kind: classifyDeclarationNode(node),
      };
      declarations.push(entry);
      declarationsByLocalName.set(localName, entry);
      continue;
    }

    if (node.type !== "VariableDeclaration") {
      continue;
    }

    for (const declarator of node.declarations || []) {
      if (declarator.id?.type !== "Identifier") {
        continue;
      }

      const entry = {
        localName: declarator.id.name,
        kind: classifyDeclarationNode(declarator.init),
      };
      declarations.push(entry);
      declarationsByLocalName.set(entry.localName, entry);
    }
  }
}

function collectImports(program, imports, importsByLocalName) {
  for (const statement of program.body || []) {
    if (statement.type !== "ImportDeclaration") {
      continue;
    }

    const entry = {
      source: statement.source?.value || "",
      kind: classifyImportKind(statement),
      specifiers: [],
    };

    for (const specifier of statement.specifiers || []) {
      let importedName = "default";
      if (specifier.type === "ImportSpecifier") {
        importedName = specifier.imported?.type === "Identifier"
          ? specifier.imported.name
          : specifier.imported?.value;
      } else if (specifier.type === "ImportNamespaceSpecifier") {
        importedName = "*";
      }

      const kind = specifier.importKind === "type"
        ? "type"
        : statement.importKind === "type"
          ? "type"
          : "value";
      const specifierEntry = {
        importedName,
        localName: specifier.local.name,
        kind,
      };

      entry.specifiers.push(specifierEntry);
      importsByLocalName.set(specifier.local.name, {
        source: entry.source,
        kind,
      });
    }

    imports.push(entry);
  }
}

function collectExports(program, exports, declarationsByLocalName) {
  for (const statement of program.body || []) {
    if (statement.type === "ExportDefaultDeclaration") {
      const declaration = statement.declaration;
      if (declaration?.type === "Identifier") {
        const resolved = declarationsByLocalName.get(declaration.name);
        exports.push({
          exportName: "default",
          localName: declaration.name,
          kind: resolved?.kind === "const-object" ? "default-object" : resolved?.kind || "unknown",
        });
        continue;
      }

      exports.push({
        exportName: "default",
        localName: declaration?.id?.name ?? null,
        kind: classifyExportNode(declaration),
      });
      continue;
    }

    if (statement.type !== "ExportNamedDeclaration") {
      continue;
    }

    if (statement.declaration) {
      const declaration = statement.declaration;

      if (declaration.type === "FunctionDeclaration" || declaration.type === "ClassDeclaration") {
        exports.push({
          exportName: declaration.id?.name ?? null,
          localName: declaration.id?.name ?? null,
          kind: classifyExportNode(declaration),
        });
        continue;
      }

      if (declaration.type === "VariableDeclaration") {
        for (const declarator of declaration.declarations || []) {
          if (declarator.id?.type !== "Identifier") {
            continue;
          }

          exports.push({
            exportName: declarator.id.name,
            localName: declarator.id.name,
            kind: isObjectExpressionLike(declarator.init) ? "named-object" : "variable",
          });
        }
      }

      continue;
    }

    for (const specifier of statement.specifiers || []) {
      const localName = specifier.local?.name ?? null;
      exports.push({
        exportName: specifier.exported?.name ?? specifier.exported?.value ?? localName,
        localName,
        kind: statement.source
          ? "re-export"
          : (localName && declarationsByLocalName.get(localName)?.kind === "const-object")
            ? "named-object"
            : (localName && declarationsByLocalName.get(localName)?.kind) || "unknown",
      });
    }
  }
}

function visitNode(node, visitor) {
  if (!node || typeof node !== "object") {
    return;
  }

  visitor(node);

  const visitorKeys = babelTypes.VISITOR_KEYS?.[node.type];
  if (!visitorKeys) {
    return;
  }

  for (const key of visitorKeys) {
    const value = node[key];
    if (Array.isArray(value)) {
      for (const child of value) {
        visitNode(child, visitor);
      }
      continue;
    }

    visitNode(value, visitor);
  }
}

function collectJsxReferences(program, jsxReferences, importsByLocalName, declarationsByLocalName) {
  const seen = new Set();

  visitNode(program, (node) => {
    if (node.type !== "JSXOpeningElement") {
      return;
    }

    const nameNode = node.name;
    if (nameNode?.type !== "JSXIdentifier" || !isPascalCaseIdentifier(nameNode.name)) {
      return;
    }

    const localName = nameNode.name;
    if (seen.has(localName)) {
      return;
    }
    seen.add(localName);

    const imported = importsByLocalName.get(localName);
    let source = "unknown";
    let importSource = null;

    if (imported) {
      importSource = imported.source;
      source = isLikelyAuthoredModuleSource(imported.source)
        ? "imported-authored-module"
        : "imported-js-module";
    } else if (declarationsByLocalName.has(localName)) {
      source = "local-declaration";
    }

    jsxReferences.push({
      localName,
      tagName: componentNameToTagName(localName),
      source,
      importSource,
    });
  });
}

export function analyzeLitsxModule(ast) {
  const program = ast?.program ?? ast;
  const imports = [];
  const exports = [];
  const declarations = [];
  const jsxReferences = [];
  const importsByLocalName = new Map();
  const declarationsByLocalName = new Map();

  if (!program || program.type !== "Program") {
    return {
      imports,
      exports,
      declarations,
      jsxReferences,
    };
  }

  collectImports(program, imports, importsByLocalName);
  collectTopLevelDeclarations(program, declarations, declarationsByLocalName);
  collectExports(program, exports, declarationsByLocalName);
  collectJsxReferences(program, jsxReferences, importsByLocalName, declarationsByLocalName);

  return {
    imports,
    exports,
    declarations,
    jsxReferences,
  };
}
