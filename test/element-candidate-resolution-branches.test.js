import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import * as t from "@babel/types";
import { afterEach, describe, it } from "vitest";
import {
  annotateElementCandidates,
  cloneCandidateResult,
  createCompilerContextResolver,
  createEmptyCandidateResult,
  hasSupportedExtension,
  isRelativeSpecifier,
  mergeCandidateResults,
  resolveImportSource,
  setElementCandidatesBabelTypes,
  toImportRecordKey,
  toRelativeModuleSpecifier,
} from "../packages/babel-preset-litsx/src/internal/transform-litsx-element-candidates.js";

setElementCandidatesBabelTypes(t);
const tempDirs = [];
afterEach(() => {
  for (const directory of tempDirs.splice(0)) fs.rmSync(directory, { recursive: true, force: true });
});

function fixture() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "litsx-candidates-"));
  tempDirs.push(directory);
  fs.mkdirSync(path.join(directory, "feature"));
  fs.mkdirSync(path.join(directory, "mapped"));
  fs.writeFileSync(path.join(directory, "direct.tsx"), "export {};");
  fs.writeFileSync(path.join(directory, "extension.js"), "export {};");
  fs.writeFileSync(path.join(directory, "feature", "index.jsx"), "export {};");
  fs.writeFileSync(path.join(directory, "mapped", "card.ts"), "export {};");
  return directory;
}

describe("element candidate resolution branch behavior", () => {
  it("manages candidate results, annotations, keys, and relative paths", () => {
    assert.equal(isRelativeSpecifier(null), false);
    assert.equal(isRelativeSpecifier("package"), false);
    assert.equal(isRelativeSpecifier("./local"), true);
    assert.equal(isRelativeSpecifier("../parent"), true);
    assert.equal(isRelativeSpecifier("/absolute"), true);
    assert.equal(hasSupportedExtension("view.tsx"), true);
    assert.equal(hasSupportedExtension("view.mjs"), false);
    assert.equal(toRelativeModuleSpecifier("/a/root.ts", "/a/card.ts"), "./card.ts");
    assert.equal(toRelativeModuleSpecifier("/a/root.ts", "/other/card.ts"), "../other/card.ts");
    assert.equal(toImportRecordKey({ sourceFile: "a", importedName: "B", tagName: "b-card" }), "a:B:b-card");

    const target = createEmptyCandidateResult();
    target.localCandidates.add("first-card");
    target.importedCandidates.set("first", { tagName: "first-card" });
    const source = createEmptyCandidateResult();
    source.localCandidates.add("second-card");
    source.importedCandidates.set("first", { tagName: "ignored-card" });
    source.importedCandidates.set("second", { tagName: "second-card" });
    mergeCandidateResults(target, source);
    assert.deepEqual([...target.localCandidates], ["first-card", "second-card"]);
    assert.equal(target.importedCandidates.get("first").tagName, "first-card");
    assert.equal(target.importedCandidates.size, 2);
    const clone = cloneCandidateResult(target);
    clone.localCandidates.add("clone-card");
    assert.equal(target.localCandidates.has("clone-card"), false);
    assert.equal(cloneCandidateResult(null).localCandidates.size, 0);

    annotateElementCandidates(null, target);
    const node = {};
    annotateElementCandidates(node, target);
    assert.deepEqual(node._litsxStaticIr.elements.localCandidates, ["first-card", "second-card"]);
  });

  it("resolves explicit, extensionless, directory, absolute, missing, and cached imports", () => {
    const directory = fixture();
    const from = path.join(directory, "entry.tsx");
    const context = { resolvedImportCache: new Map() };
    assert.equal(resolveImportSource(from, "./direct.tsx", context), path.join(directory, "direct.tsx"));
    assert.equal(resolveImportSource(from, "./extension", context), path.join(directory, "extension.js"));
    assert.equal(resolveImportSource(from, "./feature", context), path.join(directory, "feature/index.jsx"));
    assert.equal(resolveImportSource(from, path.join(directory, "direct.tsx"), context), path.join(directory, "direct.tsx"));
    assert.equal(resolveImportSource(from, "./missing", context), null);
    assert.equal(resolveImportSource("", "./direct", context), null);
    fs.rmSync(path.join(directory, "direct.tsx"));
    assert.equal(resolveImportSource(from, "./direct.tsx", context), path.join(directory, "direct.tsx"));
  });

  it("resolves exact and wildcard TypeScript path aliases and skips malformed substitutions", () => {
    const directory = fixture();
    const from = path.join(directory, "src", "entry.tsx");
    const cache = new Map();
    const compilerOptions = {
      baseUrl: directory,
      paths: {
        exact: ["mapped/card"],
        "@ui/*": [null, "bad/*/again/*", "mapped/*"],
        "@suffix/*/end": ["mapped/*"],
        miss: ["missing"],
      },
    };
    const context = {
      resolvedImportCache: cache,
      getCompilerOptions: () => compilerOptions,
      getModuleResolutionHost: () => ({ fileExists: () => false, readFile: () => undefined }),
    };
    assert.equal(resolveImportSource(from, "exact", context), path.join(directory, "mapped/card.ts"));
    assert.equal(resolveImportSource(from, "@ui/card", context), path.join(directory, "mapped/card.ts"));
    assert.equal(resolveImportSource(from, "@suffix/card/end", context), path.join(directory, "mapped/card.ts"));
    assert.equal(resolveImportSource(from, "@suffix/card/no", context), null);
    assert.equal(resolveImportSource(from, "miss", context), null);

    const relativeBase = {
      resolvedImportCache: new Map(),
      getCompilerOptions: () => ({ baseUrl: "..", paths: { card: [path.relative(path.join(directory, "src", ".."), path.join(directory, "mapped/card"))] } }),
      getModuleResolutionHost: context.getModuleResolutionHost,
    };
    assert.equal(resolveImportSource(from, "card", relativeBase), path.join(directory, "mapped/card.ts"));
  });

  it("adapts project, standalone, absent, and failing TypeScript sessions", () => {
    const projectProgram = { getCompilerOptions: () => ({ strict: true }) };
    const project = { kind: "project", getProgram: () => projectProgram, host: { kind: "project-host" } };
    const projectResolver = createCompilerContextResolver({ typescriptSession: { projectSession: project } });
    assert.deepEqual(projectResolver.getCompilerOptions("/a.ts"), { strict: true });
    assert.deepEqual(projectResolver.getCompilerOptions("/a.ts"), { strict: true });
    assert.strictEqual(projectResolver.getModuleResolutionHost("/a.ts"), project.host);
    assert.strictEqual(projectResolver.getModuleResolutionHost("/a.ts"), project.host);

    const standaloneProgram = { getCompilerOptions: () => ({ allowJs: true }) };
    const standalone = { kind: "standalone", getProgram: (filename) => {
      assert.equal(filename, "/b.ts");
      return standaloneProgram;
    } };
    const standaloneResolver = createCompilerContextResolver({ typescriptSession: standalone });
    assert.deepEqual(standaloneResolver.getCompilerOptions("/b.ts"), { allowJs: true });

    const absent = createCompilerContextResolver();
    assert.equal(typeof absent.getCompilerOptions("").moduleResolution, "number");
    assert.ok(absent.getModuleResolutionHost("/missing.ts"));
    const failing = createCompilerContextResolver({ typescriptSession: { kind: "project", getProgram: () => { throw new Error("boom"); } } });
    assert.equal(typeof failing.getCompilerOptions("/bad.ts").moduleResolution, "number");
  });
});
