import assert from "node:assert/strict";
import * as t from "@babel/types";
import babelTraverse from "@babel/traverse";
import { describe, it } from "vitest";
import parser from "./helpers/litsx-parser.js";
import {
  appendStyles,
  collectGuardCandidates,
  composeStyles,
  consumeGuard,
  findCssImport,
  findStaticStylesMember,
  getReplaceStylesArgument,
  getStylesAssignment,
  guardTemplate,
  inheritedStylesExpression,
  insertAfterImports,
  wildcardPattern,
  withTailwindCompiler,
} from "../packages/tailwind/src/compiler.js";
import { createTailwindGuardMarker } from "../packages/tailwind/src/protocol.js";

const traverse = babelTraverse.default || babelTraverse;

function inspect(source) {
  const ast = parser.parse(source, {
    sourceType: "module",
    plugins: ["jsx", "typescript"],
  });
  let program;
  const classes = [];
  traverse(ast, {
    Program(path) {
      program = path;
    },
    Class(path) {
      classes.push(path);
    },
  });
  return { ast, program, classes };
}

describe("Tailwind compiler helper branches", () => {
  it("inserts nodes after imports or at the start and ignores empty additions", () => {
    const imported = inspect('import "first"; const value = 1;').program;
    insertAfterImports(imported, [], t);
    insertAfterImports(imported, [
      t.expressionStatement(t.stringLiteral("after")),
    ]);
    assert.equal(imported.node.body[1].expression.value, "after");

    const plain = inspect("const value = 1;").program;
    insertAfterImports(plain, [
      t.expressionStatement(t.stringLiteral("before")),
    ]);
    assert.equal(plain.node.body[0].expression.value, "before");
  });

  it("finds and composes static style declarations in every supported shape", () => {
    const sample = inspect(`
      class Missing {}
      class Property { static styles = base; }
      class ArrayProperty { static styles = [base, null]; }
      class Getter { static get styles() { return base; } }
      class EmptyGetter { static get styles() {} }
      class EmptyProperty { static styles; }
      class Computed { static ["styles"] = base; }
    `);
    assert.equal(findStaticStylesMember(sample.classes[0], t), null);
    assert(findStaticStylesMember(sample.classes[1], t).isClassProperty());
    assert.equal(findStaticStylesMember(sample.classes[6], t), null);
    assert.equal(inheritedStylesExpression(t).operator, "??");
    assert.equal(
      composeStyles(null, [t.identifier("before")], [t.identifier("after")], t)
        .elements.length,
      2,
    );
    assert.equal(
      composeStyles(t.identifier("base"), [], [t.identifier("after")], t)
        .elements.length,
      2,
    );
    assert.equal(
      composeStyles(t.arrayExpression([t.identifier("base"), null]), [], [], t)
        .elements.length,
      2,
    );

    for (const classPath of sample.classes.slice(0, 6)) {
      appendStyles(
        classPath,
        t.identifier("preflight"),
        t.identifier("utility"),
        t,
      );
    }
    assert.equal(
      findStaticStylesMember(sample.classes[0], t).node.value.elements.length,
      3,
    );
    assert.equal(
      findStaticStylesMember(sample.classes[1], t).node.value.elements.length,
      3,
    );
    assert.equal(
      findStaticStylesMember(sample.classes[2], t).node.value.elements.length,
      4,
    );
    assert.equal(
      findStaticStylesMember(sample.classes[3], t).get("body.body.0.argument")
        .node.elements.length,
      3,
    );
  });

  it("recognizes replaceStyles assignments and imported css aliases", () => {
    const sample = inspect(`
      import coreDefault, { css as localCss, replaceStyles as swap } from "@litsx/core";
      import { css as otherCss, replaceStyles as otherSwap } from "other";
      const guarded = "p-4";
      Card.styles = swap(guarded);
      Card["styles"] = guarded;
      Card.other = guarded;
      getOwner().styles = guarded;
      Card.styles += guarded;
    `);
    assert.equal(findCssImport(sample.program, t).name, "localCss");
    assert.equal(
      findCssImport(inspect('import { css } from "other";').program, t),
      null,
    );

    const statements = sample.program.get("body");
    const assignment = getStylesAssignment(statements[3], t);
    assert.equal(assignment.owner, "Card");
    assert.equal(assignment.stylePath.node.name, "guarded");
    assert.equal(getStylesAssignment(statements[4], t).owner, "Card");
    assert.equal(getStylesAssignment(statements[5], t), null);
    assert.equal(getStylesAssignment(statements[6], t), null);
    assert.equal(getStylesAssignment(statements[7], t), null);
    assert.equal(getStylesAssignment(statements[2], t), null);
    assert.equal(getReplaceStylesArgument(null, t), null);
    assert.equal(
      getReplaceStylesArgument(
        inspect("fn(a, b);").program.get("body.0.expression"),
        t,
      ),
      null,
    );
    assert.equal(
      getReplaceStylesArgument(sample.program.get("body.3.expression.right"), t)
        .node.name,
      "guarded",
    );
    assert.equal(
      getReplaceStylesArgument(sample.program.get("body.1.specifiers.1"), t),
      null,
    );
  });

  it("consumes arrays, spreads, static guards, and inert guard kinds", () => {
    const staticSample = inspect("const first = ['p-4', ...second];");
    const firstPath = staticSample.program.get("body.0.declarations.0.init");
    const replacements = [];
    consumeGuard(
      firstPath,
      {
        resolveNode(node) {
          return { kind: "static", candidates: [node.value], dependencies: [] };
        },
        resolveLocal(name) {
          return name === "second"
            ? { kind: "static", candidates: ["m-2"], dependencies: ["dep.js"] }
            : { kind: "external" };
        },
      },
      () => t.identifier("css"),
      "Card",
      t,
    );
    firstPath.traverse({
      TaggedTemplateExpression(path) {
        replacements.push(path.node);
      },
    });
    assert.equal(replacements.length, 2);

    for (const kind of ["runtime", "external"]) {
      const inert = inspect("const value = guard;").program.get(
        "body.0.declarations.0.init",
      );
      consumeGuard(
        inert,
        {
          resolveLocal() {
            return { kind };
          },
        },
        () => t.identifier("css"),
        "Card",
        t,
      );
      assert.equal(inert.node.name, "guard");
    }

    const unsupported = inspect("const value = guard;").program.get(
      "body.0.declarations.0.init",
    );
    assert.throws(
      () =>
        consumeGuard(
          unsupported,
          {
            resolveLocal() {
              return { kind: "unknown" };
            },
          },
          () => t.identifier("css"),
          "Card",
          t,
        ),
      /must be finite static strings/u,
    );
    const failure = inspect("const value = guard;").program.get(
      "body.0.declarations.0.init",
    );
    assert.throws(
      () =>
        consumeGuard(
          failure,
          {
            resolveLocal() {
              throw new Error("broken guard");
            },
          },
          () => t.identifier("css"),
          "Card",
          t,
        ),
      /could not statically resolve/u,
    );
  });

  it("collects encoded guards, creates templates, and escapes wildcard patterns", () => {
    const marker = createTailwindGuardMarker({
      candidates: ["p-4", "p-4"],
      dependencies: ["dep.js", "dep.js"],
    });
    const emptyMarker = createTailwindGuardMarker({});
    const sample = inspect(
      `class Card { static styles = css\`${marker} ${emptyMarker} plain\`; }`,
    );
    const collected = collectGuardCandidates(sample.classes[0]);
    assert.deepEqual(collected, {
      candidates: ["p-4"],
      dependencies: ["dep.js"],
    });
    assert.doesNotMatch(
      sample.classes[0].toString(),
      /__LITSX_TAILWIND_GUARD_/u,
    );
    assert.match(
      guardTemplate({ candidates: ["p-2"] }, t.identifier("css"), t).quasi
        .quasis[0].value.raw,
      /__LITSX_TAILWIND_GUARD_/u,
    );
    const pattern = wildcardPattern("bg-[x].+\u0000/50");
    assert(pattern.test("bg-[x].+red/50"));
    assert(!pattern.test("bg-x-red/50"));
  });

  it("merges compiler options across React modes and plugin list shapes", () => {
    const context = { register() {}, safelist: [] };
    const defaults = withTailwindCompiler({}, context);
    assert.equal(defaults.authoringPlugins.length, 1);
    assert.equal(defaults.outputPlugins.length, 1);
    assert.equal(defaults.lightDomStyles, undefined);

    const compat = withTailwindCompiler(
      {
        reactCompat: true,
        authoringPlugins: ["author"],
        outputPlugins: ["output"],
      },
      context,
    );
    assert.equal(compat.lightDomStyles, "global");
    assert.deepEqual(compat.authoringPlugins.slice(0, 1), ["author"]);
    assert.deepEqual(compat.outputPlugins.slice(0, 1), ["output"]);

    const objectCompat = withTailwindCompiler(
      {
        reactCompat: { domMode: "shadow" },
        authoringPlugins: "no",
        outputPlugins: "no",
      },
      context,
    );
    assert.equal(objectCompat.lightDomStyles, "global");
    assert.equal(objectCompat.authoringPlugins.length, 1);
    assert.equal(objectCompat.outputPlugins.length, 1);
    assert.equal(
      withTailwindCompiler({ reactCompat: { domMode: null } }, context)
        .lightDomStyles,
      "global",
    );
  });
});
