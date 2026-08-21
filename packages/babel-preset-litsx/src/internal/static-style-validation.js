import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { parse } from "@babel/parser";

const EXTENSIONS = ["", ".tsx", ".ts", ".jsx", ".mjs", ".js", ".cjs"];

function resolveFile(importer, source) {
  if (!source.startsWith(".") && !path.isAbsolute(source)) {
    try {
      const resolved = createRequire(importer).resolve(source);
      return path.isAbsolute(resolved) ? resolved : null;
    } catch {
      return null;
    }
  }
  const base = path.resolve(path.dirname(importer), source);
  for (const extension of EXTENSIONS) {
    const candidate = `${base}${extension}`;
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile())
      return candidate;
  }
  for (const extension of EXTENSIONS.slice(1)) {
    const candidate = path.join(base, `index${extension}`);
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile())
      return candidate;
  }
  return null;
}

function unwrap(node) {
  while (
    node &&
    [
      "TSAsExpression",
      "TSSatisfiesExpression",
      "TSNonNullExpression",
      "TypeCastExpression",
      "ParenthesizedExpression",
    ].includes(node.type)
  )
    node = node.expression;
  return node;
}

function moduleRecord(file) {
  const ast = parse(fs.readFileSync(file, "utf8"), {
    sourceType: "module",
    sourceFilename: file,
    plugins: ["jsx", "typescript", "importAttributes", "decorators-legacy"],
  });
  const variables = new Map();
  const imports = new Map();
  const exports = new Map();
  const exportAll = [];

  function addVariables(declaration, exported = false) {
    if (declaration?.type !== "VariableDeclaration") return;
    for (const item of declaration.declarations) {
      if (item.id.type !== "Identifier" || !item.init) continue;
      variables.set(item.id.name, item.init);
      if (exported) exports.set(item.id.name, { local: item.id.name });
    }
  }

  for (const statement of ast.program.body) {
    addVariables(statement);
    if (statement.type === "ImportDeclaration") {
      for (const specifier of statement.specifiers) {
        if (specifier.type === "ImportSpecifier") {
          imports.set(specifier.local.name, {
            source: statement.source.value,
            imported: specifier.imported.name ?? specifier.imported.value,
          });
        } else if (specifier.type === "ImportDefaultSpecifier") {
          imports.set(specifier.local.name, {
            source: statement.source.value,
            imported: "default",
          });
        }
      }
    } else if (statement.type === "ExportNamedDeclaration") {
      addVariables(statement.declaration, true);
      for (const specifier of statement.specifiers) {
        const exported = specifier.exported.name ?? specifier.exported.value;
        const local = specifier.local.name ?? specifier.local.value;
        exports.set(
          exported,
          statement.source
            ? { source: statement.source.value, imported: local }
            : { local },
        );
      }
    } else if (statement.type === "ExportAllDeclaration") {
      exportAll.push(statement.source.value);
    } else if (statement.type === "ExportDefaultDeclaration") {
      exports.set(
        "default",
        statement.declaration.type === "Identifier"
          ? { local: statement.declaration.name }
          : { node: statement.declaration },
      );
    }
  }

  return { file, variables, imports, exports, exportAll };
}

/**
 * Build a conservative, generic classifier for imported Component.styles
 * values. It only answers true when local source proves that a non-CSS plain
 * value can reach runtime; unknown packages and expressions remain untouched.
 */
export function createImportedStaticStyleClassifier(filename) {
  const records = new Map();
  const active = new Set();

  function record(file) {
    let value = records.get(file);
    if (!value) {
      value = moduleRecord(file);
      records.set(file, value);
    }
    return value;
  }

  function classifyNode(node, owner) {
    node = unwrap(node);
    if (!node) return false;
    if (
      ["StringLiteral", "TemplateLiteral", "ObjectExpression"].includes(
        node.type,
      )
    )
      return true;
    if (node.type === "ArrayExpression") {
      return node.elements.some(
        (element) =>
          element &&
          classifyNode(
            element.type === "SpreadElement" ? element.argument : element,
            owner,
          ),
      );
    }
    if (node.type === "ConditionalExpression") {
      return (
        classifyNode(node.consequent, owner) ||
        classifyNode(node.alternate, owner)
      );
    }
    if (node.type === "LogicalExpression") {
      return classifyNode(node.left, owner) || classifyNode(node.right, owner);
    }
    if (node.type === "Identifier") return classifyLocal(owner, node.name);
    return false;
  }

  function classifyLocal(owner, name) {
    const key = `${owner.file}#local:${name}`;
    if (active.has(key)) return false;
    active.add(key);
    try {
      const value = owner.variables.get(name);
      if (value) return classifyNode(value, owner);
      const imported = owner.imports.get(name);
      if (!imported) return false;
      const target = resolveFile(owner.file, imported.source);
      return target ? classifyExport(target, imported.imported) : false;
    } finally {
      active.delete(key);
    }
  }

  function classifyExport(file, name) {
    const key = `${file}#export:${name}`;
    if (active.has(key)) return false;
    active.add(key);
    try {
      const owner = record(file);
      const entry = owner.exports.get(name);
      if (entry?.node) return classifyNode(entry.node, owner);
      if (entry?.local) return classifyLocal(owner, entry.local);
      if (entry?.source) {
        const target = resolveFile(file, entry.source);
        return target ? classifyExport(target, entry.imported) : false;
      }
      for (const source of owner.exportAll) {
        const target = resolveFile(file, source);
        if (target && classifyExport(target, name)) return true;
      }
      return false;
    } finally {
      active.delete(key);
    }
  }

  return (bindingPath) => {
    if (
      !filename ||
      (!bindingPath?.isImportSpecifier?.() &&
        !bindingPath?.isImportDefaultSpecifier?.())
    )
      return false;
    const declaration = bindingPath.parentPath;
    const source = declaration?.node?.source?.value;
    if (typeof source !== "string") return false;
    const target = resolveFile(filename, source);
    if (!target) return false;
    const imported = bindingPath.isImportDefaultSpecifier()
      ? "default"
      : (bindingPath.node.imported.name ?? bindingPath.node.imported.value);
    return classifyExport(target, imported);
  };
}
