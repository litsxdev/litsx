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
    assert.strictEqual(normalizeFilePath("/virtual/./components/../page.litsx"), "/virtual/page.litsx");
    assert.strictEqual(normalizeFilePath("/../page.litsx"), "/page.litsx");
    assert.strictEqual(normalizeFilePath("../shared/../../page.litsx"), "../../page.litsx");
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

  it("keeps in-memory session caches coherent across no-op overlays and relative imports", () => {
    const config = createInMemoryConfig();
    config.files[config.sourceFilename] = 'import { answer } from "./answer"; export const value = answer;';
    config.files["/virtual/answer.litsx"] = "export const answer = 42;";
    const session = createInMemoryTsSession(config);

    session.setOverlayFile("/virtual/answer.litsx", config.files["/virtual/answer.litsx"]);
    session.setOverlayFile("/virtual/answer.litsx", config.files["/virtual/answer.litsx"]);
    session.clearOverlayFile("/virtual/missing.litsx");

    const program = session.getProgram(config.files[config.sourceFilename]);
    assert.deepStrictEqual(
      ts.getPreEmitDiagnostics(program)
        .filter((diagnostic) => diagnostic.code === 2307),
      [],
    );

    const firstCache = session.getSemanticCache("symbols");
    const secondCache = session.getSemanticCache("symbols");
    assert.strictEqual(firstCache, secondCache);
    assert(session.getChecker(config.files[config.sourceFilename]));

    session.clearOverlayFiles();
    session.clearOverlayFiles();
    assert.strictEqual(session.overlayFiles.size, 0);
  });

  it("resolves transparent in-memory module fallbacks when TypeScript has no result", () => {
    const fakeTypescript = {
      ScriptKind: { TSX: 1, JSX: 2, TS: 3, JS: 4 },
      Extension: { Tsx: ".tsx", Ts: ".ts", Jsx: ".jsx", Js: ".js" },
      resolveModuleName() {
        return { resolvedModule: undefined };
      },
      createSourceFile(fileName, text) {
        return { fileName, text };
      },
      createProgram(rootNames, _options, host) {
        return {
          getSourceFile(fileName) {
            return rootNames.includes(fileName) ? host.getSourceFile(fileName, 0) : undefined;
          },
          getTypeChecker() {
            return {};
          },
        };
      },
    };
    const sourceFilename = "/virtual/components/view.ts";
    const session = createInMemoryTsSession({
      typescript: fakeTypescript,
      sourceFilename,
      defaultLibFileName: "/virtual/lib.d.ts",
      rootNames: [sourceFilename],
      compilerOptions: {},
      files: {
        [sourceFilename]: "export {};",
        "/virtual/components/card.litsx": "export const Card = 1;",
        "/virtual/components/legacy.js": "export const legacy = 1;",
        "/virtual/components/feature/index.litsx.jsx": "export const Feature = 1;",
        "/virtual/absolute.ts": "export const absolute = 1;",
      },
    });

    session.getProgram("export {};");
    const resolved = session.host.resolveModuleNames(
      ["./card", "./feature", "./card.litsx", "./legacy.js", "/virtual/absolute", "lit-html"],
      sourceFilename,
    );
    const literals = session.host.resolveModuleNameLiterals(
      [{ text: "./card" }],
      sourceFilename,
    );

    assert.deepStrictEqual(
      resolved.map((entry) => entry?.resolvedFileName ?? null),
      [
        "/virtual/components/card.litsx",
        "/virtual/components/feature/index.litsx.jsx",
        "/virtual/components/card.litsx",
        "/virtual/components/legacy.js",
        "/virtual/absolute.ts",
        null,
      ],
    );
    assert.strictEqual(resolved[0].extension, ".tsx");
    assert.strictEqual(resolved[1].extension, ".jsx");
    assert.strictEqual(resolved[3].extension, ".js");
    assert.strictEqual(resolved[4].extension, ".ts");
    assert.strictEqual(literals[0].resolvedModule.resolvedFileName, "/virtual/components/card.litsx");
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

  it("resolves .litsx imports as project source modules", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "litsx-project-session-import-"));
    const entryFile = path.join(tempDir, "entry.tsx");
    const componentFile = path.join(tempDir, "vds-button.litsx");

    try {
      fs.writeFileSync(
        entryFile,
        'import { VdsButton } from "./vds-button.litsx";\nexport const view = <VdsButton label="Buy" />;\n',
        "utf8",
      );
      fs.writeFileSync(
        componentFile,
        "export const VdsButton = ({ label }: { label: string }) => <button>{label}</button>;\n",
        "utf8",
      );

      const session = createProjectTsSession({
        typescript: ts,
        parsedCommandLine: {
          options: {
            target: ts.ScriptTarget.ESNext,
            module: ts.ModuleKind.ESNext,
            moduleResolution: ts.ModuleResolutionKind.Bundler,
            jsx: ts.JsxEmit.Preserve,
            allowNonTsExtensions: true,
            skipLibCheck: true,
          },
          fileNames: [entryFile, componentFile],
          projectReferences: [],
          projectVersion: "1",
        },
      });

      const program = session.getProgram();
      assert(program.getSourceFile(entryFile));
      assert(program.getSourceFile(componentFile));
      assert.deepStrictEqual(
        ts.getPreEmitDiagnostics(program)
          .filter((diagnostic) => diagnostic.code === 2307)
          .map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n")),
        [],
      );
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("evicts the least recently used standalone session after the cache limit", () => {
    const config = {
      typescript: ts,
      compilerOptions: {},
    };
    const first = getOrCreateStandaloneTsSession("coverage-cache-0", config);

    for (let index = 1; index <= 50; index += 1) {
      getOrCreateStandaloneTsSession(`coverage-cache-${index}`, config);
    }

    const replacement = getOrCreateStandaloneTsSession("coverage-cache-0", config);
    assert.notStrictEqual(replacement, first);
  });
});
