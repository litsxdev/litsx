import { fileURLToPath } from "url";
import path from "path";
import ts from "typescript";
import { getOrCreateProjectTsSession } from "@litsx/typescript-session";

import {
  createToolingVirtualLitsxSource,
  looksLikeLitsxJsx,
  remapToolingTextSpanToOriginal,
  remapVirtualText,
} from "./virtual-source.js";

const PROFILE_ENABLED = process.env.LITSX_PROFILE === "1";
const PARSED_COMMAND_LINE_CACHE = new Map();
const TYPECHECK_SESSION_BY_PROJECT = new Map();
const TYPECHECK_SESSION_CACHE_LIMIT = 20;
const FORMAT_HOST = createFormatHost();
const LITSX_EXTRA_FILE_EXTENSIONS = [
  {
    extension: ".litsx",
    isMixedContent: false,
    scriptKind: ts.ScriptKind.TSX,
  },
  {
    extension: ".litsx.jsx",
    isMixedContent: false,
    scriptKind: ts.ScriptKind.JSX,
  },
];

function profilePhase(namespace, name, callback) {
  if (!PROFILE_ENABLED) {
    return callback();
  }

  const start = performance.now();
  try {
    return callback();
  } finally {
    globalThis.__litsxProfileEvents ??= [];
    globalThis.__litsxProfileEvents.push({
      namespace,
      name,
      durationMs: performance.now() - start,
    });
  }
}

function isRelevantFile(fileName) {
  return /\.(jsx|tsx|litsx)$/.test(fileName) || fileName.endsWith(".litsx.jsx");
}

function getPluginsForFile(fileName) {
  return (fileName.endsWith(".tsx") || fileName.endsWith(".litsx")) ? ["typescript"] : [];
}

function getAdditionalLitsxFileNames(tsconfigPath, configJson, basePath) {
  const configuredFiles = Array.isArray(configJson?.files)
    ? configJson.files
        .filter((file) => file.endsWith(".litsx") || file.endsWith(".litsx.jsx"))
        .map((file) => path.resolve(basePath, file))
    : [];

  const explicitlyIncludedFiles = Array.isArray(configJson?.include)
    ? configJson.include
        .filter((pattern) => pattern.endsWith(".litsx") || pattern.endsWith(".litsx.jsx"))
        .map((pattern) => path.resolve(basePath, pattern))
        .filter((fileName) => ts.sys.fileExists(fileName))
    : [];

  const includedFiles = ts.sys.readDirectory(
    basePath,
    [".litsx", ".litsx.jsx"],
    configJson?.exclude,
    configJson?.include ?? ["**/*"],
  );

  return [...new Set([...configuredFiles, ...explicitlyIncludedFiles, ...includedFiles])]
    .filter((fileName) => fileName !== tsconfigPath)
    .sort();
}

function trimCacheToLimit(cache, limit) {
  while (cache.size > limit) {
    const oldestKey = cache.keys().next().value;
    if (oldestKey == null) break;
    cache.delete(oldestKey);
  }
}

function getFileVersion(filePath) {
  try {
    const stats = ts.sys.getModifiedTime?.(filePath);
    if (stats instanceof Date) {
      return String(stats.getTime());
    }
  } catch {}

  try {
    const content = ts.sys.readFile(filePath);
    return typeof content === "string" ? String(content.length) : null;
  } catch {
    return null;
  }
}

function createNormalizedArgKey(rawArgs) {
  return rawArgs.join("\0");
}

function createSessionKey(projectPath, rawArgs) {
  return `${projectPath || "<no-project>"}:${createNormalizedArgKey(rawArgs)}`;
}

function createVirtualizationState() {
  const cache = new Map();
  const sourceFileCache = new Map();

  function normalizeFileName(fileName) {
    return path.resolve(fileName);
  }

  function get(fileName) {
    return cache.get(normalizeFileName(fileName)) ?? null;
  }

  function clear(fileName) {
    const normalizedFileName = normalizeFileName(fileName);
    cache.delete(normalizedFileName);
    sourceFileCache.delete(normalizedFileName);
  }

  function buildVirtualizationRecord(fileName, sourceText) {
    const normalizedFileName = normalizeFileName(fileName);
    const cachedRecord = cache.get(normalizedFileName) ?? null;

    if (cachedRecord?.sourceText === sourceText) {
      return cachedRecord;
    }

    if (!isRelevantFile(fileName) || !looksLikeLitsxJsx(sourceText)) {
      clear(fileName);
      return null;
    }

    const parserPlugins = getPluginsForFile(fileName);
    const virtualization = profilePhase(
      "typescript-typecheck",
      "tooling-virtualization",
      () => createToolingVirtualLitsxSource(sourceText, {
        plugins: parserPlugins,
      }),
    );

    if (virtualization.code === sourceText) {
      clear(fileName);
      return null;
    }

    const record = {
      ...virtualization,
      sourceText,
      parserPlugins,
      virtualizedText: virtualization.code,
    };
    cache.set(normalizedFileName, record);
    return record;
  }

  return {
    get,
    getOrBuild(fileName, sourceText) {
      return buildVirtualizationRecord(fileName, sourceText);
    },
    getVirtualizedText(fileName, sourceText) {
      const virtualization = buildVirtualizationRecord(fileName, sourceText);
      return virtualization?.virtualizedText ?? sourceText;
    },
    getOrCreateSourceFile(fileName, sourceText, languageVersion, scriptKind) {
      const normalizedFileName = normalizeFileName(fileName);
      const virtualizedText = this.getVirtualizedText(fileName, sourceText);
      const cacheKey = `${String(languageVersion)}:${String(scriptKind ?? "")}:${sourceText}`;
      let fileCache = sourceFileCache.get(normalizedFileName);
      if (!fileCache) {
        fileCache = new Map();
        sourceFileCache.set(normalizedFileName, fileCache);
      }

      const cachedSourceFile = fileCache.get(cacheKey);
      if (cachedSourceFile) {
        return cachedSourceFile;
      }

      const sourceFile = ts.createSourceFile(
        fileName,
        virtualizedText,
        languageVersion,
        true,
        scriptKind,
      );
      fileCache.set(cacheKey, sourceFile);
      return sourceFile;
    },
  };
}

function remapMessageText(messageText) {
  if (typeof messageText === "string") {
    return remapVirtualText(messageText);
  }

  if (!messageText || typeof messageText !== "object") {
    return messageText;
  }

  return {
    ...messageText,
    messageText: remapMessageText(messageText.messageText),
    next: messageText.next?.map(remapMessageText),
  };
}

function remapDiagnostic(diagnostic, virtualizationState) {
  const fileName = diagnostic.file?.fileName;
  const virtualization = fileName ? virtualizationState.get(fileName) : null;

  if (!virtualization || typeof diagnostic.start !== "number") {
    return {
      ...diagnostic,
      messageText: remapMessageText(diagnostic.messageText),
    };
  }

  const remappedSpan = remapToolingTextSpanToOriginal(
    {
      start: diagnostic.start,
      length: diagnostic.length ?? 0,
    },
    virtualization,
  );

  return {
    ...diagnostic,
    start: remappedSpan.start,
    length: remappedSpan.length,
    messageText: remapMessageText(diagnostic.messageText),
    relatedInformation: diagnostic.relatedInformation?.map((info) => {
      if (!info.file || typeof info.start !== "number") {
        return {
          ...info,
          messageText: remapMessageText(info.messageText),
        };
      }

      const infoVirtualization = virtualizationState.get(info.file.fileName);
      if (!infoVirtualization) {
        return {
          ...info,
          messageText: remapMessageText(info.messageText),
        };
      }

      const infoSpan = remapToolingTextSpanToOriginal(
        {
          start: info.start,
          length: info.length ?? 0,
        },
        infoVirtualization,
      );

      return {
        ...info,
        start: infoSpan.start,
        length: infoSpan.length,
        messageText: remapMessageText(info.messageText),
      };
    }),
  };
}

function createFormatHost() {
  return {
    getCanonicalFileName(fileName) {
      return ts.sys.useCaseSensitiveFileNames ? fileName : fileName.toLowerCase();
    },
    getCurrentDirectory() {
      return ts.sys.getCurrentDirectory();
    },
    getNewLine() {
      return ts.sys.newLine;
    },
  };
}

function resolveParsedCommandLine(rawArgs) {
  const parsedCommandLine = ts.parseCommandLine(rawArgs);

  if (parsedCommandLine.errors.length > 0) {
    return parsedCommandLine;
  }

  const projectPath = parsedCommandLine.options.project
    ? path.resolve(parsedCommandLine.options.project)
    : ts.findConfigFile(process.cwd(), ts.sys.fileExists, "tsconfig.json");

  if (!projectPath) {
    return {
      ...parsedCommandLine,
      errors: [
        {
          category: ts.DiagnosticCategory.Error,
          code: 5083,
          file: undefined,
          start: undefined,
          length: undefined,
          messageText: "Cannot find a tsconfig.json file.",
        },
      ],
    };
  }

  const configFile = ts.readConfigFile(projectPath, ts.sys.readFile);
  if (configFile.error) {
    return {
      ...parsedCommandLine,
      errors: [configFile.error],
    };
  }

  const configHost = {
    ...ts.sys,
    onUnRecoverableConfigFileDiagnostic() {},
  };
  const projectVersion = getFileVersion(projectPath) ?? "unknown";
  const cacheKey = `${projectPath}:${projectVersion}:${createNormalizedArgKey(rawArgs)}`;
  const cached = PARSED_COMMAND_LINE_CACHE.get(cacheKey);
  if (cached) {
    PARSED_COMMAND_LINE_CACHE.delete(cacheKey);
    PARSED_COMMAND_LINE_CACHE.set(cacheKey, cached);
    return cached;
  }

  const resolved = {
    ...ts.parseJsonConfigFileContent(
      configFile.config,
      configHost,
      path.dirname(projectPath),
      parsedCommandLine.options,
      projectPath,
      undefined,
      LITSX_EXTRA_FILE_EXTENSIONS,
    ),
    projectPath,
    projectVersion,
    __litsxSessionKey: createSessionKey(projectPath, rawArgs),
  };

  if (!Object.hasOwn(configFile.config?.compilerOptions || {}, "types")) {
    resolved.options = {
      ...resolved.options,
      // Preserve TypeScript 5.x ambient @types loading for litsx-tsc when
      // projects haven't opted into an explicit `types` list yet.
      types: ["*"],
    };
  }

  resolved.fileNames = [
    ...new Set([
      ...resolved.fileNames,
      ...getAdditionalLitsxFileNames(projectPath, configFile.config, path.dirname(projectPath)),
    ]),
  ].sort();

  if (resolved.fileNames.some((fileName) => fileName.endsWith(".litsx") || fileName.endsWith(".litsx.jsx"))) {
    resolved.options = {
      ...resolved.options,
      allowNonTsExtensions: true,
    };
  }

  if (resolved.fileNames.length > 0 && Array.isArray(resolved.errors)) {
    resolved.errors = resolved.errors.filter((error) => error?.code !== 18003);
  }

  PARSED_COMMAND_LINE_CACHE.set(cacheKey, resolved);
  trimCacheToLimit(PARSED_COMMAND_LINE_CACHE, TYPECHECK_SESSION_CACHE_LIMIT);
  return resolved;
}

function createTypecheckSession(parsedCommandLine, projectSession = null) {
  const virtualizationState = createVirtualizationState();
  return {
    parsedCommandLine,
    sessionKey: parsedCommandLine.__litsxSessionKey,
    virtualizationState,
    diagnosticsCacheKey: null,
    diagnosticsCacheResult: null,
    projectSession: projectSession || getOrCreateProjectTsSession(parsedCommandLine.__litsxSessionKey, {
      typescript: ts,
      parsedCommandLine,
    }),
  };
}

function getTypecheckSession(parsedCommandLine, projectSession = null) {
  const sessionKey =
    parsedCommandLine.__litsxSessionKey ||
    createSessionKey(parsedCommandLine.projectPath, []);
  const cached = TYPECHECK_SESSION_BY_PROJECT.get(sessionKey);
  if (cached) {
    cached.parsedCommandLine = parsedCommandLine;
    if (projectSession) {
      cached.projectSession = projectSession;
      cached.diagnosticsCacheKey = null;
      cached.diagnosticsCacheResult = null;
    }
    cached.projectSession.refresh({
      parsedCommandLine,
    });
    TYPECHECK_SESSION_BY_PROJECT.delete(sessionKey);
    TYPECHECK_SESSION_BY_PROJECT.set(sessionKey, cached);
    return cached;
  }

  const session = createTypecheckSession(parsedCommandLine, projectSession);
  TYPECHECK_SESSION_BY_PROJECT.set(sessionKey, session);
  trimCacheToLimit(TYPECHECK_SESSION_BY_PROJECT, TYPECHECK_SESSION_CACHE_LIMIT);
  return session;
}

export function createLitsxTypecheckSession(rawArgs = process.argv.slice(2), options = {}) {
  const parsedCommandLine = resolveParsedCommandLine(rawArgs);
  return getTypecheckSession(parsedCommandLine, options.projectSession);
}

function createDiagnosticsCacheKey(session) {
  const parsedCommandLine = session.parsedCommandLine;
  const fileVersions = parsedCommandLine.fileNames.map((fileName) => (
    `${fileName}:${getFileVersion(fileName) ?? "missing"}`
  ));
  return `${parsedCommandLine.projectVersion || "unknown"}\0${fileVersions.join("\0")}`;
}

function runTypecheckSession(session) {
  const parsedCommandLine = session.parsedCommandLine;

  if (parsedCommandLine.errors?.length) {
    const output = ts.formatDiagnosticsWithColorAndContext(parsedCommandLine.errors, FORMAT_HOST);
    if (output) {
      process.stderr.write(output);
    }
    return 1;
  }

  const virtualizationState = session.virtualizationState;
  session.projectSession.refresh({
    parsedCommandLine,
  });
  for (const fileName of parsedCommandLine.fileNames) {
    const sourceText = session.projectSession.readFile?.(fileName) ?? ts.sys.readFile(fileName);
    if (typeof sourceText !== "string") {
      session.projectSession.clearOverlayFile(fileName);
      continue;
    }

    const virtualizedText = virtualizationState.getVirtualizedText(fileName, sourceText);
    if (virtualizedText === sourceText) {
      session.projectSession.clearOverlayFile(fileName);
      continue;
    }

    session.projectSession.setOverlayFile(fileName, virtualizedText);
  }

  const program = profilePhase(
    "typescript-typecheck",
    "create-program",
    () => session.projectSession.getProgram(),
  );

  const diagnosticsCacheKey = profilePhase(
    "typescript-typecheck",
    "diagnostic-cache-key",
    () => createDiagnosticsCacheKey(session),
  );

  if (
    session.diagnosticsCacheKey === diagnosticsCacheKey &&
    session.diagnosticsCacheResult
  ) {
    const cachedResult = session.diagnosticsCacheResult;
    if (cachedResult.output) {
      process.stderr.write(cachedResult.output);
    }
    return cachedResult.exitCode;
  }

  const diagnostics = profilePhase(
    "typescript-typecheck",
    "diagnostics",
    () => ts.getPreEmitDiagnostics(program),
  )
    .map((diagnostic) => remapDiagnostic(diagnostic, virtualizationState));

  if (diagnostics.length > 0) {
    const output = ts.formatDiagnosticsWithColorAndContext(diagnostics, FORMAT_HOST);
    if (output) {
      process.stderr.write(output);
    }
    session.diagnosticsCacheKey = diagnosticsCacheKey;
    session.diagnosticsCacheResult = {
      exitCode: 1,
      output,
    };
    return 1;
  }

  session.diagnosticsCacheKey = diagnosticsCacheKey;
  session.diagnosticsCacheResult = {
    exitCode: 0,
    output: "",
  };
  return 0;
}

export function runLitsxTypecheck(rawArgs = process.argv.slice(2)) {
  const session = Array.isArray(rawArgs)
    ? createLitsxTypecheckSession(rawArgs)
    : rawArgs;
  return runTypecheckSession(session);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  process.exitCode = runLitsxTypecheck(process.argv.slice(2));
}
