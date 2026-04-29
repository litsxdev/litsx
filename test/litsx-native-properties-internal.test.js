import assert from "assert";
import babelTypes from "@babel/types";
import traverseModule from "@babel/traverse";
import { beforeAll } from "vitest";
import parser from "../packages/babel-parser-litsx/src/index.mjs";
import {
  createPropertyConfig,
  createPropertyValue,
  createTypeResolver,
  ensureTypescriptModule,
  extractProperties,
  mergePropertyConfig,
  setTypescriptModule,
  setPropertyBabelTypes,
} from "../packages/babel-preset-litsx/src/internal/transform-litsx-properties.js";

const traverse = traverseModule.default ?? traverseModule;

function getFunctionAndProgramPaths(source, plugins = ["typescript", "jsx"]) {
  const ast = parser.parse(source, { sourceType: "module", plugins });
  let functionPath = null;
  let programPath = null;

  traverse(ast, {
    Program(path) {
      programPath = path;
    },
    FunctionDeclaration(path) {
      if (!functionPath) {
        functionPath = path;
      }
    },
    VariableDeclarator(path) {
      if (!functionPath) {
        const initPath = path.get("init");
        if (initPath.isArrowFunctionExpression() || initPath.isFunctionExpression()) {
          functionPath = initPath;
        }
      }
    },
  });

  return { ast, functionPath, programPath };
}

describe("native properties internals", () => {
  beforeAll(() => {
    setPropertyBabelTypes(babelTypes);
    ensureTypescriptModule();
  });

  it("creates property values and merges defaults predictably", () => {
    const empty = createPropertyValue(null, false);
    assert.strictEqual(empty.properties.length, 0);

    const defaulted = createPropertyValue(createPropertyConfig(), true);
    assert.strictEqual(defaulted.properties[0].key.name, "type");
    assert.strictEqual(defaulted.properties[0].value.name, "String");

    const entry = {
      node: babelTypes.objectProperty(
        babelTypes.identifier("title"),
        babelTypes.objectExpression([
          babelTypes.objectProperty(
            babelTypes.identifier("type"),
            babelTypes.identifier("String")
          ),
        ])
      ),
    };

    mergePropertyConfig(entry, createPropertyConfig(babelTypes.identifier("Number")));
    assert.strictEqual(entry.node.value.properties[0].value.name, "Number");

    mergePropertyConfig(entry, createPropertyConfig(null, { attribute: false }), true);
    const attributeProp = entry.node.value.properties.find((prop) => prop.key.name === "attribute");
    assert(attributeProp);
    assert.strictEqual(attributeProp.value.value, false);

    mergePropertyConfig(null, createPropertyConfig(babelTypes.identifier("Boolean")));
  });

  it("builds in-memory resolvers and can resolve nodes by exact span and predicate", () => {
    const source = `
      interface Props {
        title: string;
      }

      export function Card(props: Props) {
        return <article>{props.title}</article>;
      }
    `;

    const resolver = createTypeResolver(null, source, {
      typeResolutionMode: "in-memory",
      inMemoryFiles: {
        "/virtual/extra.d.ts": "export type Unused = string;",
      },
    });

    assert(resolver);
    const firstResolver = resolver;
    const secondResolver = createTypeResolver(null, source, {
      typeResolutionMode: "in-memory",
      inMemoryFiles: {
        "/virtual/extra.d.ts": "export type Unused = string;",
      },
    });
    assert.strictEqual(secondResolver, firstResolver);

    const { functionPath } = getFunctionAndProgramPaths(source);
    const titleNode = functionPath.node.body.body[0].argument.children[0].expression;
    const tsNode = resolver.getNodeAtSpan(
      titleNode.start,
      titleNode.end,
      (node) => node.kind === resolver.sourceFile.statements[1].kind
    );
    assert(tsNode);
  });

  it("returns null when no source is provided to the type resolver", () => {
    assert.strictEqual(createTypeResolver("/tmp/demo.tsx", "", {}), null);
  });

  it("normalizes injected TypeScript runtimes and virtual filenames", () => {
    const actualTypescript = ensureTypescriptModule();
    const fakeTypescript = { marker: "fake-ts" };

    assert.strictEqual(setTypescriptModule({ default: fakeTypescript }), fakeTypescript);
    assert.strictEqual(ensureTypescriptModule(), fakeTypescript);

    setTypescriptModule(actualTypescript);

    const resolver = createTypeResolver(
      null,
      `
        type Props = { count: number };
        function Demo(props: Props) {
          return <p>{props.count}</p>;
        }
      `,
      { typeResolutionMode: "in-memory" }
    );

    assert(resolver);
    assert.strictEqual(resolver.filename, "/__litsx_virtual__/inline-input.tsx");
  });

  it("extracts props from typed aliases, opaque props access, forwardRef, and nested patterns", () => {
    const source = `
      type AliasProps = {
        title: string;
        ready: boolean;
      };

      function Card(
        props: AliasProps,
        ref,
        {
          nested: { count = 0, label },
          list = [],
          ["data-id"]: dataId,
          ...restProps
        }: {
          nested: { count: number; label: string };
          list?: string[];
          "data-id": string;
        }
      ) {
        const model = { title: props.title, ready: props.ready };
        return <article>{model.title} {props.extra}</article>;
      }
    `;

    const { functionPath, programPath } = getFunctionAndProgramPaths(source);
    const warnings = [];
    const resolver = createTypeResolver("/virtual/card.tsx", source);
    const result = extractProperties(functionPath, programPath, {
      typeResolver: resolver,
      forwardRef: { paramIndex: 1, propName: "forwardedRef" },
      warn(entry) {
        warnings.push(entry);
      },
    });

    const propertyNames = [...result.propertyNames].sort();
    assert.deepStrictEqual(propertyNames, [
      "data-id",
      "forwardedRef",
      "list",
      "nested",
      "ready",
      "restProps",
      "title",
    ]);

    const bindings = result.bindings;
    assert.strictEqual(bindings.get("props").kind, "alias");
    assert.strictEqual(bindings.get("dataId"), "data-id");
    assert.strictEqual(bindings.get("ref"), "forwardedRef");

    const defaults = result.defaults;
    assert(defaults.has("list"));

    assert.strictEqual(result.nestedInitializers.length, 1);
    assert.strictEqual(result.nestedInitializers[0].root, "nested");
    assert.strictEqual(result.nestedInitializers[0].defaultValue, null);

    const forwardedRef = result.properties.find((prop) => prop.key.name === "forwardedRef");
    const forwardedRefAttribute = forwardedRef.value.properties.find(
      (prop) => prop.key.name === "attribute"
    );
    assert.strictEqual(forwardedRefAttribute.value.value, false);

    assert.strictEqual(warnings.length, 0);
  }, 20_000);

  it("covers identifier, rest, assignment, intersection, mapped, and ref special cases", () => {
    const source = `
      interface BaseProps {
        title: string;
      }

      type ExtraProps = {
        active: boolean;
      };

      type WrappedProps = BaseProps & ExtraProps;
      type DynamicMap<T> = { [K in keyof T]: T[K] };

      const Card = (
        ref,
        items: Array<string>,
        status = true,
        props: WrappedProps,
        data: DynamicMap<{ foo: string }>
      ) => <article>{props.title} {props.active} {data.foo} {items.length} {String(status)}</article>;
    `;

    const { functionPath, programPath } = getFunctionAndProgramPaths(source);
    const result = extractProperties(functionPath, programPath, {
      forwardRef: { paramIndex: 0 },
    });

    const propertyEntries = Object.fromEntries(
      result.properties.map((prop) => [
        prop.key.name,
        Object.fromEntries(
          prop.value.properties.map((entry) => [
            entry.key.name,
            entry.value.type === "Identifier" ? entry.value.name : entry.value.value,
          ])
        ),
      ])
    );

    assert.strictEqual(propertyEntries.ref.type, "Object");
    assert.strictEqual(propertyEntries.ref.attribute, false);
    assert.strictEqual(propertyEntries.items.type, "Array");
    assert.strictEqual(propertyEntries.status.type, "Boolean");
    assert.strictEqual(propertyEntries.title.type, "String");
    assert.strictEqual(propertyEntries.active.type, "Boolean");
    assert.strictEqual(propertyEntries.data.type, "Object");
  });

  it("maps unions, tuples, callable props, bigint, and nullable intersections through the type resolver", () => {
    const source = `
      type PrimitiveUnion = string | "ready";
      type MixedUnion = string | number;
      type StatusInfo = { state: "idle" } & { count: number | null };
      type Props = {
        primitive: PrimitiveUnion;
        mixed: MixedUnion;
        items: [string, number];
        factory: () => void;
        token: bigint;
        status: StatusInfo;
      };

      function Card(props: Props) {
        return <article>{props.primitive} {props.mixed} {props.items.length}</article>;
      }
    `;

    const { functionPath, programPath } = getFunctionAndProgramPaths(source, ["typescript", "jsx"]);
    const resolver = createTypeResolver("/virtual/advanced-props.tsx", source);
    const result = extractProperties(functionPath, programPath, { typeResolver: resolver });

    const propertyEntries = Object.fromEntries(
      result.properties.map((prop) => [
        prop.key.name,
        Object.fromEntries(
          prop.value.properties.map((entry) => [
            entry.key.name,
            entry.value.type === "Identifier" ? entry.value.name : entry.value.value,
          ])
        ),
      ])
    );

    assert.strictEqual(propertyEntries.primitive.type, "String");
    assert.strictEqual(propertyEntries.mixed.type, "Object");
    assert.strictEqual(propertyEntries.items.type, "Array");
    assert.strictEqual(propertyEntries.factory.type, "Object");
    assert.strictEqual(propertyEntries.factory.attribute, false);
    assert.strictEqual(propertyEntries.token.type, "Object");
    assert.strictEqual(propertyEntries.status.type, "Object");
  }, 20_000);

  it("records defaults, nested initializers, and warnings for opaque props access", () => {
    const source = `
      function Card(
        props,
        {
          filters: [primary = "all", secondary],
          options: { dense = false } = {},
          mode = "compact",
        }
      ) {
        return (
          <article>
            {props.title}
            {props.enabled}
            {primary}
            {secondary}
            {String(dense)}
            {mode}
          </article>
        );
      }
    `;

    const { functionPath, programPath } = getFunctionAndProgramPaths(source, ["jsx"]);
    const warnings = [];
    const result = extractProperties(functionPath, programPath, {
      warn(entry) {
        warnings.push(entry);
      },
    });

    const propertyNames = [...result.propertyNames].sort();
    assert.deepStrictEqual(propertyNames, [
      "enabled",
      "filters",
      "mode",
      "options",
      "title",
    ]);

    assert.strictEqual(result.bindings.get("props"), "props");
    assert.strictEqual(result.bindings.get("mode"), "mode");
    assert.strictEqual(result.defaults.get("mode").value, "compact");

    assert.strictEqual(result.nestedInitializers.length, 2);
    assert.strictEqual(result.nestedInitializers[0].root, "filters");
    assert.strictEqual(result.nestedInitializers[0].pattern.type, "ArrayPattern");
    assert.strictEqual(result.nestedInitializers[1].root, "options");
    assert.strictEqual(result.nestedInitializers[1].pattern.type, "ObjectPattern");
    assert.strictEqual(result.nestedInitializers[1].defaultValue.type, "ObjectExpression");

    assert.strictEqual(warnings.length, 2);
    assert.deepStrictEqual(
      warnings.map((entry) => entry.propName).sort(),
      ["enabled", "title"]
    );
    assert.ok(warnings.every((entry) => entry.code === 91018));

    const propertyEntries = Object.fromEntries(
      result.properties.map((prop) => [
        prop.key.name,
        Object.fromEntries(
          prop.value.properties.map((entry) => [
            entry.key.name,
            entry.value.type === "Identifier" ? entry.value.name : entry.value.value,
          ])
        ),
      ])
    );

    assert.strictEqual(propertyEntries.filters.type, "Array");
    assert.strictEqual(propertyEntries.options.type, "Object");
    assert.strictEqual(propertyEntries.mode.type, "String");
    assert.strictEqual(propertyEntries.title.type, "String");
    assert.strictEqual(propertyEntries.enabled.type, "String");
  });

  it("covers constructor types, readonly arrays, recursive aliases, and typed assignment params", () => {
    const source = `
      type Recursive = Recursive | string;
      type Props = {
        factory: abstract new (...args: any[]) => Date;
        values: ReadonlyArray<number>;
        createdAt: Date;
        maybeRecursive: Recursive;
      };

      function Card(
        props: Props = {} as Props,
        handler: ((event: Event) => void) = () => {},
        extras: Record<string, unknown> = {}
      ) {
        return <article>{props.createdAt?.toISOString()} {props.values.length}</article>;
      }
    `;

    const { functionPath, programPath } = getFunctionAndProgramPaths(source, ["typescript", "jsx"]);
    const resolver = createTypeResolver("/virtual/constructor-props.tsx", source);
    const result = extractProperties(functionPath, programPath, { typeResolver: resolver });

    const propertyEntries = Object.fromEntries(
      result.properties.map((prop) => [
        prop.key.name,
        Object.fromEntries(
          prop.value.properties.map((entry) => [
            entry.key.name,
            entry.value.type === "Identifier" ? entry.value.name : entry.value.value,
          ])
        ),
      ])
    );

    assert.strictEqual(propertyEntries.factory.type, "Object");
    assert.strictEqual(propertyEntries.values.type, "Array");
    assert.strictEqual(propertyEntries.createdAt.type, "Date");
    assert.strictEqual(propertyEntries.maybeRecursive.type, "Object");
    assert.strictEqual(propertyEntries.handler.type, "Object");
    assert.strictEqual(propertyEntries.extras.type, "Object");

    assert.strictEqual(result.defaults.get("handler").type, "ArrowFunctionExpression");
    assert.strictEqual(result.defaults.get("extras").type, "ObjectExpression");
    assert.strictEqual(result.bindings.get("props").kind, "alias");
  }, 20_000);

  it("covers direct identifiers, rest params, and shorthand object bindings", () => {
    const source = `
      function Dashboard(
        count: number,
        ...items: string[]
      ) {
        return <section>{count} {items.length}</section>;
      }

      function Card(
        {
          title,
          ready = false,
          mode: currentMode = "compact",
          nested: alias,
        }: {
          title: string;
          ready?: boolean;
          mode?: string;
          nested: string;
        }
      ) {
        return <article>{title} {String(ready)} {currentMode} {alias}</article>;
      }
    `;

    const { ast, programPath } = getFunctionAndProgramPaths(source, ["typescript", "jsx"]);
    const functions = [];

    traverse(ast, {
      FunctionDeclaration(path) {
        functions.push(path);
      },
    });

    const [dashboardPath, cardPath] = functions;
    const resolver = createTypeResolver("/virtual/dashboard.tsx", source);

    const dashboardResult = extractProperties(dashboardPath, programPath, { typeResolver: resolver });
    const dashboardEntries = Object.fromEntries(
      dashboardResult.properties.map((prop) => [
        prop.key.name,
        Object.fromEntries(
          prop.value.properties.map((entry) => [
            entry.key.name,
            entry.value.type === "Identifier" ? entry.value.name : entry.value.value,
          ])
        ),
      ])
    );

    assert.strictEqual(dashboardEntries.count.type, "Number");
    assert.strictEqual(dashboardEntries.items.type, "Array");

    const cardResult = extractProperties(cardPath, programPath, { typeResolver: resolver });
    const cardEntries = Object.fromEntries(
      cardResult.properties.map((prop) => [
        prop.key.name,
        Object.fromEntries(
          prop.value.properties.map((entry) => [
            entry.key.name,
            entry.value.type === "Identifier" ? entry.value.name : entry.value.value,
          ])
        ),
      ])
    );

    assert.strictEqual(cardEntries.title.type, "String");
    assert.strictEqual(cardEntries.ready.type, "Boolean");
    assert.strictEqual(cardEntries.mode.type, "String");
    assert.strictEqual(cardEntries.nested.type, "String");
    assert.strictEqual(cardResult.bindings.get("title"), "title");
    assert.strictEqual(cardResult.bindings.get("currentMode"), "mode");
    assert.strictEqual(cardResult.bindings.get("alias"), "nested");
  });

  it("maps direct TypeScript AST annotations without the checker", () => {
    const source = `
      type Variant = "primary" | "secondary";
      type Mixed = string | number;
      type Refined = { title: string } & { active: boolean };
      type RecursiveAlias = RecursiveAlias | number;

      function Card(
        variant: Variant,
        mixed: Mixed,
        createdAt: Date,
        onCommit: (() => void) | undefined,
        refined: Refined,
        recursive: RecursiveAlias,
        tuple: [string, number],
        ...entries: ReadonlyArray<string>
      ) {
        return <article>{variant}{mixed}{createdAt}{String(onCommit)}{String(refined)}{recursive}{tuple.length}{entries.length}</article>;
      }
    `;

    const { functionPath, programPath } = getFunctionAndProgramPaths(source, ["typescript", "jsx"]);
    const result = extractProperties(functionPath, programPath, {});

    const propertyEntries = Object.fromEntries(
      result.properties.map((prop) => [
        prop.key.name,
        Object.fromEntries(
          prop.value.properties.map((entry) => [
            entry.key.name,
            entry.value.type === "Identifier" ? entry.value.name : entry.value.value,
          ])
        ),
      ])
    );

    assert.strictEqual(propertyEntries.variant.type, "String");
    assert.strictEqual(propertyEntries.mixed.type, "Object");
    assert.strictEqual(propertyEntries.createdAt.type, "Date");
    assert.strictEqual(propertyEntries.onCommit.type, "Object");
    assert.strictEqual(propertyEntries.title.type, "String");
    assert.strictEqual(propertyEntries.active.type, "Boolean");
    assert.strictEqual(propertyEntries.recursive.type, "Object");
    assert.strictEqual(propertyEntries.tuple.type, "Array");
    assert.strictEqual(propertyEntries.entries.type, "Array");
  });
});
