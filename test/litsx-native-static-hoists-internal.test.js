import assert from "assert";
import babelTraverse from "@babel/traverse";
import * as t from "@babel/types";
import parser from "./helpers/litsx-parser.js";
import {
  assertStaticHoistsStayTopLevel,
  processStaticHoists,
  setStaticHoistsBabelTypes,
} from "../packages/babel-preset-litsx/src/internal/transform-litsx-static-hoists.js";
import {
  buildClassMembers,
  createComponentClass,
  setClassGenerationBabelTypes,
} from "../packages/babel-preset-litsx/src/internal/transform-litsx-class-generation.js";
import {
  buildStableIdentitySeed,
  createStableIdentity,
  hashStableIdentity,
  normalizeStableIdentityPath,
} from "../packages/babel-preset-litsx/src/internal/stable-identity.js";
import {
  attachStaticIr,
  collectStaticIr,
  consumeStaticIr,
  ensureStaticIr,
  getStaticIr,
  normalizeStaticIr,
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

setStaticHoistsBabelTypes(t);
setStaticIrBabelTypes(t);
setPropertyBabelTypes(t);
setClassGenerationBabelTypes(t);

describe("native static component metadata internals", () => {
  it("creates stable identities from source locations and filename fallbacks", () => {
    const pathLike = { node: { start: 12, loc: { start: { line: 3, column: 4 } } } };
    const state = {
      file: {
        opts: {
          sourceFileName: "src\\card.tsx",
          filename: "ignored.tsx",
        },
      },
      filename: "also-ignored.tsx",
    };

    assert.strictEqual(normalizeStableIdentityPath("src\\card.tsx"), "src/card.tsx");
    assert.strictEqual(buildStableIdentitySeed(pathLike, state), "src/card.tsx:3:4:12");
    assert.strictEqual(buildStableIdentitySeed({ node: {} }, {}), ":0:0:0");
    assert.strictEqual(hashStableIdentity("card"), hashStableIdentity("card"));
    assert.notStrictEqual(hashStableIdentity("card"), hashStableIdentity("badge"));
    assert.match(createStableIdentity("litsx-", pathLike, state), /^litsx-[a-z0-9]+$/);
  });

  it("builds generated component classes with defaults, mixins, and hydration metadata", () => {
    const classMembers = [t.classProperty(t.identifier("staticValue"), t.numericLiteral(1))];
    classMembers[0].static = true;
    const members = buildClassMembers({
      classMembers,
      defaults: new Map([["title", t.stringLiteral("Untitled")]]),
      renderStatements: [t.returnStatement(t.stringLiteral("ready"))],
      handlerInfos: [{ name: "onSave" }],
      createHandlerClassMember: (handler) => t.classMethod(
        "method",
        t.identifier(handler.name),
        [],
        t.blockStatement([]),
      ),
    });
    assert.strictEqual(members.findIndex((member) => member.kind === "constructor"), 1);
    assert.strictEqual(members.at(-1).key.name, "render");

    const classNode = createComponentClass({
      className: "FeatureCard",
      classMembers: members,
      hoistMembers: [t.classProperty(t.identifier("styles"), t.stringLiteral(""))],
      hostTypeId: "feature-card:1",
      needsPropertyDeclarationMerge: true,
      lightDomRequested: true,
      needsCss: true,
      needsUnsafeCss: true,
      needsCallbackRef: true,
      needsModuleIdMetadata: true,
      moduleId: "module:feature-card",
    });

    assert.strictEqual(classNode.superClass.callee.name, "LightDomMixin");
    assert.strictEqual(classNode.superClass.arguments[0].name, "LitElement");
    assert.strictEqual(classNode._needsPropertyDeclarationMerge, true);
    assert.strictEqual(classNode._needsCss, true);
    assert.strictEqual(classNode._needsUnsafeCss, true);
    assert.strictEqual(classNode._needsCallbackRef, true);
    assert.strictEqual(classNode._needsModuleIdMetadata, true);
    assert.strictEqual(classNode._litsxStaticSymbolDeclarations, undefined);
  });

  it("builds minimal generated component classes without optional metadata", () => {
    const classNode = createComponentClass({
      className: "PlainCard",
      classMembers: [],
      hoistMembers: [],
      hostTypeId: null,
      needsPropertyDeclarationMerge: false,
      lightDomRequested: false,
      needsCss: false,
      needsUnsafeCss: false,
    });

    assert.strictEqual(classNode.superClass.name, "LitElement");
    assert.strictEqual(classNode.body.body.length, 0);
    assert.strictEqual(classNode._needsCss, false);
    assert.strictEqual(classNode._needsModuleIdMetadata, false);
  });

  it("normalizes current static IR without restoring removed legacy metadata", () => {
    const expression = t.identifier("title");
    const partial = {
      properties: {
        inferred: [{ index: 0, expression }],
        authored: [{ index: 1 }],
      },
      elements: {
        localCandidates: ["LocalCard"],
        importedCandidates: [null, { tagName: "remote-card" }],
      },
      lightDom: 1,
    };
    const normalized = normalizeStaticIr(partial);

    assert.notStrictEqual(normalized.properties.inferred[0].expression, expression);
    assert.strictEqual(normalized.properties.authored[0].expression, null);
    assert.strictEqual(normalized.properties.legacy, undefined);
    assert.deepStrictEqual(normalized.elements.importedCandidates, [null, { tagName: "remote-card" }]);
    assert.notStrictEqual(normalized.elements.importedCandidates[1], partial.elements.importedCandidates[1]);
    assert.strictEqual(normalized.lightDom, true);
    assert.deepStrictEqual(normalizeStaticIr().properties.inferred, []);

    const node = {};
    const attached = attachStaticIr(node, partial);
    const read = getStaticIr(node);
    const consumed = consumeStaticIr(node);
    assert(attached);
    assert(read);
    assert(consumed);
    assert.strictEqual(getStaticIr(node), null);
    assert.strictEqual(attachStaticIr(null, partial), null);
    assert.strictEqual(consumeStaticIr(null), null);
  });

  it("creates IR for incomplete transform inputs", () => {
    const empty = ensureStaticIr(null);
    const node = {};
    const ensured = ensureStaticIr(node);
    const fromArrayCandidates = collectStaticIr({
      functionPath: {},
      elementCandidates: ["Card", "Badge"],
      importedElementCandidates: [],
    });

    assert.deepStrictEqual(empty.elements.localCandidates, []);
    assert.strictEqual(ensured, node._litsxStaticIr);
    assert.deepStrictEqual(fromArrayCandidates.elements.localCandidates, ["Card", "Badge"]);
    assert.deepStrictEqual(fromArrayCandidates.properties.authored, []);
    assert.strictEqual(setStaticIrInferredProperties(null, []), null);
  });

  it("collects early static IR for properties, elements, and light DOM", () => {
    const source = `
      function Card() {
        __litsx_static_properties({
          title: String,
        });

        __litsx_static_lightDom(true);

        return <ChildCard />;
      }
    `;

    const { functionPath } = getFunctionContext(source);
    const ir = collectStaticIr({
      functionPath,
      elementCandidates: new Set(["ChildCard"]),
      importedElementCandidates: [
        {
          sourceFile: "/project/child-card.tsx",
          importedName: "ChildCard",
          tagName: "child-card",
        },
      ],
    });

    assert.strictEqual(ir.properties.authored.length, 1);
    assert.strictEqual(ir.properties.authored[0].index, 0);
    assert.deepStrictEqual(ir.elements.localCandidates, ["ChildCard"]);
    assert.deepStrictEqual(ir.elements.importedCandidates, [
      {
        sourceFile: "/project/child-card.tsx",
        importedName: "ChildCard",
        tagName: "child-card",
      },
    ]);
    assert.strictEqual(ir.lightDom, true);
  });

  it("processes static properties from early static IR", () => {
    const source = `
      function Card() {
        __litsx_static_properties({
          title: String,
        });

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
    });

    assert.strictEqual(renderStatements.length, 1);
    assert.strictEqual(classMembers.length, 1);
    const propertiesField = classMembers.find((member) => member.key.name === "properties");
    assert.deepStrictEqual(
      propertiesField.value.properties
        .filter((node) => t.isObjectProperty(node))
        .map((node) => (t.isIdentifier(node.key) ? node.key.name : node.key.value))
        .sort(),
      ["inferred", "title"]
    );
    assert.deepStrictEqual(result.hoistMembers, []);
  });

  it("collects generated static IR members and marks css requirements", () => {
    const source = `
      const gap = "12px";

      function Card() {
        __litsx_static_properties({
          title: String,
          count: { reflect: true },
          payload: { type: Object, attribute: false },
        });

        __litsx_static_styles_value(css\`
          :host {
            gap: \${gap};
          }
        \`);

        __litsx_static_shadowRootOptions({ delegatesFocus: true });

        __litsx_static_expose({
          ping() {
            return "pong";
          },
          compute: (value) => value + 1,
        });

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
    });

    assert.strictEqual(result.lightDomRequested, false);
    assert.strictEqual(result.needsPropertyDeclarationMerge, false);
    assert.strictEqual(result.needsCss, false);
    assert.strictEqual(result.needsUnsafeCss, false);
    assert.strictEqual(result.hoistSymbolDeclarations, undefined);
    assert.strictEqual(classMembers.length, 1);
    assert.strictEqual(renderStatements.length, 1);

    const propertiesField = classMembers.find((member) => member.key.name === "properties");
    const propertyNames = propertiesField.value.properties
      .filter((node) => t.isObjectProperty(node))
      .map((node) => (t.isIdentifier(node.key) ? node.key.name : node.key.value))
      .sort();
    assert.deepStrictEqual(propertyNames, ["count", "initial", "payload", "title"]);

    const memberNames = result.hoistMembers.map((member) => member.key.name).sort();
    assert.deepStrictEqual(memberNames, [
      "compute",
      "ping",
      "shadowRootOptions",
      "styles",
    ]);

    const stylesField = result.hoistMembers.find((member) => member.key.name === "styles");
    const shadowRootOptionsField = result.hoistMembers.find(
      (member) => member.key.name === "shadowRootOptions"
    );
    const pingMethod = result.hoistMembers.find((member) => member.key.name === "ping");
    const computeMethod = result.hoistMembers.find((member) => member.key.name === "compute");

    assert.ok(propertiesField);
    assert.ok(stylesField);
    assert.ok(shadowRootOptionsField);
    assert.ok(pingMethod);
    assert.ok(computeMethod);
    assert.strictEqual(propertiesField.static, true);
    assert.strictEqual(stylesField.static, true);
    assert.strictEqual(shadowRootOptionsField.static, true);
    assert.strictEqual(pingMethod.static, true);
    assert.strictEqual(computeMethod.static, true);
    assert.strictEqual(computeMethod.async, false);
    assert.strictEqual(computeMethod.generator, false);
  });

  it("accepts top-level static IR and rejects nested calls", () => {
    const okSource = `
      function Card() {
        __litsx_static_styles_value(css\`:host { display: block; }\`);
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
          __litsx_static_styles_value(css\`:host { display: block; }\`);
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
        __litsx_static_styles_value(() => ":host { display: block; }");
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
      });
    }, /Component\.styles must be a Lit CSSResultGroup/);

    const badExposeSource = `
      function Card() {
        __litsx_static_expose({
          ...helpers,
        });
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
      });
    }, /Component\.expose = \.\.\. does not accept spread elements\./);

    const invalidPropertiesHoistSource = `
      function Card() {
        __litsx_static_properties(() => ({
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
      });
    }, /Component\.properties = \.\.\. only accepts an object literal/);
  });

  it("ignores shadowRootOptions hoists when light DOM is requested", () => {
    const source = `
      function Card() {
        __litsx_static_lightDom(true);
        __litsx_static_shadowRootOptions({ delegatesFocus: true });
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
    });

    assert.strictEqual(result.lightDomRequested, true);
    assert.ok(!result.hoistMembers.some((member) => member.key.name === "shadowRootOptions"));
  });

  it("emits direct static metadata fields and inherited styles", () => {
    const source = `
      const baseStyles = ":host { color: red; }";

      function Card() {
        __litsx_static_properties({
          title: String,
        });
        __litsx_static_styles_value(css\`:host { display: block; }\`);
        __litsx_static_shadowRootOptions({ delegatesFocus: true });
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
    });

    assert.strictEqual(result.needsPropertyDeclarationMerge, false);
    assert.strictEqual(result.hoistMembers.length, 2);

    const propertiesField = classMembers.find((member) => member.key.name === "properties");
    const stylesField = result.hoistMembers.find((member) => member.key.name === "styles");
    const shadowField = result.hoistMembers.find((member) => member.key.name === "shadowRootOptions");

    assert.ok(propertiesField);
    assert.ok(stylesField);
    assert.ok(shadowField);
    assert.strictEqual(propertiesField.value.properties.length, 1);
    assert.strictEqual(stylesField.value.elements[0].left.object.type, "Super");
    assert.strictEqual(shadowField.value.properties[0].key.name, "delegatesFocus");
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
      });
    }, /Component\.lightDom = true only accepts the literal value true\./);

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
      });
    }, /Component\.shadowRootOptions = \.\.\. expects exactly one value\./);

    const genericDynamicSource = `
      function Card() {
        __litsx_static_shadowRootOptions(factory());
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
      });
    }, /Component\.shadowRootOptions = \.\.\. only accepts a direct static value\./);

    const exposeGetterSource = `
      function Card() {
        __litsx_static_expose({
          get value() {
            return 1;
          },
        });
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
      });
    }, /Component\.expose = \.\.\. only accepts plain methods\./);

    const exposeValueSource = `
      function Card() {
        __litsx_static_expose({
          value: 1,
        });
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
      });
    }, /Component\.expose = \.\.\. values must be functions\./);

  });
});
