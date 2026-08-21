import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { parse } from "@babel/parser";

const SOURCE_EXTENSIONS = ["", ".tsx", ".ts", ".jsx", ".mjs", ".js", ".cjs"];

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
  ) {
    node = node.expression;
  }
  return node;
}

function resolveSourceFile(importer, source) {
  if (!source.startsWith(".") && !path.isAbsolute(source)) {
    try {
      const resolved = createRequire(importer).resolve(source);
      return path.isAbsolute(resolved) ? resolved : null;
    } catch {
      return null;
    }
  }
  const base = path.resolve(path.dirname(importer), source);
  for (const extension of SOURCE_EXTENSIONS) {
    const candidate = `${base}${extension}`;
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile())
      return candidate;
  }
  for (const extension of SOURCE_EXTENSIONS.slice(1)) {
    const candidate = path.join(base, `index${extension}`);
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile())
      return candidate;
  }
  return null;
}

function parseModule(source, filename) {
  return parse(source, {
    sourceType: "module",
    sourceFilename: filename,
    plugins: ["jsx", "typescript", "importAttributes", "decorators-legacy"],
  });
}

function declarationEntries(declaration) {
  if (declaration?.type !== "VariableDeclaration") return [];
  return declaration.declarations
    .filter((item) => item.id.type === "Identifier" && item.init)
    .map((item) => [item.id.name, item.init]);
}

function createModuleRecord(ast, filename) {
  const variables = new Map();
  const imports = new Map();
  const exports = new Map();
  const exportAll = [];

  for (const statement of ast.program.body) {
    for (const [name, value] of declarationEntries(statement))
      variables.set(name, value);

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
      continue;
    }

    if (statement.type === "ExportNamedDeclaration") {
      for (const [name, value] of declarationEntries(statement.declaration)) {
        variables.set(name, value);
        exports.set(name, { local: name });
      }
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
      continue;
    }

    if (statement.type === "ExportDefaultDeclaration") {
      if (statement.declaration.type === "Identifier") {
        exports.set("default", { local: statement.declaration.name });
      } else {
        exports.set("default", { node: statement.declaration });
      }
      continue;
    }

    if (statement.type === "ExportAllDeclaration") {
      exportAll.push(statement.source.value);
    }
  }

  return { ast, filename, variables, imports, exports, exportAll };
}

function runtimeStyleExpression(node) {
  node = unwrap(node);
  if (!node) return false;
  if (node.type === "TaggedTemplateExpression") return true;
  if (
    node.type === "NewExpression" &&
    node.callee.type === "Identifier" &&
    node.callee.name === "CSSStyleSheet"
  )
    return true;
  if (node.type === "CallExpression") {
    const callee = unwrap(node.callee);
    return (
      callee?.type === "Identifier" &&
      ["css", "unsafeCSS"].includes(callee.name)
    );
  }
  return false;
}

function cartesian(parts) {
  let values = [""];
  for (const choices of parts) {
    const next = [];
    for (const prefix of values) {
      for (const choice of choices) next.push(prefix + choice);
    }
    values = next;
    if (values.length > 4096) {
      throw new Error("static expression expands to more than 4096 values");
    }
  }
  return values;
}

function objectKey(property) {
  if (!property.computed && property.key.type === "Identifier")
    return property.key.name;
  if (["StringLiteral", "NumericLiteral"].includes(property.key.type))
    return String(property.key.value);
  return null;
}

function evaluateNode(node, context) {
  node = unwrap(node);
  if (!node) throw new Error("missing initializer");

  if (node.type === "StringLiteral") return [node.value];
  if (node.type === "TemplateLiteral") {
    const parts = [];
    for (let index = 0; index < node.quasis.length; index += 1) {
      parts.push([
        node.quasis[index].value.cooked ?? node.quasis[index].value.raw,
      ]);
      if (index < node.expressions.length) {
        const expression = evaluateNode(node.expressions[index], context);
        if (!expression.every((value) => typeof value === "string")) {
          throw new Error(
            "template interpolation is not a finite set of strings",
          );
        }
        parts.push(expression);
      }
    }
    return cartesian(parts);
  }
  if (node.type === "Identifier") return context.resolveLocal(node.name);
  if (node.type === "ConditionalExpression") {
    return [
      ...evaluateNode(node.consequent, context),
      ...evaluateNode(node.alternate, context),
    ];
  }
  if (node.type === "LogicalExpression") {
    return [
      ...evaluateNode(node.left, context),
      ...evaluateNode(node.right, context),
    ];
  }
  if (node.type === "BinaryExpression" && node.operator === "+") {
    const left = evaluateNode(node.left, context);
    const right = evaluateNode(node.right, context);
    if (
      !left.every((value) => typeof value === "string") ||
      !right.every((value) => typeof value === "string")
    ) {
      throw new Error("string composition contains a non-string value");
    }
    return cartesian([left, right]);
  }
  if (node.type === "ArrayExpression") {
    const values = [];
    for (const element of node.elements) {
      if (!element) continue;
      if (element.type === "SpreadElement")
        values.push(...evaluateNode(element.argument, context));
      else values.push(...evaluateNode(element, context));
    }
    return [{ kind: "array", values }];
  }
  if (node.type === "ObjectExpression") {
    const entries = new Map();
    for (const property of node.properties) {
      if (property.type === "SpreadElement") {
        for (const value of evaluateNode(property.argument, context)) {
          if (value?.kind !== "object")
            throw new Error("object spread is not statically resolvable");
          for (const [key, entriesValue] of value.entries)
            entries.set(key, entriesValue);
        }
        continue;
      }
      if (property.type !== "ObjectProperty")
        throw new Error("methods are not supported in style guards");
      const key = objectKey(property);
      if (key === null)
        throw new Error("computed object key is not statically resolvable");
      entries.set(key, evaluateNode(property.value, context));
    }
    return [{ kind: "object", entries }];
  }
  if (
    node.type === "MemberExpression" ||
    node.type === "OptionalMemberExpression"
  ) {
    const objects = evaluateNode(node.object, context);
    const staticKey = node.computed
      ? unwrap(node.property).type === "StringLiteral" ||
        unwrap(node.property).type === "NumericLiteral"
        ? String(unwrap(node.property).value)
        : null
      : node.property.name;
    const values = [];
    for (const object of objects) {
      if (object?.kind !== "object")
        throw new Error("member access target is not a finite object map");
      if (staticKey !== null) {
        const selected = object.entries.get(staticKey);
        if (selected) values.push(...selected);
      } else {
        for (const selected of object.entries.values())
          values.push(...selected);
      }
    }
    return values;
  }

  throw new Error(`unsupported ${node.type} expression`);
}

function collectStrings(values, output = new Set()) {
  for (const value of values) {
    if (typeof value === "string") {
      for (const candidate of value.split(/\s+/u))
        if (candidate) output.add(candidate);
    } else if (value?.kind === "array") {
      collectStrings(value.values, output);
    } else if (value?.kind === "object") {
      for (const nested of value.entries.values())
        collectStrings(nested, output);
    }
  }
  return output;
}

export function createStaticGuardResolver({ source, filename, ast = null }) {
  const records = new Map();
  const resolving = new Set();
  const dependencies = new Set();
  records.set(
    filename,
    createModuleRecord(ast ?? parseModule(source, filename), filename),
  );

  function getRecord(file) {
    let record = records.get(file);
    if (!record) {
      dependencies.add(file);
      record = createModuleRecord(
        parseModule(fs.readFileSync(file, "utf8"), file),
        file,
      );
      records.set(file, record);
    }
    return record;
  }

  function evaluateLocal(record, name) {
    const key = `${record.filename}#local:${name}`;
    if (resolving.has(key))
      throw new Error(`cyclic static dependency at ${name}`);
    resolving.add(key);
    try {
      if (record.variables.has(name)) {
        const node = record.variables.get(name);
        if (runtimeStyleExpression(node)) return { kind: "runtime" };
        return {
          kind: "static",
          values: evaluateNode(node, {
            resolveLocal(localName) {
              const result = evaluateLocal(record, localName);
              if (result.kind !== "static")
                throw new Error(`${localName} is a runtime style`);
              return result.values;
            },
          }),
        };
      }
      const imported = record.imports.get(name);
      if (imported) {
        const target = resolveSourceFile(record.filename, imported.source);
        if (!target) return { kind: "external" };
        return evaluateExport(target, imported.imported);
      }
      throw new Error(`cannot resolve local binding ${name}`);
    } finally {
      resolving.delete(key);
    }
  }

  function evaluateExport(file, exportedName) {
    const key = `${file}#export:${exportedName}`;
    if (resolving.has(key))
      throw new Error(`cyclic export dependency at ${exportedName}`);
    resolving.add(key);
    try {
      const record = getRecord(file);
      const entry = record.exports.get(exportedName);
      if (entry?.node) {
        if (runtimeStyleExpression(entry.node)) return { kind: "runtime" };
        return {
          kind: "static",
          values: evaluateNode(entry.node, {
            resolveLocal(name) {
              const result = evaluateLocal(record, name);
              if (result.kind !== "static")
                throw new Error(`${name} is not a static style source`);
              return result.values;
            },
          }),
        };
      }
      if (entry?.local) return evaluateLocal(record, entry.local);
      if (entry?.source) {
        const target = resolveSourceFile(file, entry.source);
        if (!target) return { kind: "external" };
        return evaluateExport(target, entry.imported);
      }
      for (const sourceName of record.exportAll) {
        const target = resolveSourceFile(file, sourceName);
        if (!target) continue;
        try {
          return evaluateExport(target, exportedName);
        } catch (error) {
          if (!String(error.message).includes("does not export")) throw error;
        }
      }
      throw new Error(`${file} does not export ${exportedName}`);
    } finally {
      resolving.delete(key);
    }
  }

  function resultFromEvaluation(evaluation, descriptor = null) {
    if (evaluation.kind !== "static") return evaluation;
    return {
      kind: "static",
      candidates: [...collectStrings(evaluation.values)],
      dependencies: [...dependencies],
      descriptor,
    };
  }

  return {
    resolveLocal(name) {
      const record = getRecord(filename);
      const imported = record.imports.get(name);
      let descriptor = null;
      if (imported) {
        const target = resolveSourceFile(filename, imported.source);
        if (target)
          descriptor = { file: target, exportName: imported.imported };
      } else {
        descriptor = { file: filename, localName: name };
      }
      return resultFromEvaluation(evaluateLocal(record, name), descriptor);
    },
    resolveNode(node) {
      if (runtimeStyleExpression(node)) return { kind: "runtime" };
      return resultFromEvaluation({
        kind: "static",
        values: evaluateNode(node, {
          resolveLocal: (name) => {
            const result = evaluateLocal(getRecord(filename), name);
            if (result.kind !== "static")
              throw new Error(`${name} is not a static style source`);
            return result.values;
          },
        }),
      });
    },
    resolveExport(file, exportName) {
      return resultFromEvaluation(evaluateExport(file, exportName), {
        file,
        exportName,
      });
    },
  };
}

export function resolveStaticGuardExport(descriptor) {
  const source = fs.readFileSync(descriptor.file, "utf8");
  const resolver = createStaticGuardResolver({
    source,
    filename: descriptor.file,
  });
  if (descriptor.localName) return resolver.resolveLocal(descriptor.localName);
  return resolver.resolveExport(descriptor.file, descriptor.exportName);
}

export { runtimeStyleExpression };
