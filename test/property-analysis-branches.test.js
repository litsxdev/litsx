import assert from "node:assert/strict";
import babelTraverse from "@babel/traverse";
import * as t from "@babel/types";
import ts from "typescript";
import { describe, it } from "vitest";
import parser from "./helpers/litsx-parser.js";
import {
  clonePropertyConfig,
  createPropertyConfig,
  createPropertyValue,
  createResolvedTypeResolver,
  createSpanNodeLookup,
  extractParamName,
  extractProperties,
  findTsNodeAtSpan,
  findTypeDeclaration,
  getBabelNodeSpanCacheKey,
  getCheckerPropertyMapForPattern,
  getCheckerTypeForBabelNode,
  getTsLiteralPropertyTypes,
  getTypeLiteralMembers,
  getTypeResolutionSessionKey,
  getTypeResolverCacheKey,
  hashSource,
  inferTypeFromDefault,
  mapCheckerTypeToPropertyConfig,
  mapLiteralTypeToLit,
  mapTsTypeToLit,
  mergePropertyConfig,
  normalizeInMemoryFiles,
  normalizePropertyConfigInput,
  normalizeTypescriptModule,
  setPropertyBabelTypes,
  setTypescriptModule,
} from "../packages/babel-preset-litsx/src/internal/transform-litsx-properties.js";

const traverse = babelTraverse.default || babelTraverse;
setPropertyBabelTypes(t);
setTypescriptModule(ts);

function program(source) {
  const ast = parser.parse(source, { sourceType: "module", plugins: ["typescript"] });
  let result;
  traverse(ast, { Program(path) { result = path; } });
  return result;
}

const typeName = (config) => config.type?.name;

describe("property analysis branch behavior", () => {
  it("maps every supported Babel TypeScript type family", () => {
    const root = program(`
      interface Base { base: string }
      interface Detail extends Base { count: number }
      type Alias = boolean;
      type Shape = { ready: boolean };
      type Cycle = Cycle;
    `);
    const nodes = [
      [null, "Object"],
      [t.tsStringKeyword(), "String"],
      [t.tsNumberKeyword(), "Number"],
      [t.tsBooleanKeyword(), "Boolean"],
      [t.tsArrayType(t.tsStringKeyword()), "Array"],
      [t.tsTupleType([]), "Array"],
      [t.tsFunctionType(null, [], null, t.tsTypeAnnotation(t.tsVoidKeyword())), "Object"],
      [t.tsLiteralType(t.stringLiteral("x")), "String"],
      [t.tsLiteralType(t.numericLiteral(1)), "Number"],
      [t.tsLiteralType(t.booleanLiteral(true)), "Boolean"],
      [t.tsLiteralType(t.bigIntLiteral(1n)), "Object"],
      [t.tsTypeReference(t.identifier("Array")), "Array"],
      [t.tsTypeReference(t.identifier("ReadonlyArray")), "Array"],
      [t.tsTypeReference(t.identifier("Record")), "Object"],
      [t.tsTypeReference(t.identifier("Date")), "Date"],
      [t.tsTypeReference(t.identifier("Alias")), "Boolean"],
      [t.tsTypeReference(t.identifier("Shape")), "Object"],
      [t.tsTypeReference(t.identifier("Detail")), "Object"],
      [t.tsTypeReference(t.identifier("Missing")), "Object"],
      [t.tsTypeReference(t.identifier("Cycle")), "Object"],
      [t.tsParenthesizedType(t.tsStringKeyword()), "String"],
      [t.tsUnknownKeyword(), "Object"],
    ];
    for (const [node, expected] of nodes) assert.equal(typeName(mapTsTypeToLit(node, root)), expected);

    assert.equal(typeName(mapTsTypeToLit(t.tsUnionType([t.tsStringKeyword(), t.tsLiteralType(t.stringLiteral("x"))]), root)), "String");
    assert.equal(typeName(mapTsTypeToLit(t.tsUnionType([t.tsStringKeyword(), t.tsNumberKeyword()]), root)), "Object");
    assert.equal(mapTsTypeToLit(t.tsUnionType([
      t.tsFunctionType(null, [], null, t.tsTypeAnnotation(t.tsVoidKeyword())),
      t.tsConstructorType(null, [], null, t.tsTypeAnnotation(t.tsAnyKeyword())),
    ]), root).attribute, false);
    assert.equal(typeName(mapTsTypeToLit(t.tsIntersectionType([t.tsStringKeyword(), t.tsNumberKeyword()]), root)), "Object");
  });

  it("extracts type members and literal property maps through aliases and intersections", () => {
    const root = program(`
      interface Base { title: string }
      interface Child extends Base, Missing { count: number }
      type Alias = Child;
      type Both = Alias & { ready: boolean; title: number };
    `);
    const declarations = new Map(root.node.body.map((node) => [node.id?.name, node]));
    assert.equal(getTypeLiteralMembers(null, root).length, 0);
    assert.equal(getTypeLiteralMembers(declarations.get("Child"), root).length, 2);
    assert.equal(getTypeLiteralMembers(declarations.get("Alias"), root).length, 2);
    assert.equal(getTypeLiteralMembers(t.tsParenthesizedType(t.tsTypeReference(t.identifier("Alias"))), root).length, 2);
    assert.equal(getTypeLiteralMembers(t.tsUnknownKeyword(), root).length, 0);

    const map = getTsLiteralPropertyTypes(declarations.get("Both"), root);
    assert.equal(typeName(map.get("title")), "String");
    assert.equal(typeName(map.get("count")), "Number");
    assert.equal(typeName(map.get("ready")), "Boolean");
    assert.equal(getTsLiteralPropertyTypes(null, root).size, 0);
    assert.equal(getTsLiteralPropertyTypes({ type: "TSMappedType" }, root).get("default").type.name, "Object");
    assert.equal(getTsLiteralPropertyTypes(t.tsTypeReference(t.identifier("Missing")), root).size, 0);
  });

  it("infers defaults and extracts every supported parameter name shape", () => {
    assert.equal(inferTypeFromDefault(t.numericLiteral(1)).name, "Number");
    assert.equal(inferTypeFromDefault(t.booleanLiteral(true)).name, "Boolean");
    assert.equal(inferTypeFromDefault(t.arrayExpression([])).name, "Array");
    assert.equal(inferTypeFromDefault(t.objectExpression([])).name, "Object");
    assert.equal(inferTypeFromDefault(t.nullLiteral()).name, "String");

    assert.equal(extractParamName(t.identifier("plain")), "plain");
    assert.equal(extractParamName(t.restElement(t.identifier("rest"))), "rest");
    assert.equal(extractParamName(t.assignmentPattern(t.identifier("assigned"), t.numericLiteral(1))), "assigned");
    assert.equal(extractParamName(t.objectProperty(t.identifier("key"), t.identifier("value"))), "value");
    assert.equal(extractParamName(t.objectProperty(t.identifier("key"), t.assignmentPattern(t.identifier("defaulted"), t.numericLiteral(1)))), "defaulted");
    assert.equal(extractParamName(t.objectProperty(t.identifier("key"), t.objectExpression([]))), "key");
    assert.equal(extractParamName(t.arrayPattern([])), null);
  });

  it("maps checker types, recursion, unions, intersections, primitives, arrays, and symbols", () => {
    const checker = {
      getNonNullableType: (value) => value,
      getSignaturesOfType: (value) => value.calls ?? [],
      isArrayType: (value) => value.array === true,
      isTupleType: (value) => value.tuple === true,
    };
    const leaf = (flags = 0, extra = {}) => ({ flags, ...extra });
    const cases = [
      [null, "Object", undefined],
      [leaf(0, { calls: [{}] }), "Object", false],
      [leaf(ts.TypeFlags.String), "String", undefined],
      [leaf(ts.TypeFlags.NumberLike), "Number", undefined],
      [leaf(ts.TypeFlags.BooleanLike), "Boolean", undefined],
      [leaf(ts.TypeFlags.BigIntLike), "Object", undefined],
      [leaf(0, { array: true }), "Array", undefined],
      [leaf(0, { tuple: true }), "Array", undefined],
      [leaf(0, { getSymbol: () => ({ getName: () => "Date" }) }), "Date", undefined],
      [leaf(0, { getSymbol: () => ({ getName: () => "Other" }) }), "Object", undefined],
    ];
    for (const [value, expected, attribute] of cases) {
      const config = mapCheckerTypeToPropertyConfig(value, checker);
      assert.equal(typeName(config), expected);
      assert.equal(config.attribute, attribute);
    }

    const string = leaf(ts.TypeFlags.String);
    const number = leaf(ts.TypeFlags.Number);
    const fn = leaf(0, { calls: [{}] });
    assert.equal(typeName(mapCheckerTypeToPropertyConfig({ isUnion: () => true, types: [string, string] }, checker)), "String");
    assert.equal(typeName(mapCheckerTypeToPropertyConfig({ isUnion: () => true, types: [string, number] }, checker)), "Object");
    assert.equal(mapCheckerTypeToPropertyConfig({ isUnion: () => true, types: [fn, fn] }, checker).attribute, false);
    assert.equal(typeName(mapCheckerTypeToPropertyConfig({ isIntersection: () => true, types: [string, number] }, checker)), "String");
    assert.equal(typeName(mapCheckerTypeToPropertyConfig({ isIntersection: () => true, types: [leaf(), leaf()] }, checker)), "Object");

    const recursive = leaf();
    const cacheState = { cache: new Map(), inProgress: new Set([recursive]) };
    assert.equal(typeName(mapCheckerTypeToPropertyConfig(recursive, checker, cacheState)), "Object");
    const cached = leaf();
    cacheState.inProgress.clear();
    cacheState.cache.set(cached, { type: t.identifier("Boolean") });
    assert.equal(typeName(mapCheckerTypeToPropertyConfig(cached, checker, cacheState)), "Boolean");
  });

  it("caches checker lookups and property maps including failures", () => {
    const node = { start: 1, end: 2 };
    const tsNode = {};
    const type = { flags: 0 };
    const symbol = {
      valueDeclaration: {},
      getName: () => "value",
    };
    const resolver = {
      getNodeAtSpan: () => tsNode,
      checker: {
        getTypeAtLocation: () => type,
        getNonNullableType: (value) => value,
        getSignaturesOfType: () => [],
        isArrayType: () => false,
        isTupleType: () => false,
        getPropertiesOfType: () => [symbol, { declarations: [] }],
        getTypeOfSymbolAtLocation: () => ({ flags: ts.TypeFlags.String }),
      },
      checkerTypeCache: new Map(),
      checkerPropertyMapCache: new Map(),
      checkerPropertyMapByTypeCache: new Map(),
      checkerTypeConfigCache: new Map(),
      checkerTypeConfigInProgress: new Set(),
    };
    assert.equal(getCheckerTypeForBabelNode({}, resolver), null);
    assert.equal(getCheckerTypeForBabelNode(node, null), null);
    assert.equal(getCheckerTypeForBabelNode(node, resolver), type);
    assert.equal(getCheckerTypeForBabelNode(node, resolver), type);
    const map = getCheckerPropertyMapForPattern(node, resolver);
    assert.equal(typeName(map.get("value")), "String");
    assert.strictEqual(getCheckerPropertyMapForPattern(node, resolver), map);

    const missing = { ...resolver, getNodeAtSpan: () => null, checkerTypeCache: new Map(), checkerPropertyMapCache: new Map() };
    assert.equal(getCheckerPropertyMapForPattern({ start: 3, end: 4 }, missing), null);
    const throwing = { ...resolver, getNodeAtSpan: () => tsNode, checker: { ...resolver.checker, getTypeAtLocation: () => { throw new Error("nope"); } }, checkerTypeCache: new Map() };
    assert.equal(getCheckerTypeForBabelNode({ start: 5, end: 6 }, throwing), null);
  });

  it("normalizes modules, cache keys, files, and property configuration values", () => {
    assert.strictEqual(normalizeTypescriptModule({ default: ts }), ts);
    assert.strictEqual(normalizeTypescriptModule(ts), ts);
    assert.strictEqual(normalizeTypescriptModule(null), null);
    assert.equal(hashSource("stable"), hashSource("stable"));
    assert.notEqual(hashSource("stable"), hashSource("changed"));
    assert.match(getTypeResolverCacheKey(null, "source"), /inline-input\.tsx/);
    assert.match(getTypeResolverCacheKey("C:\\src\\file.tsx", "source", "project", "key"), /^project:key:/);
    assert.match(getTypeResolutionSessionKey("/src/file.tsx", { jsx: 4 }, "key"), /"sessionKey":"key"/);
    const files = normalizeInMemoryFiles({ "C:\\src\\file.tsx": "source" });
    assert.equal(files.get("C:/src/file.tsx"), "source");

    assert.equal(normalizePropertyConfigInput(null).type, null);
    assert.equal(normalizePropertyConfigInput(t.identifier("Boolean")).type.name, "Boolean");
    const config = createPropertyConfig(t.identifier("Number"), { attribute: false });
    assert.equal(clonePropertyConfig(config).attribute, false);
    assert.equal(createPropertyValue(null).properties[0].value.name, "String");
    assert.equal(createPropertyValue(config, false).properties.length, 2);
    assert.equal(createPropertyValue(createPropertyConfig(), false).properties.length, 0);

    const entry = { node: t.objectProperty(t.identifier("x"), t.objectExpression([])) };
    mergePropertyConfig(entry, createPropertyConfig(), true);
    mergePropertyConfig(entry, createPropertyConfig(t.identifier("Number"), { attribute: false }));
    mergePropertyConfig(entry, createPropertyConfig(t.identifier("Boolean"), { attribute: false }));
    assert.equal(entry.node.value.properties.find((property) => property.key.name === "type").value.name, "Number");
    assert.equal(entry.node.value.properties.find((property) => property.key.name === "attribute").value.value, false);
    assert.doesNotThrow(() => mergePropertyConfig(null, config));
  });

  it("looks up TypeScript spans, declarations, and semantic-cache-backed resolvers", () => {
    const sourceFile = ts.createSourceFile("/src/file.ts", "type Name = string; const value = 1;", ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    const alias = sourceFile.statements[0];
    assert.strictEqual(findTsNodeAtSpan(sourceFile, alias.pos, alias.end, null), alias);
    assert.strictEqual(findTsNodeAtSpan(sourceFile, 999, 1000, null), null);
    const predicate = (node) => node.kind === ts.SyntaxKind.TypeAliasDeclaration;
    const lookup = createSpanNodeLookup(sourceFile);
    assert.strictEqual(lookup(alias.pos, alias.end), alias);
    assert.strictEqual(lookup(alias.pos, alias.end), alias);
    assert.strictEqual(lookup(alias.pos, alias.end, predicate), alias);
    assert.strictEqual(lookup(alias.pos, alias.end, predicate), alias);

    assert.equal(getBabelNodeSpanCacheKey({ start: 1, end: 2 }), "1:2");
    assert.equal(getBabelNodeSpanCacheKey({ start: null, end: 2 }), null);
    assert.equal(findTypeDeclaration(null, "Name"), null);
    const root = program("type Alias = string; interface Shape { value: number }");
    assert.equal(findTypeDeclaration(root, "Alias").type, "TSTypeAliasDeclaration");
    assert.equal(findTypeDeclaration(root, "Shape").type, "TSInterfaceDeclaration");
    assert.equal(findTypeDeclaration(root, "Missing"), null);

    assert.equal(createResolvedTypeResolver(() => {}, "key", null), null);
    const semantic = new Map();
    const resolved = createResolvedTypeResolver(
      (_key, value) => value,
      "key",
      {
        filename: "/src/file.ts",
        sourceFile,
        checker: {},
        getSemanticCache(name, create) {
          if (!semantic.has(name)) semantic.set(name, create());
          return semantic.get(name);
        },
      }
    );
    assert.strictEqual(resolved.getNodeAtSpan(alias.pos, alias.end), alias);
    assert.ok(resolved.checkerTypeConfigCache instanceof WeakMap);
    assert.ok(resolved.checkerPropertyMapByTypeCache instanceof WeakMap);
  });

  it("maps literal types independently", () => {
    assert.equal(mapLiteralTypeToLit(t.tsStringKeyword()), null);
    assert.equal(mapLiteralTypeToLit(t.tsLiteralType(t.stringLiteral("x"))).name, "String");
    assert.equal(mapLiteralTypeToLit(t.tsLiteralType(t.numericLiteral(1))).name, "Number");
    assert.equal(mapLiteralTypeToLit(t.tsLiteralType(t.booleanLiteral(true))).name, "Boolean");
    assert.equal(mapLiteralTypeToLit(t.tsLiteralType(t.bigIntLiteral(1n))), null);
  });

  it("extracts rare parameter, ref, rest, nested, alias, and warning branches", () => {
    const analyze = (source, options = {}) => {
      const ast = parser.parse(source, { sourceType: "module", plugins: ["typescript"] });
      let programPath;
      let functionPath;
      traverse(ast, {
        Program(path) { programPath = path; },
        FunctionDeclaration(path) { if (!functionPath) functionPath = path; },
      });
      return extractProperties(functionPath, programPath, options);
    };

    const nested = analyze(`
      interface Props { title: string; ref: unknown; nested: { value: number }; list: string[]; extra: boolean }
      function Card({ ref, title = "x", nested: { value } = { value: 1 }, list: [first], ...rest }: Props, ...args: number[]) {}
    `);
    for (const name of ["ref", "title", "nested", "list", "args"]) assert.ok(nested.propertyNames.has(name));
    assert.equal(nested.defaults.get("title").value, "x");
    assert.ok(nested.nestedInitializers.length >= 2);
    assert.equal(nested.restProps.propertyName, "__litsxRestProps");
    assert.equal(nested.bindings.get("ref"), "ref");

    const warnings = [];
    const opaque = analyze(`
      function Card(props) {
        const alias = props;
        const second = alias;
        const { title: heading, count = 1, nested: { value }, list: [first], "aria-label": aria, ...ignored } = second;
        const direct = props.visible;
        const computed = props["hidden"];
        function Nested() { const { skipped } = props; }
        return heading;
      }
    `, { warn: (warning) => warnings.push(warning) });
    for (const name of ["title", "count", "nested", "list", "aria-label", "visible"]) assert.ok(opaque.propertyNames.has(name));
    assert.equal(opaque.propertyNames.has("hidden"), false);
    assert.ok(warnings.some((warning) => warning.propName === "visible"));

    const forwarded = analyze(`function Card(value, forwarded) { return value; }`, {
      forwardRef: { paramIndex: 1, propName: "component-ref" },
    });
    assert.ok(forwarded.propertyNames.has("component-ref"));
    assert.equal(forwarded.bindings.get("forwarded"), "component-ref");

    const typedDefault = analyze(`
      interface Props { enabled: boolean; label: string }
      function Card(props: Props = {}) { return props.enabled; }
    `);
    assert.ok(typedDefault.propertyNames.has("enabled"));
    assert.ok(typedDefault.propertyNames.has("label"));
  });
});
