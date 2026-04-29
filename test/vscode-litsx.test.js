import assert from "assert";
import { createRequire } from "module";
import fs from "fs";
import os from "os";
import path from "path";
import { describe, it } from "vitest";

const extensionDir = path.resolve("packages/vscode-litsx");
const require = createRequire(import.meta.url);
const {
  detectLitsxSyntax,
  getStandardLanguageId,
  getSuggestedLitsxLanguageId,
} = require(path.join(extensionDir, "detect.cjs"));
const {
  computeLitsxCompletions,
  computeLitsxDiagnostics,
  computeLitsxHover,
  computeLitsxProjectCompletions,
  computeLitsxProjectDiagnostics,
  computeLitsxProjectHover,
} = require(path.join(extensionDir, "editor-support.cjs"));

function readJson(relativePath) {
  return JSON.parse(
    fs.readFileSync(path.join(extensionDir, relativePath), "utf8"),
  );
}

describe("vscode-litsx", () => {
  it("declares LitSX language ids, activation, and dedicated file extensions", () => {
    const manifest = readJson("package.json");

    assert.strictEqual(manifest.name, "vscode-litsx");
    assert.strictEqual(manifest.main, "./extension.cjs");
    assert.strictEqual(manifest.contributes.languages.length, 2);
    assert.strictEqual(manifest.contributes.grammars.length, 2);
    assert.deepStrictEqual(
      manifest.contributes.languages.map((language) => language.id).sort(),
      ["litsx", "litsx-jsx"],
    );
    assert.deepStrictEqual(
      manifest.contributes.languages.map((language) => language.extensions[0]).sort(),
      [".litsx", ".litsx.jsx"],
    );
    assert.ok(manifest.activationEvents.includes("onLanguage:typescriptreact"));
    assert.ok(manifest.activationEvents.includes("onLanguage:javascriptreact"));
    assert.ok(
      manifest.contributes.commands.some(
        (command) => command.command === "litsx.switchCurrentFileToLitsxMode",
      ),
    );
    assert.ok(
      manifest.contributes.commands.some(
        (command) => command.command === "litsx.resetCurrentFileLanguageMode",
      ),
    );
    assert.ok(
      manifest.contributes.commands.some(
        (command) => command.command === "litsx.dumpCurrentFileDiagnostics",
      ),
    );
    assert.strictEqual(
      manifest.contributes.configuration.properties["litsx.traceDiagnostics"].default,
      false,
    );
    assert.strictEqual(
      manifest.contributes.configurationDefaults["typescript.tsserver.useSeparateSyntaxServer"],
      false,
    );
    const tokenColorRules =
      manifest.contributes.configurationDefaults["editor.tokenColorCustomizations"].textMateRules;
    assert.ok(
      tokenColorRules.some((rule) => (
        Array.isArray(rule.scope) &&
        rule.scope.includes("keyword.operator.litsx") &&
        rule.scope.includes("entity.other.attribute-name.event.litsx") &&
        rule.scope.includes("entity.name.hoist.litsx") &&
        rule.settings?.fontStyle === "italic"
      )),
    );
  });

  it("includes LitSX attribute and hoist scopes in the jsx grammar", () => {
    const grammar = readJson("syntaxes/litsx-jsx.tmLanguage.json");
    const attributePatterns = grammar.repository["litsx-jsx-attributes"].patterns;
    const hoistPatterns = grammar.repository["litsx-hoists"].patterns;
    const tagAttributePatterns = grammar.repository["jsx-tag-attributes"].patterns;
    const litsxTagAttributePatterns = grammar.repository["litsx-jsx-tag-attribute"].patterns;
    const litsxTagAttribute = grammar.repository["litsx-jsx-tag-attribute"];
    const boolAttribute = grammar.repository["litsx-jsx-tag-bool-attribute"];
    const eventAttribute = grammar.repository["litsx-jsx-tag-event-attribute"];
    const propAttribute = grammar.repository["litsx-jsx-tag-prop-attribute"];
    assert.ok(attributePatterns.some((pattern) => pattern.match.includes("(@)")));
    assert.ok(attributePatterns.some((pattern) => pattern.match.includes("(\\?)")));
    assert.ok(attributePatterns.some((pattern) => pattern.match.includes("(\\.)")));
    assert.ok(hoistPatterns.some((pattern) => pattern.match.includes("(\\^)")));
    assert.strictEqual(
      hoistPatterns[0].captures[2].name,
      "markup.italic.litsx entity.name.hoist.litsx",
    );
    assert.deepStrictEqual(tagAttributePatterns[0], {
      include: "#litsx-jsx-tag-attribute",
    });
    assert.doesNotMatch(grammar.repository["jsx-tag"].begin, /\(\?!\\\?\)/);
    assert.strictEqual(boolAttribute.beginCaptures[2].name, "entity.other.attribute-name.boolean.litsx");
    assert.strictEqual(eventAttribute.beginCaptures[2].name, "entity.other.attribute-name.event.litsx");
    assert.strictEqual(propAttribute.beginCaptures[2].name, "entity.other.attribute-name.property.litsx");
    assert.match(boolAttribute.end, /\\s\*\/\?>\(\?=\\s\*\(\?:\$/);
    assert.deepStrictEqual(boolAttribute.patterns.at(-1), {
      include: "#litsx-jsx-evaluated-code",
    });
    assert.deepStrictEqual(litsxTagAttributePatterns[0], {
      include: "#litsx-jsx-tag-bool-attribute",
    });
  });

  it("treats ^styles templates as embedded css in the litsx grammar", () => {
    const grammar = readJson("syntaxes/litsx.tmLanguage.json");
    const stylesPattern = grammar.repository["litsx-styles-css"].patterns[0];

    assert.match(stylesPattern.begin, /\^/);
    assert.match(stylesPattern.begin, /styles/);
    assert.strictEqual(stylesPattern.contentName, "meta.embedded.block.css");
    assert.deepStrictEqual(stylesPattern.patterns, [{ include: "#litsx-css-root" }]);
    assert.ok(grammar.repository["litsx-css-root"]);
  });

  it("detects LitSX-authored syntax in standard tsx/jsx files", () => {
    assert.strictEqual(
      detectLitsxSyntax(`const view = <button @click={handleClick} .value={value} ?disabled={busy} />;`),
      true,
    );
    assert.strictEqual(
      detectLitsxSyntax(`const view = () => {\n  ^styles(\`button { color: red; }\`);\n  return <button />;\n};`),
      true,
    );
    assert.strictEqual(
      detectLitsxSyntax(`const view = <button onClick={handleClick} disabled={busy} />;`),
      false,
    );
    assert.strictEqual(getSuggestedLitsxLanguageId("typescriptreact"), "litsx");
    assert.strictEqual(getSuggestedLitsxLanguageId("javascriptreact"), "litsx-jsx");
    assert.strictEqual(getSuggestedLitsxLanguageId("typescript"), null);
    assert.strictEqual(getStandardLanguageId("litsx"), "typescriptreact");
    assert.strictEqual(getStandardLanguageId("litsx-jsx"), "javascriptreact");
    assert.strictEqual(getStandardLanguageId("typescriptreact"), null);
  });

  it("computes authored diagnostics for LitSX language modes", async () => {
    const tsxDiagnostics = await computeLitsxDiagnostics(
      `const view = <button @clcik={() => save()} />;`,
      "litsx",
    );
    const jsxDiagnostics = await computeLitsxDiagnostics(
      `const view = <button ?disbled={busy} />;`,
      "litsx-jsx",
    );

    assert.ok(tsxDiagnostics.some((diagnostic) => diagnostic.code === 91006));
    assert.ok(jsxDiagnostics.some((diagnostic) => diagnostic.code === 91005));
  });

  it("computes authored hover and completions for LitSX language modes", async () => {
    const sourceText = `const view = <button @cl />;\n^styles(\`button {}\`);`;
    const attributePosition = sourceText.indexOf("@cl") + 2;
    const hoistPosition = sourceText.indexOf("^styles") + 1;

    const hover = await computeLitsxHover(sourceText, "litsx", attributePosition);
    const hoistHover = await computeLitsxHover(sourceText, "litsx", hoistPosition);
    const completions = await computeLitsxCompletions(sourceText, "litsx", attributePosition + 1, {
      CompletionItemKind: {
        Event: 23,
        Property: 10,
      },
    });

    assert.match(hover.code, /@cl/);
    assert.match(hover.documentation, /LitSX event listener binding/);
    assert.match(hoistHover.code, /\^styles/);
    assert.ok(completions.some((entry) => entry.label === "@click"));
  });

  it("uses project-backed TypeScript support for .litsx files", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "litsx-vscode-"));
    const filePath = path.join(tempDir, "component.litsx");
    const sourceText = [
      "const count: number = 1;",
      "const broken: number = 'nope';",
      "const view = <button>{cou}</button>;",
      "",
    ].join("\n");

    fs.writeFileSync(
      path.join(tempDir, "tsconfig.json"),
      JSON.stringify({
        compilerOptions: {
          jsx: "preserve",
          target: "ES2022",
          module: "ESNext",
          strict: true,
        },
        include: ["component.litsx"],
      }),
    );
    fs.writeFileSync(filePath, sourceText);

    const diagnostics = await computeLitsxProjectDiagnostics(filePath, sourceText, "litsx");
    const hover = await computeLitsxProjectHover(
      filePath,
      sourceText,
      "litsx",
      sourceText.indexOf("count") + 1,
    );
    const completions = await computeLitsxProjectCompletions(
      filePath,
      sourceText,
      "litsx",
      sourceText.indexOf("cou") + 3,
      {
        CompletionItemKind: {
          Keyword: 14,
          Variable: 6,
          Property: 10,
          Function: 3,
          Class: 7,
          Interface: 8,
          Module: 9,
          Text: 0,
          Event: 23,
        },
      },
    );

    assert.ok(diagnostics.some((diagnostic) => diagnostic.code === 2322));
    assert.match(hover.code, /const count: number/);
    assert.ok(completions.some((entry) => entry.label === "count"));
  });

  it("filters raw TypeScript diagnostics on authored binding names", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "litsx-vscode-"));
    const filePath = path.join(tempDir, "component.litsx");
    const sourceText = [
      'import { useState } from "litsx";',
      "export const X = () => {",
      "  const [count] = useState(0);",
      "  return <input .valuee={count} @focus={()=>{}} />;",
      "};",
      "",
    ].join("\n");

    fs.writeFileSync(
      path.join(tempDir, "tsconfig.json"),
      JSON.stringify({
        compilerOptions: {
          jsx: "react-jsx",
          jsxImportSource: "litsx",
          target: "ES2022",
          module: "ESNext",
        },
        include: ["component.litsx"],
      }),
    );
    fs.writeFileSync(filePath, sourceText);

    const diagnostics = await computeLitsxProjectDiagnostics(filePath, sourceText, "litsx");

    assert.ok(diagnostics.some((diagnostic) => diagnostic.code === 91004));
    assert.ok(
      diagnostics.every((diagnostic) => !String(diagnostic.messageText).includes("@focus")),
    );
  });

  it("keeps diagnostics on the correct authored attribute when multiple bindings are present", async () => {
    const filePath = path.resolve("packages/dx-smoke-app/src/dx-smoke-app.litsx");
    const sourceText = '<input .valuee={count} @focus={()=>{}} />';

    const diagnostics = await computeLitsxProjectDiagnostics(filePath, sourceText, "litsx");

    assert.ok(diagnostics.some((diagnostic) => diagnostic.code === 91004));
    assert.deepStrictEqual(
      diagnostics
        .filter((diagnostic) => diagnostic.code === 91004)
        .map((diagnostic) => [diagnostic.start, diagnostic.length]),
      [[7, 7]],
    );
  });

  it("reports authored diagnostics on later attributes in the same opening tag", async () => {
    const filePath = path.resolve("packages/dx-smoke-app/src/dx-smoke-app.litsx");
    const sourceText = '<button @blur={()=>{}} @clcik={() => setCount((v) => v + 1)} />';

    const diagnostics = await computeLitsxProjectDiagnostics(filePath, sourceText, "litsx");

    assert.ok(diagnostics.some((diagnostic) => diagnostic.code === 91006));
    assert.ok(
      diagnostics.some(
        (diagnostic) => diagnostic.start === 23 && diagnostic.length === 6,
      ),
    );
  });
});
