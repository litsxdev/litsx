import assert from "assert";
import os from "os";
import path from "path";
import fs from "fs";
import ts from "typescript";
import { describe, it } from "vitest";
import {
  createInMemoryTsSession,
  createProjectTsSession,
  createStandaloneTsSession,
  dirname,
  getOrCreateProjectTsSession,
  getOrCreateStandaloneTsSession,
  normalizeFilePath,
} from "../packages/typescript-session/src/index.js";

function createInMemoryConfig() {
  const sourceFilename = "/virtual/demo.litsx";
  const defaultLibFileName = "/virtual/lib.d.ts";
  return {
    typescript: ts,
    sourceFilename,
    defaultLibFileName,
    rootNames: [sourceFilename, defaultLibFileName],
    compilerOptions: {
      target: ts.ScriptTarget.ESNext,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      jsx: ts.JsxEmit.Preserve,
      noLib: true,
    },
    files: {
      [sourceFilename]: "export const value = 1;",
      [defaultLibFileName]: "interface Array<T> { length: number }",
    },
  };
}

describe("@litsx/typescript-session", () => {
  it("normalizes file paths and dirname fallbacks", () => {
    assert.strictEqual(normalizeFilePath("C:\\demo\\file.ts"), "C:/demo/file.ts");
    assert.strictEqual(normalizeFilePath(""), "");
    assert.strictEqual(dirname("file.ts"), "/");
    assert.strictEqual(dirname("/root/demo/file.ts"), "/root/demo");
  });

  it("reuses cached in-memory programs and invalidates them on refresh", () => {
    const config = createInMemoryConfig();
    const session = createInMemoryTsSession(config);

    const firstProgram = session.getProgram("export const value = 1;");
    const secondProgram = session.getProgram("export const value = 1;");
    assert.strictEqual(secondProgram, firstProgram);

    session.setOverlayFile(config.sourceFilename, "export const value = 2;");
    assert.strictEqual(
      session.overlayFiles.get(config.sourceFilename),
      "export const value = 2;"
    );
    session.clearOverlayFile(config.sourceFilename);
    assert.strictEqual(session.overlayFiles.has(config.sourceFilename), false);

    session.refresh({
      files: {
        ...config.files,
        [config.defaultLibFileName]: "interface Array<T> { length: number; at(index: number): T }",
      },
    });
    assert.strictEqual(session.host, null);

    const refreshedProgram = session.getProgram("export const value = 3;");
    assert.notStrictEqual(refreshedProgram, firstProgram);
    assert.strictEqual(session.host.directoryExists("/virtual"), true);
    assert.strictEqual(session.host.directoryExists("/other"), false);
    assert.deepStrictEqual(session.host.getDirectories(), []);
    assert.strictEqual(
      session.host.getCanonicalFileName("\\virtual\\demo.litsx"),
      "/virtual/demo.litsx"
    );
    assert.strictEqual(session.host.useCaseSensitiveFileNames(), true);
    assert.strictEqual(session.host.getNewLine(), "\n");

    const missingResolver = session.getTypeResolver("/virtual/missing.ts", "export const nope = true;");
    assert.strictEqual(missingResolver, null);
  });

  it("creates standalone sessions that honor overlays and cached instances", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "litsx-ts-session-"));
    const entryFile = path.join(tempDir, "entry.ts");

    try {
      fs.writeFileSync(entryFile, "export const value = 1;\n", "utf8");

      const session = createStandaloneTsSession({
        typescript: ts,
        compilerOptions: {
          target: ts.ScriptTarget.ESNext,
          module: ts.ModuleKind.ESNext,
          moduleResolution: ts.ModuleResolutionKind.Bundler,
        },
      });

      const diskProgram = session.getProgram(entryFile);
      assert(diskProgram.getSourceFile(entryFile));

      session.setOverlayFile(entryFile, "export const value = 2;\n");
      const overlayResolver = session.getTypeResolver(entryFile, "export const value = 3;\n");
      assert(overlayResolver);
      assert.match(overlayResolver.sourceFile.text, /value = 3/);

      session.clearOverlayFile(entryFile);
      const cachedA = getOrCreateStandaloneTsSession("shared-session", {
        typescript: ts,
        compilerOptions: {
          target: ts.ScriptTarget.ESNext,
          module: ts.ModuleKind.ESNext,
          moduleResolution: ts.ModuleResolutionKind.Bundler,
        },
      });
      const cachedB = getOrCreateStandaloneTsSession("shared-session", {
        typescript: ts,
        compilerOptions: {
          target: ts.ScriptTarget.ESNext,
          module: ts.ModuleKind.CommonJS,
          moduleResolution: ts.ModuleResolutionKind.Node10,
        },
      });

      assert.strictEqual(cachedA, cachedB);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("reuses cached project sessions and refreshes their parsed command line", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "litsx-project-session-"));
    const entryFile = path.join(tempDir, "entry.ts");

    try {
      fs.writeFileSync(entryFile, "export const value = 1;\n", "utf8");

      const parsedCommandLine = {
        options: {
          target: ts.ScriptTarget.ESNext,
          module: ts.ModuleKind.ESNext,
          moduleResolution: ts.ModuleResolutionKind.Bundler,
        },
        fileNames: [entryFile],
        projectReferences: [{ path: path.join(tempDir, "tsconfig.shared.json") }],
        projectVersion: "1",
      };

      const directSession = createProjectTsSession({
        typescript: ts,
        parsedCommandLine,
      });
      const directProgram = directSession.getProgram();
      assert(directProgram.getSourceFile(entryFile));

      const cachedA = getOrCreateProjectTsSession("project-session", {
        typescript: ts,
        parsedCommandLine,
      });
      const cachedB = getOrCreateProjectTsSession("project-session", {
        typescript: ts,
        parsedCommandLine: {
          ...parsedCommandLine,
          projectVersion: "2",
        },
      });

      assert.strictEqual(cachedA, cachedB);
      const resolver = cachedB.getTypeResolver(entryFile, "export const value = 2;\n");
      assert(resolver);
      assert.strictEqual(resolver.filename, normalizeFilePath(entryFile));
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
