import assert from "assert";
import babelTraverse from "@babel/traverse";
import * as t from "@babel/types";
import parser from "../packages/babel-parser-litsx/src/index.js";
import {
  assertStaticHoistsStayTopLevel,
  processStaticHoists,
  setStaticHoistsBabelTypes,
} from "../packages/babel-preset-litsx/src/internal/transform-litsx-static-hoists.js";
import {
  collectStaticIr,
  setStaticIrInferredProperties,
  setStaticIrBabelTypes,
} from "../packages/babel-preset-litsx/src/internal/transform-litsx-static-ir.js";
import { setPropertyBabelTypes } from "../packages/babel-preset-litsx/src/internal/transform-litsx-properties.js";

const traverse = babelTraverse.default || babelTraverse;

function getFunctionContext(source, plugins = []) {
  const ast = parser.parse(source, { sourceType: "module", plugins });
  let programPath;
  let functionPath;

  traverse(ast, {
    Program(path) {
      programPath = path;
    },
    FunctionDeclaration(path) {
      if (!functionPath) {
        functionPath = path;
      }
    },
  });

  return { ast, programPath, functionPath };
}

function createStaticSymbolFactory() {
  const seen = new Map();
  return (programPath, name) => {
    const existing = seen.get(name);
    if (existing) {
      return { symbolId: existing.symbolId, declaration: null };
    }

    const symbolId = programPath.scope.generateUidIdentifier(`litsx_static_${name}`);
    const declaration = t.variableDeclaration("const", [
      t.variableDeclarator(
        t.cloneNode(symbolId),
        t.callExpression(t.identifier("Symbol"), [t.stringLiteral(`litsx.static.${name}`)])
      ),
    ]);

    const value = { symbolId, declaration };
    seen.set(name, value);
    return value;
  };
}

function getStaticPropertiesGetterObjectProperties(member) {
  return member.body.body[0].argument.arguments[1].body.arguments[0].properties;
}

setStaticHoistsBabelTypes(t);
setStaticIrBabelTypes(t);
setPropertyBabelTypes(t);

describe("native static hoists internals", () => {
  it("collects early static IR for properties, elements, and light DOM", () => {
    const source = `
      function Card() {
        staticProps({
          legacy: String,
        });

        static properties = {
          title: String,
        };

        static lightDom = true;

        return <ChildCard />;
      }
    `;

    const { functionPath } = getFunctionContext(source);
    const ir = collectStaticIr({
      functionPath,
      elementCandidates: new Set(["ChildCard"]),
      importedElementCandidates: [
        {
          sourceFile: "/project/child-card.litsx",
          importedName: "ChildCard",
          tagName: "child-card",
        },
      ],
    });

    assert.strictEqual(ir.properties.authored.length, 1);
    assert.strictEqual(ir.properties.legacy.length, 1);
    assert.strictEqual(ir.properties.authored[0].index, 1);
    assert.strictEqual(ir.properties.legacy[0].index, 0);
    assert.deepStrictEqual(ir.elements.localCandidates, ["ChildCard"]);
    assert.deepStrictEqual(ir.elements.importedCandidates, [
      {
        sourceFile: "/project/child-card.litsx",
        importedName: "ChildCard",
        tagName: "child-card",
      },
    ]);
    assert.strictEqual(ir.lightDom, true);
  });

  it("processes static properties from early static IR", () => {
    const source = `
      function Card() {
        staticProps({
          legacy: Number,
        });

        static properties = {
          title: String,
        };

        return <div>ready</div>;
      }
    `;

    const { programPath, functionPath } = getFunctionContext(source);
    const renderStatements = [...functionPath.node.body.body];
    const propertiesStatic = [
      t.objectProperty(
        t.identifier("inferred"),
        t.objectExpression([t.objectProperty(t.identifier("type"), t.identifier("String"))])
      ),
    ];
    const staticIr = collectStaticIr({ functionPath });
    setStaticIrInferredProperties(staticIr, propertiesStatic);
    const classMembers = [];

    const result = processStaticHoists({
      functionPath,
      node: functionPath.node,
      renderStatements,
      programPath,
      staticIr,
      classMembers,
      options: {},
      getOrCreateModuleStaticHoistSymbol: createStaticSymbolFactory(),
    });

    assert.strictEqual(renderStatements.length, 1);
    assert.strictEqual(classMembers.length, 0);
    const propertiesGetter = result.hoistMembers.find((member) => member.key.name === "properties");
    assert.deepStrictEqual(
      getStaticPropertiesGetterObjectProperties(propertiesGetter)
        .filter((node) => t.isObjectProperty(node))
        .map((node) => (t.isIdentifier(node.key) ? node.key.name : node.key.value))
        .sort(),
      ["inferred", "legacy"]
    );
    assert.deepStrictEqual(
      result.hoistMembers.map((member) => member.key.name),
      ["properties"]
    );
  });

  it("collects hoisted members, merges legacy static props, and marks css requirements", () => {
    const source = `
      const gap = "12px";

      function Card() {
        staticProps({
          legacy: { attribute: false },
          count: Number,
        });

        staticStyles(":host { color: red; }");

        static properties = {
          title: String,
          count: { reflect: true },
          payload: { type: Object, attribute: false },
        };

        static styles = \`
          :host {
            gap: \${gap};
          }
        \`;

        static shadowRootOptions = { delegatesFocus: true };

        static expose = {
          ping() {
            return "pong";
          },
          compute: (value) => value + 1,
        };

        return <div>ready</div>;
      }
    `;

    const { programPath, functionPath } = getFunctionContext(source);
    const renderStatements = [...functionPath.node.body.body];
    const propertiesStatic = [
      t.objectProperty(
        t.identifier("initial"),
        t.objectExpression([t.objectProperty(t.identifier("type"), t.identifier("String"))])
      ),
    ];
    const staticIr = collectStaticIr({ functionPath });
    setStaticIrInferredProperties(staticIr, propertiesStatic);
    const classMembers = [];

    const result = processStaticHoists({
      functionPath,
      node: functionPath.node,
      renderStatements,
      programPath,
      staticIr,
      classMembers,
      options: {},
      getOrCreateModuleStaticHoistSymbol: createStaticSymbolFactory(),
    });

    assert.strictEqual(result.lightDomRequested, false);
    assert.strictEqual(result.needsStaticHoistsMixin, true);
    assert.strictEqual(result.needsCss, true);
    assert.strictEqual(result.needsUnsafeCss, true);
    assert.strictEqual(result.hoistSymbolDeclarations.length, 3);
    assert.strictEqual(classMembers.length, 0);
    assert.strictEqual(renderStatements.length, 1);

    const propertiesGetter = result.hoistMembers.find((member) => member.key.name === "properties");
    const propertyNames = getStaticPropertiesGetterObjectProperties(propertiesGetter)
      .filter((node) => t.isObjectProperty(node))
      .map((node) => (t.isIdentifier(node.key) ? node.key.name : node.key.value))
      .sort();
    assert.deepStrictEqual(propertyNames, ["count", "initial", "legacy"]);

    const memberNames = result.hoistMembers.map((member) => member.key.name).sort();
    assert.deepStrictEqual(memberNames, [
      "compute",
      "ping",
      "properties",
      "shadowRootOptions",
      "styles",
    ]);

    const stylesGetter = result.hoistMembers.find((member) => member.key.name === "styles");
    const shadowRootOptionsGetter = result.hoistMembers.find(
      (member) => member.key.name === "shadowRootOptions"
    );
    const pingMethod = result.hoistMembers.find((member) => member.key.name === "ping");
    const computeMethod = result.hoistMembers.find((member) => member.key.name === "compute");

    assert.ok(propertiesGetter);
    assert.ok(stylesGetter);
    assert.ok(shadowRootOptionsGetter);
    assert.ok(pingMethod);
    assert.ok(computeMethod);
    assert.strictEqual(propertiesGetter.kind, "get");
    assert.strictEqual(stylesGetter.kind, "get");
    assert.strictEqual(shadowRootOptionsGetter.kind, "get");
    assert.strictEqual(pingMethod.static, true);
    assert.strictEqual(computeMethod.static, true);
    assert.strictEqual(computeMethod.async, false);
    assert.strictEqual(computeMethod.generator, false);
  });

  it("accepts top-level hoists and rejects nested ones", () => {
    const okSource = `
      function Card() {
        static styles = ":host { display: block; }";
        return <div>ok</div>;
      }
    `;

    const { functionPath: okFunctionPath } = getFunctionContext(okSource);
    assert.doesNotThrow(() => {
      assertStaticHoistsStayTopLevel(okFunctionPath);
    });

    const badSource = `
      function Card() {
        if (ready) {
          static styles = ":host { display: block; }";
        }

        return <div>bad</div>;
      }
    `;

    const { functionPath: badFunctionPath } = getFunctionContext(badSource);
    assert.throws(() => {
      assertStaticHoistsStayTopLevel(badFunctionPath);
    });
  });

  it("rejects dynamic hoists and invalid expose payloads", () => {
    const dynamicStylesSource = `
      function Card() {
        static styles = (() => ":host { display: block; }");
        return <div>ready</div>;
      }
    `;

    const { programPath: stylesProgramPath, functionPath: stylesFunctionPath } =
      getFunctionContext(dynamicStylesSource);

    assert.throws(() => {
      processStaticHoists({
        functionPath: stylesFunctionPath,
        node: stylesFunctionPath.node,
        renderStatements: [...stylesFunctionPath.node.body.body],
        programPath: stylesProgramPath,
        classMembers: [],
        options: {},
        getOrCreateModuleStaticHoistSymbol: createStaticSymbolFactory(),
      });
    }, /static styles = \.\.\. only accepts static values/);

    const badExposeSource = `
      function Card() {
        static expose = {
          ...helpers,
        };
        return <div>ready</div>;
      }
    `;

    const { programPath: exposeProgramPath, functionPath: exposeFunctionPath } =
      getFunctionContext(badExposeSource);

    assert.throws(() => {
      processStaticHoists({
        functionPath: exposeFunctionPath,
        node: exposeFunctionPath.node,
        renderStatements: [...exposeFunctionPath.node.body.body],
        programPath: exposeProgramPath,
        classMembers: [],
        options: {},
        getOrCreateModuleStaticHoistSymbol: createStaticSymbolFactory(),
      });
    }, /static expose = \.\.\. does not accept spread elements\./);

    const invalidPropertyOverrideSource = `
      function Card() {
        staticProps({
          bad: dynamicValue,
        });
        return <div>ready</div>;
      }
    `;

    const { programPath: propertyProgramPath, functionPath: propertyFunctionPath } =
      getFunctionContext(invalidPropertyOverrideSource);

    assert.throws(() => {
      processStaticHoists({
        functionPath: propertyFunctionPath,
        node: propertyFunctionPath.node,
        renderStatements: [...propertyFunctionPath.node.body.body],
        programPath: propertyProgramPath,
        classMembers: [],
        options: {},
        getOrCreateModuleStaticHoistSymbol: createStaticSymbolFactory(),
      });
    }, /static properties = \.\.\. values must be Lit property option objects or constructor references\./);

    const invalidPropertiesHoistSource = `
      function Card() {
        static properties = (() => ({
          title: String,
        }));
        return <div>ready</div>;
      }
    `;

    const { programPath: hoistedPropertiesProgramPath, functionPath: hoistedPropertiesFunctionPath } =
      getFunctionContext(invalidPropertiesHoistSource);

    assert.throws(() => {
      processStaticHoists({
        functionPath: hoistedPropertiesFunctionPath,
        node: hoistedPropertiesFunctionPath.node,
        renderStatements: [...hoistedPropertiesFunctionPath.node.body.body],
        programPath: hoistedPropertiesProgramPath,
        classMembers: [],
        options: {},
        getOrCreateModuleStaticHoistSymbol: createStaticSymbolFactory(),
      });
    }, /static properties = \.\.\. only accepts an object literal/);
  });

  it("ignores shadowRootOptions hoists when light DOM is requested", () => {
    const source = `
      function Card() {
        static lightDom = true;
        static shadowRootOptions = { delegatesFocus: true };
        return <div>ready</div>;
      }
    `;

    const { programPath, functionPath } = getFunctionContext(source);

    const result = processStaticHoists({
      functionPath,
      node: functionPath.node,
      renderStatements: [...functionPath.node.body.body],
      programPath,
      classMembers: [],
      options: {},
      getOrCreateModuleStaticHoistSymbol: createStaticSymbolFactory(),
    });

    assert.strictEqual(result.lightDomRequested, true);
    assert.ok(!result.hoistMembers.some((member) => member.key.name === "shadowRootOptions"));
  });

  it("creates direct static class members for legacy hoists and respects default light DOM mode", () => {
    const source = `
      const baseStyles = ":host { color: red; }";

      function Card() {
        staticProps({
          title: String,
        });

        staticStyles(baseStyles);

        return <div>ready</div>;
      }
    `;

    const { programPath, functionPath } = getFunctionContext(source);
    const classMembers = [];

    const result = processStaticHoists({
      functionPath,
      node: functionPath.node,
      renderStatements: [...functionPath.node.body.body],
      programPath,
      classMembers,
      options: { defaultDomMode: "light" },
      getOrCreateModuleStaticHoistSymbol: createStaticSymbolFactory(),
    });

    assert.strictEqual(result.lightDomRequested, true);
    assert.strictEqual(result.needsStaticHoistsMixin, false);
    assert.strictEqual(result.hoistMembers.length, 0);
    assert.strictEqual(result.hoistSymbolDeclarations.length, 0);
    assert.strictEqual(result.needsCss, true);
    assert.strictEqual(result.needsUnsafeCss, true);
    assert.strictEqual(classMembers.length, 2);
    assert.deepStrictEqual(
      classMembers.map((member) => member.key.name),
      ["properties", "styles"]
    );
    assert.strictEqual(classMembers[1].value.type, "TaggedTemplateExpression");
  });

  it("creates array-backed static style members when multiple legacy styles are present", () => {
    const source = `
      function Card() {
        staticStyles(":host { color: red; }");
        staticStyles(":host { display: block; }");
        return <div>ready</div>;
      }
    `;

    const { programPath, functionPath } = getFunctionContext(source);
    const classMembers = [];

    const result = processStaticHoists({
      functionPath,
      node: functionPath.node,
      renderStatements: [...functionPath.node.body.body],
      programPath,
      classMembers,
      options: {},
      getOrCreateModuleStaticHoistSymbol: createStaticSymbolFactory(),
    });

    assert.strictEqual(result.needsStaticHoistsMixin, false);
    assert.strictEqual(classMembers.length, 1);
    assert.strictEqual(classMembers[0].key.name, "styles");
    assert.strictEqual(classMembers[0].value.type, "ArrayExpression");
    assert.strictEqual(classMembers[0].value.elements.length, 2);
  });

  it("resolves generic hoists and merges legacy styles and properties into hoisted getters", () => {
    const source = `
      const baseStyles = ":host { color: red; }";

      function Card() {
        staticProps({
          count: Number,
        });
        staticStyles(baseStyles);
        static properties = {
          title: String,
        };
        static styles = ":host { display: block; }";
        static shadowRootOptions = { delegatesFocus: true };
        return <div>ready</div>;
      }
    `;

    const { programPath, functionPath } = getFunctionContext(source);
    const result = processStaticHoists({
      functionPath,
      node: functionPath.node,
      renderStatements: [...functionPath.node.body.body],
      programPath,
      classMembers: [],
      options: {},
      getOrCreateModuleStaticHoistSymbol: createStaticSymbolFactory(),
    });

    assert.strictEqual(result.needsStaticHoistsMixin, true);
    assert.strictEqual(result.hoistMembers.length, 3);

    const propertiesGetter = result.hoistMembers.find((member) => member.key.name === "properties");
    const stylesGetter = result.hoistMembers.find((member) => member.key.name === "styles");
    const shadowGetter = result.hoistMembers.find((member) => member.key.name === "shadowRootOptions");

    assert.ok(propertiesGetter);
    assert.ok(stylesGetter);
    assert.ok(shadowGetter);

    const propertiesResolver = propertiesGetter.body.body[0].argument.arguments[1].body;
    assert.strictEqual(propertiesResolver.callee.property.name, "__litsxMergeProperties");
    assert.strictEqual(propertiesResolver.arguments[0].properties.length, 1);
    assert.strictEqual(propertiesResolver.arguments[1].callee.property.name, "__litsxResolveStaticValue");

    const stylesResolver = stylesGetter.body.body[0].argument.arguments[1].body;
    assert.strictEqual(stylesResolver.operator, "||");
    assert.strictEqual(stylesResolver.left.callee.property.name, "__litsxResolveStaticValue");
    assert.strictEqual(stylesResolver.right.type, "TaggedTemplateExpression");
    assert.strictEqual(stylesResolver.right.tag.name, "css");

    const shadowResolver = shadowGetter.body.body[0].argument.arguments[1].body;
    assert.strictEqual(shadowResolver.callee.property.name, "__litsxResolveStaticValue");
  });

  it("rejects invalid lightDom, generic hoist, and expose method forms", () => {
    const lightDomSource = `
      function Card() {
        __litsx_static_lightDom("bad");
        return <div>ready</div>;
      }
    `;
    const { programPath: lightDomProgramPath, functionPath: lightDomFunctionPath } =
      getFunctionContext(lightDomSource);
    assert.throws(() => {
      processStaticHoists({
        functionPath: lightDomFunctionPath,
        node: lightDomFunctionPath.node,
        renderStatements: [...lightDomFunctionPath.node.body.body],
        programPath: lightDomProgramPath,
        classMembers: [],
        options: {},
        getOrCreateModuleStaticHoistSymbol: createStaticSymbolFactory(),
      });
    }, /static lightDom = true only accepts the literal value true\./);

    const genericAritySource = `
      function Card() {
        __litsx_static_shadowRootOptions({ mode: "open" }, { delegatesFocus: true });
        return <div>ready</div>;
      }
    `;
    const { programPath: genericProgramPath, functionPath: genericFunctionPath } =
      getFunctionContext(genericAritySource);
    assert.throws(() => {
      processStaticHoists({
        functionPath: genericFunctionPath,
        node: genericFunctionPath.node,
        renderStatements: [...genericFunctionPath.node.body.body],
        programPath: genericProgramPath,
        classMembers: [],
        options: {},
        getOrCreateModuleStaticHoistSymbol: createStaticSymbolFactory(),
      });
    }, /static shadowRootOptions = \.\.\. expects exactly one argument\./);

    const genericDynamicSource = `
      function Card() {
        static shadowRootOptions = factory();
        return <div>ready</div>;
      }
    `;
    const { programPath: genericDynamicProgramPath, functionPath: genericDynamicFunctionPath } =
      getFunctionContext(genericDynamicSource);
    assert.throws(() => {
      processStaticHoists({
        functionPath: genericDynamicFunctionPath,
        node: genericDynamicFunctionPath.node,
        renderStatements: [...genericDynamicFunctionPath.node.body.body],
        programPath: genericDynamicProgramPath,
        classMembers: [],
        options: {},
        getOrCreateModuleStaticHoistSymbol: createStaticSymbolFactory(),
      });
    }, /static shadowRootOptions = \.\.\. only accepts a direct static value\./);

    const exposeGetterSource = `
      function Card() {
        static expose = {
          get value() {
            return 1;
          },
        };
        return <div>ready</div>;
      }
    `;
    const { programPath: exposeGetterProgramPath, functionPath: exposeGetterFunctionPath } =
      getFunctionContext(exposeGetterSource);
    assert.throws(() => {
      processStaticHoists({
        functionPath: exposeGetterFunctionPath,
        node: exposeGetterFunctionPath.node,
        renderStatements: [...exposeGetterFunctionPath.node.body.body],
        programPath: exposeGetterProgramPath,
        classMembers: [],
        options: {},
        getOrCreateModuleStaticHoistSymbol: createStaticSymbolFactory(),
      });
    }, /static expose = \.\.\. only accepts plain methods\./);

    const exposeValueSource = `
      function Card() {
        static expose = {
          value: 1,
        };
        return <div>ready</div>;
      }
    `;
    const { programPath: exposeValueProgramPath, functionPath: exposeValueFunctionPath } =
      getFunctionContext(exposeValueSource);
    assert.throws(() => {
      processStaticHoists({
        functionPath: exposeValueFunctionPath,
        node: exposeValueFunctionPath.node,
        renderStatements: [...exposeValueFunctionPath.node.body.body],
        programPath: exposeValueProgramPath,
        classMembers: [],
        options: {},
        getOrCreateModuleStaticHoistSymbol: createStaticSymbolFactory(),
      });
    }, /static expose = \.\.\. values must be functions\./);

    const multiStylesResolverSource = `
      function Card() {
        staticStyles(":host { color: red; }");
        staticStyles(":host { display: block; }");
        static styles = ":host { background: blue; }";
        return <div>ready</div>;
      }
    `;
    const {
      programPath: multiStylesResolverProgramPath,
      functionPath: multiStylesResolverFunctionPath,
    } = getFunctionContext(multiStylesResolverSource);
    const multiStylesResult = processStaticHoists({
      functionPath: multiStylesResolverFunctionPath,
      node: multiStylesResolverFunctionPath.node,
      renderStatements: [...multiStylesResolverFunctionPath.node.body.body],
      programPath: multiStylesResolverProgramPath,
      classMembers: [],
      options: {},
      getOrCreateModuleStaticHoistSymbol: createStaticSymbolFactory(),
    });
    const stylesGetter = multiStylesResult.hoistMembers.find((member) => member.key.name === "styles");
    const stylesResolver = stylesGetter.body.body[0].argument.arguments[1].body;
    assert.strictEqual(stylesResolver.right.type, "ArrayExpression");
    assert.strictEqual(stylesResolver.right.elements.length, 2);
  });
});
