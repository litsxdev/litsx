import { describe, expect, it, vi } from "vitest";
import ts from "typescript";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  attachSourceFileVersion,
  createInMemoryProgramKey,
  createInMemoryTsSession,
  createProjectHostKey,
  createProjectProgramKey,
  createProjectTsSession,
  createResolvedModule,
  createSessionBase,
  createStandaloneTsSession,
  createStandaloneProgramKey,
  getCachedSourceFile,
  getCachedSourceText,
  getCachedDiskSourceFile,
  getCachedDiskSourceText,
  getDiskFileVersion,
  getModuleExtension,
  getTransparentResolutionCandidates,
  inferScriptKind,
  installTransparentModuleResolution,
  isPathLikeModuleName,
  resolveTransparentModuleName,
  trimCacheToLimit,
} from "../packages/typescript-session/src/index.js";

describe("TypeScript session helper branches", () => {
  it("trims insertion-ordered caches including the null-key guard", () => {
    const cache = new Map([["a", 1], ["b", 2], ["c", 3]]);
    trimCacheToLimit(cache, 1);
    expect([...cache.keys()]).toEqual(["c"]);
    trimCacheToLimit(new Map(), -1);
  });

  it("infers script kinds and module extensions", () => {
    expect(inferScriptKind(ts, "a.tsx")).toBe(ts.ScriptKind.TSX);
    expect(inferScriptKind(ts, "a.jsx")).toBe(ts.ScriptKind.JSX);
    expect(inferScriptKind(ts, "a.ts")).toBe(ts.ScriptKind.TS);
    expect(inferScriptKind(ts, "a.js")).toBe(ts.ScriptKind.JS);
    expect(inferScriptKind(ts, "a.txt")).toBeUndefined();
    expect(getModuleExtension(ts, "a.jsx")).toBe(ts.Extension.Jsx);
    expect(getModuleExtension(ts, "a.tsx")).toBe(ts.Extension.Tsx);
    expect(getModuleExtension(ts, "a.ts")).toBe(ts.Extension.Ts);
    expect(getModuleExtension(ts, "a.js")).toBe(ts.Extension.Js);
  });

  it("recognizes path-like names and creates candidate lists", () => {
    expect(isPathLikeModuleName("./a")).toBe(true);
    expect(isPathLikeModuleName("../a")).toBe(true);
    expect(isPathLikeModuleName("/a")).toBe(true);
    expect(isPathLikeModuleName("pkg")).toBe(false);
    expect(getTransparentResolutionCandidates("/a.ts")).toEqual(["/a.ts", "/a.ts/index.ts"]);
    expect(getTransparentResolutionCandidates("/a")).toHaveLength(8);
    expect(createResolvedModule(ts, "\\a\\b.tsx")).toMatchObject({
      resolvedFileName: "/a/b.tsx",
      extension: ts.Extension.Tsx,
      isExternalLibraryImport: false,
    });
  });

  it("resolves transparent relative and absolute modules", () => {
    const exists = vi.fn((name) => name === "/src/a.ts" || name === "/root/x/index.js");
    expect(resolveTransparentModuleName(ts, "pkg", "/src/main.ts", exists)).toBeNull();
    expect(resolveTransparentModuleName(ts, "./a", "/src/main.ts", exists)?.resolvedFileName).toBe("/src/a.ts");
    expect(resolveTransparentModuleName(ts, "/root/x", "/src/main.ts", exists)?.resolvedFileName).toBe("/root/x/index.js");
    expect(resolveTransparentModuleName(ts, "./missing", "/src/main.ts", exists)).toBeNull();
  });

  it("installs both TypeScript module-resolution host APIs and fallbacks", () => {
    const resolvedByTs = { resolvedFileName: "/pkg.d.ts" };
    const fakeTs = {
      ...ts,
      resolveModuleName: vi.fn((name) => ({ resolvedModule: name === "pkg" ? resolvedByTs : undefined })),
    };
    const host = {
      directoryExists: vi.fn(() => false),
      getDirectories: vi.fn(() => ["x"]),
      realpath: vi.fn((x) => `${x}:real`),
    };
    const exists = (name) => name === "/src/local.ts";
    installTransparentModuleResolution(host, fakeTs, {}, exists, () => "");
    expect(host.resolveModuleNames(["pkg", "./local"], "/src/main.ts")).toEqual([
      resolvedByTs,
      expect.objectContaining({ resolvedFileName: "/src/local.ts" }),
    ]);
    expect(host.resolveModuleNameLiterals([{ text: "pkg" }], "/src/main.ts")).toEqual([
      { resolvedModule: resolvedByTs },
    ]);

    const sparseHost = {};
    fakeTs.resolveModuleName("warmup", "x", {}, {
      fileExists: exists,
      readFile() {},
      directoryExists() {},
      getDirectories() {},
      realpath() {},
    });
    installTransparentModuleResolution(sparseHost, fakeTs, {}, exists, () => "");
    sparseHost.resolveModuleNames(["missing"], "/src/main.ts");
  });

  it("manages base-session overlays, invalidation, and semantic caches", () => {
    const session = createSessionBase({ kind: "test", key: "k", typescript: ts });
    session.program = {};
    session.host = {};
    session.sourceTextCache.set("x", 1);
    session.sourceFileCache.set("x", 1);
    expect(session.getSemanticCache("a")).toBe(session.getSemanticCache("a"));
    expect(session.getSemanticCache("b", () => new Set([1]))).toEqual(new Set([1]));
    session.setOverlayFile("a\\b.ts", "one");
    session.setOverlayFile("a/b.ts", "one");
    expect(session.overlayFiles.get("a/b.ts")).toBe("one");
    session.clearOverlayFile("missing.ts");
    session.clearOverlayFile("a/b.ts");
    session.clearOverlayFiles();
    session.setOverlayFile("a.ts", "x");
    session.setOverlayFile("b.ts", "y");
    session.clearOverlayFiles();
    session.invalidate({ host: true });
    expect(session.host).toBeNull();
    session.invalidate();
  });

  it("caches transformed text and parsed source files", () => {
    const session = createSessionBase({ kind: "test", key: "k", typescript: ts });
    const transform = vi.fn((_file, source) => `${source}\nexport {};`);
    expect(getCachedSourceText(session, "a.ts", "const x=1", "k", transform)).toContain("export");
    expect(getCachedSourceText(session, "a.ts", "const x=1", "k", transform)).toContain("export");
    expect(transform).toHaveBeenCalledTimes(1);
    expect(getCachedSourceText(session, "b.ts", "x", "k", null)).toBe("x");
    const one = getCachedSourceFile(session, "a.ts", "const x=1", ts.ScriptTarget.Latest, undefined, "k", transform);
    const two = getCachedSourceFile(session, "a.ts", "const x=1", ts.ScriptTarget.Latest, undefined, "k", transform);
    expect(two).toBe(one);
    const explicit = getCachedSourceFile(session, "a.tsx", "const x=<x />", ts.ScriptTarget.Latest, ts.ScriptKind.TSX, "tsx", null);
    expect(explicit.fileName).toBe("a.tsx");
  });

  it("attaches versions safely and produces stable program keys", () => {
    expect(attachSourceFileVersion(null, "1")).toBeNull();
    expect(attachSourceFileVersion("text", "1")).toBe("text");
    const source = {};
    expect(attachSourceFileVersion(source, "1").version).toBe("1");
    expect(attachSourceFileVersion({ version: "old" }, "new").version).toBe("old");
    const parsed = { options: { strict: true }, fileNames: ["a.ts"] };
    expect(JSON.parse(createProjectProgramKey(parsed))).toMatchObject({ fileNames: ["a.ts"] });
    expect(JSON.parse(createProjectProgramKey({ ...parsed, projectReferences: [{ path: "ref" }], projectVersion: 2 })).projectReferences).toEqual(["ref"]);
    expect(JSON.parse(createProjectHostKey({ parsedCommandLine: parsed })).fileNames).toEqual(["a.ts"]);
    expect(JSON.parse(createProjectHostKey({ parsedCommandLine: { ...parsed, projectReferences: [{ path: "ref" }] } })).projectReferences).toEqual(["ref"]);
    expect(JSON.parse(createStandaloneProgramKey({ compilerOptions: { strict: true } }, "a.ts")).entryFileName).toBe("a.ts");
    expect(JSON.parse(createInMemoryProgramKey({ compilerOptions: {}, sourceFilename: "a.ts", rootNames: ["a.ts"] }, "hello")).sourceLength).toBe(5);
  });

  it("caches disk source text and source files while invalidating changed or missing files", () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "litsx-ts-session-"));
    const filename = path.join(directory, "sample.ts");
    const nonString = path.join(directory, "non-string.ts");
    const missing = path.join(directory, "missing.ts");
    try {
      fs.writeFileSync(filename, "export const value = 1;");
      fs.writeFileSync(nonString, "x");
      expect(typeof getDiskFileVersion(filename)).toBe("string");
      expect(getDiskFileVersion(missing)).toBeNull();
      expect(getCachedDiskSourceText(missing)).toBeUndefined();
      const read = vi.fn((file) => fs.readFileSync(file, "utf8"));
      expect(getCachedDiskSourceText(filename, read)).toContain("value");
      expect(getCachedDiskSourceText(filename, read)).toContain("value");
      expect(read).toHaveBeenCalledTimes(1);
      expect(getCachedDiskSourceText(nonString, () => 4)).toBe(4);
      expect(getCachedDiskSourceFile(nonString, ts.ScriptTarget.Latest, vi.fn(), () => 4)).toBeUndefined();

      const create = vi.fn((file, source, target, parents, kind) => ts.createSourceFile(file, source, target, parents, kind));
      const one = getCachedDiskSourceFile(filename, ts.ScriptTarget.Latest, create, read, () => ts.ScriptKind.TS);
      const two = getCachedDiskSourceFile(filename, ts.ScriptTarget.Latest, create, read, () => ts.ScriptKind.TS);
      expect(two).toBe(one);
      expect(getCachedDiskSourceFile(missing, ts.ScriptTarget.Latest, create)).toBeUndefined();
      fs.writeFileSync(filename, "export const value = 12345;");
      const changed = getCachedDiskSourceFile(filename, ts.ScriptTarget.Latest, create, read);
      expect(changed).not.toBe(one);
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  it("exercises transformed in-memory files, empty configs, overlays, and common accessors", () => {
    const createSourceFile = vi.fn((fileName, text) => ({ fileName, text }));
    const program = {
      getSourceFile: vi.fn((fileName) => fileName === "/virtual/main.ts" ? { fileName } : undefined),
      getTypeChecker: vi.fn(() => ({ kind: "checker" })),
    };
    const fakeTs = {
      ScriptKind: ts.ScriptKind,
      Extension: ts.Extension,
      createSourceFile,
      resolveModuleName: vi.fn(() => ({ resolvedModule: undefined })),
      createProgram: vi.fn(() => program),
    };
    const transformSourceText = vi.fn((_fileName, sourceText) => `${sourceText}\n// transformed`);
    const session = createInMemoryTsSession({
      typescript: fakeTs,
      sourceFilename: "/virtual/main.ts",
      defaultLibFileName: "/virtual/lib.d.ts",
      rootNames: ["/virtual/main.ts"],
      compilerOptions: {},
      transformSourceText,
    });

    const first = session.getProgram("export const value = 1;");
    expect(session.getProgram("export const value = 1;")).toBe(first);
    expect(session.getChecker("export const value = 2;")).toEqual({ kind: "checker" });
    expect(session.getSourceFile("/virtual/main.ts", "export const value = 3;")).toEqual({
      fileName: "/virtual/main.ts",
    });
    expect(session.host.readFile("/virtual/missing.ts")).toBeUndefined();
    expect(session.host.getSourceFile("/virtual/missing.ts", 99)).toBeUndefined();

    session.setOverlayFile("/virtual/extra.ts", "overlay");
    expect(session.host.readFile("/virtual/extra.ts")).toBe("overlay");
    expect(session.host.getSourceFile("/virtual/extra.ts", 99)?.text).toBe("overlay");
    expect(session.host.fileExists("/virtual/extra.ts")).toBe(true);
    expect(session.host.fileExists("/virtual/nope.ts")).toBe(false);
    expect(session.host.getDefaultLibFileName()).toBe("/virtual/lib.d.ts");
    expect(session.host.getCurrentDirectory()).toBe("/virtual");
    expect(session.getTypeResolver("/virtual/missing.ts", "missing")).toBeNull();
    expect(transformSourceText).not.toHaveBeenCalledWith("/virtual/extra.ts", "overlay");
  });

  it("supports sparse project hosts and both incremental builder return shapes", () => {
    const sourceFiles = new Map([["/src/main.ts", { fileName: "/src/main.ts" }]]);
    const baseHost = {
      readFile: vi.fn((fileName) => fileName === "/src/main.ts" ? "export const value = 1;" : undefined),
      getSourceFile: vi.fn((fileName) => sourceFiles.get(fileName)),
    };
    const directBuilderProgram = { getTypeChecker: vi.fn(), getSourceFile: vi.fn() };
    const wrappedProgram = { getTypeChecker: vi.fn(), getSourceFile: vi.fn() };
    const fakeTs = {
      sys: { useCaseSensitiveFileNames: false },
      ScriptKind: ts.ScriptKind,
      Extension: ts.Extension,
      createCompilerHost: vi.fn(() => ({ ...baseHost })),
      createSourceFile: vi.fn((fileName, text) => ({ fileName, text })),
      resolveModuleName: vi.fn((_name, _containing, _options, host) => {
        expect(host.directoryExists("/src")).toBe(true);
        expect(host.getDirectories("/src")).toEqual([]);
        expect(host.realpath("/src/main.ts")).toBe("/src/main.ts");
        return { resolvedModule: undefined };
      }),
      createProgram: vi.fn(() => wrappedProgram),
      createIncrementalProgram: vi
        .fn()
        .mockReturnValueOnce({ getProgram: () => wrappedProgram })
        .mockReturnValueOnce(directBuilderProgram),
    };
    const config = {
      typescript: fakeTs,
      parsedCommandLine: {
        options: {},
        fileNames: ["/src/main.ts"],
        projectReferences: [],
      },
      transformSourceText: (_fileName, sourceText) => `${sourceText}\n// transformed`,
    };
    const session = createProjectTsSession(config);

    expect(session.getProgram()).toBe(wrappedProgram);
    expect(session.host.useCaseSensitiveFileNames()).toBe(false);
    expect(session.host.readFile("/src/main.ts")).toContain("transformed");
    session.setOverlayFile("/src/overlay.ts", "overlay");
    expect(session.host.readFile("/src/overlay.ts")).toBe("overlay");
    expect(session.host.fileExists("/src/overlay.ts")).toBe(true);
    expect(session.host.fileExists("/src/missing.ts")).toBe(false);
    expect(session.host.getSourceFile("/src/overlay.ts", 99)?.version).toBe("overlay");
    expect(session.host.getSourceFile("/src/missing.ts", 99)).toBeUndefined();
    session.host.resolveModuleNames(["./missing"], "/src/main.ts");
    expect(session.getProgram()).toBe(wrappedProgram);
    expect(session.getProgram()).toBe(wrappedProgram);
    expect(session.getProgram()).toBe(directBuilderProgram);
  });

  it("uses transformed and missing standalone sources through the public host", () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "litsx-ts-standalone-"));
    const filename = path.join(directory, "entry.ts");
    const missing = path.join(directory, "missing.ts");
    try {
      fs.writeFileSync(filename, "export const value = 1;");
      const session = createStandaloneTsSession({
        typescript: ts,
        compilerOptions: {},
        transformSourceText: (_fileName, sourceText) => `${sourceText}\n// transformed`,
      });
      session.getProgram(filename);
      expect(session.host.readFile(filename)).toContain("transformed");
      expect(session.host.getSourceFile(filename, ts.ScriptTarget.Latest)?.text).toContain("transformed");
      expect(session.host.readFile(missing)).toBeUndefined();
      expect(session.host.getSourceFile(missing, ts.ScriptTarget.Latest)).toBeUndefined();
      session.setOverlayFile(missing, "export const overlay = true;");
      expect(session.host.fileExists(missing)).toBe(true);
      expect(session.host.readFile(missing)).toContain("overlay");
      expect(session.host.getSourceFile(missing, ts.ScriptTarget.Latest)?.text).toContain("overlay");
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });
});
