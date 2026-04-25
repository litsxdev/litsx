import fs from "fs";

const PROJECT_SESSION_CACHE = new Map();
const STANDALONE_SESSION_CACHE = new Map();
const SESSION_CACHE_LIMIT = 50;
const DISK_SOURCE_TEXT_CACHE = new Map();
const DISK_SOURCE_FILE_CACHE = new Map();
const DISK_FILE_CACHE_LIMIT = 500;

function trimCacheToLimit(cache, limit) {
  while (cache.size > limit) {
    const oldestKey = cache.keys().next().value;
    if (oldestKey == null) break;
    cache.delete(oldestKey);
  }
}

function normalizeFilePath(value) {
  if (!value) return "";
  return String(value).replace(/\\/g, "/").replace(/\/+/g, "/");
}

function dirname(filePath) {
  const normalized = normalizeFilePath(filePath);
  const lastSlash = normalized.lastIndexOf("/");
  if (lastSlash <= 0) {
    return "/";
  }
  return normalized.slice(0, lastSlash);
}

function defaultReadFile(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function getDiskFileVersion(filePath) {
  try {
    const stats = fs.statSync(filePath);
    return `${stats.mtimeMs}:${stats.size}`;
  } catch {
    return null;
  }
}

function getCachedDiskSourceText(filePath, readFile = defaultReadFile) {
  const normalizedPath = normalizeFilePath(filePath);
  const version = getDiskFileVersion(filePath);
  if (!version) {
    DISK_SOURCE_TEXT_CACHE.delete(normalizedPath);
    return undefined;
  }

  const cached = DISK_SOURCE_TEXT_CACHE.get(normalizedPath);
  if (cached?.version === version) {
    DISK_SOURCE_TEXT_CACHE.delete(normalizedPath);
    DISK_SOURCE_TEXT_CACHE.set(normalizedPath, cached);
    return cached.sourceText;
  }

  const sourceText = readFile(filePath);
  if (typeof sourceText !== "string") {
    DISK_SOURCE_TEXT_CACHE.delete(normalizedPath);
    return sourceText;
  }

  const record = { version, sourceText };
  DISK_SOURCE_TEXT_CACHE.set(normalizedPath, record);
  trimCacheToLimit(DISK_SOURCE_TEXT_CACHE, DISK_FILE_CACHE_LIMIT);
  return sourceText;
}

function getCachedDiskSourceFile(filePath, languageVersion, createSourceFile, readFile = defaultReadFile) {
  const normalizedPath = normalizeFilePath(filePath);
  const version = getDiskFileVersion(filePath);
  if (!version) {
    DISK_SOURCE_FILE_CACHE.delete(`${normalizedPath}:${languageVersion}`);
    return undefined;
  }

  const cacheKey = `${normalizedPath}:${languageVersion}`;
  const cached = DISK_SOURCE_FILE_CACHE.get(cacheKey);
  if (cached?.version === version) {
    DISK_SOURCE_FILE_CACHE.delete(cacheKey);
    DISK_SOURCE_FILE_CACHE.set(cacheKey, cached);
    return cached.sourceFile;
  }

  const sourceText = getCachedDiskSourceText(filePath, readFile);
  if (typeof sourceText !== "string") {
    DISK_SOURCE_FILE_CACHE.delete(cacheKey);
    return undefined;
  }

  const sourceFile = createSourceFile(filePath, sourceText, languageVersion, true);
  const record = { version, sourceFile };
  DISK_SOURCE_FILE_CACHE.set(cacheKey, record);
  trimCacheToLimit(DISK_SOURCE_FILE_CACHE, DISK_FILE_CACHE_LIMIT);
  return sourceFile;
}

function createSourceTextCache() {
  return new Map();
}

function createSourceFileCache() {
  return new Map();
}

function createSessionBase({
  kind,
  key,
  typescript,
}) {
  return {
    kind,
    key,
    typescript,
    host: null,
    hostConfigKey: null,
    program: null,
    programKey: null,
    overlayFiles: new Map(),
    semanticCaches: new Map(),
    sourceTextCache: createSourceTextCache(),
    sourceFileCache: createSourceFileCache(),
    invalidate({ host = false } = {}) {
      this.program = null;
      this.programKey = null;
      this.semanticCaches.clear();
      if (host) {
        this.host = null;
        this.hostConfigKey = null;
        this.sourceTextCache.clear();
        this.sourceFileCache.clear();
      }
    },
    getSemanticCache(name, factory = () => new Map()) {
      if (!this.semanticCaches.has(name)) {
        this.semanticCaches.set(name, factory());
      }
      return this.semanticCaches.get(name);
    },
    setOverlayFile(fileName, sourceText) {
      this.overlayFiles.set(normalizeFilePath(fileName), sourceText);
    },
    clearOverlayFile(fileName) {
      this.overlayFiles.delete(normalizeFilePath(fileName));
    },
    clearOverlayFiles() {
      this.overlayFiles.clear();
    },
  };
}

function getCachedSourceText(session, fileName, sourceText, transformKey, transform) {
  const normalizedFileName = normalizeFilePath(fileName);
  const cacheKey = `${normalizedFileName}:${transformKey}`;
  const cached = session.sourceTextCache.get(cacheKey);
  if (cached?.sourceText === sourceText) {
    return cached.transformedText;
  }
  const transformedText = transform ? transform(fileName, sourceText) : sourceText;
  session.sourceTextCache.set(cacheKey, {
    sourceText,
    transformedText,
  });
  return transformedText;
}

function getCachedSourceFile(session, fileName, sourceText, languageVersion, scriptKind, transformKey, transform) {
  const normalizedFileName = normalizeFilePath(fileName);
  const transformedText = getCachedSourceText(
    session,
    fileName,
    sourceText,
    transformKey,
    transform,
  );
  const cacheKey = `${normalizedFileName}:${String(languageVersion)}:${String(scriptKind ?? "")}:${transformKey}`;
  let fileCache = session.sourceFileCache.get(cacheKey);
  if (!fileCache) {
    fileCache = new Map();
    session.sourceFileCache.set(cacheKey, fileCache);
  }

  const cachedSourceFile = fileCache.get(sourceText);
  if (cachedSourceFile) {
    return cachedSourceFile;
  }

  const sourceFile = session.typescript.createSourceFile(
    fileName,
    transformedText,
    languageVersion,
    true,
    scriptKind,
  );
  fileCache.set(sourceText, sourceFile);
  return sourceFile;
}

function attachSourceFileVersion(sourceFile, version) {
  if (!sourceFile || typeof sourceFile !== "object") {
    return sourceFile;
  }

  if (sourceFile.version == null) {
    sourceFile.version = version;
  }

  return sourceFile;
}

function createProjectHost(session, config) {
  const ts = session.typescript;
  const host =
    typeof ts.createIncrementalCompilerHost === "function"
      ? ts.createIncrementalCompilerHost(config.parsedCommandLine.options)
      : ts.createCompilerHost(config.parsedCommandLine.options);
  const originalReadFile = host.readFile.bind(host);
  const originalGetSourceFile = host.getSourceFile.bind(host);

  if (typeof host.useCaseSensitiveFileNames !== "function") {
    host.useCaseSensitiveFileNames = () => ts.sys.useCaseSensitiveFileNames;
  }

  session.readFile = (fileName) => originalReadFile(fileName);

  host.readFile = (fileName) => {
    const normalizedFileName = normalizeFilePath(fileName);
    if (session.overlayFiles.has(normalizedFileName)) {
      return session.overlayFiles.get(normalizedFileName);
    }

    const sourceText = originalReadFile(fileName);
    if (typeof sourceText !== "string") {
      return sourceText;
    }

    return getCachedSourceText(session, fileName, sourceText, "project", null);
  };

  host.getSourceFile = (
    fileName,
    languageVersion,
    onError,
    shouldCreateNewSourceFile,
    scriptKind,
  ) => {
    const normalizedFileName = normalizeFilePath(fileName);
    if (session.overlayFiles.has(normalizedFileName)) {
      const sourceText = session.overlayFiles.get(normalizedFileName);
      return attachSourceFileVersion(
        getCachedSourceFile(
          session,
          fileName,
          sourceText,
          languageVersion,
          scriptKind,
          "overlay",
          null,
        ),
        sourceText,
      );
    }

    const sourceText = originalReadFile(fileName);
    if (typeof sourceText !== "string") {
      return attachSourceFileVersion(
        originalGetSourceFile(
          fileName,
          languageVersion,
          onError,
          shouldCreateNewSourceFile,
          scriptKind,
        ),
        "",
      );
    }

    return attachSourceFileVersion(
      getCachedSourceFile(
        session,
        fileName,
        sourceText,
        languageVersion,
        scriptKind,
        "project",
        null,
      ),
      sourceText,
    );
  };

  return host;
}

function createStandaloneHost(session, config) {
  const ts = session.typescript;
  const host = ts.createCompilerHost(config.compilerOptions, true);
  const originalReadFile = host.readFile.bind(host);
  const originalFileExists = host.fileExists.bind(host);

  host.readFile = (filePath) => {
    const normalizedPath = normalizeFilePath(filePath);
    if (session.overlayFiles.has(normalizedPath)) {
      return session.overlayFiles.get(normalizedPath);
    }
    return getCachedDiskSourceText(filePath, originalReadFile);
  };

  host.fileExists = (filePath) => {
    const normalizedPath = normalizeFilePath(filePath);
    if (session.overlayFiles.has(normalizedPath)) {
      return true;
    }
    return originalFileExists(filePath);
  };

  host.getSourceFile = (filePath, languageVersion) => {
    const normalizedPath = normalizeFilePath(filePath);
    if (session.overlayFiles.has(normalizedPath)) {
      const sourceText = session.overlayFiles.get(normalizedPath);
      return ts.createSourceFile(filePath, sourceText, languageVersion, true);
    }
    return getCachedDiskSourceFile(
      filePath,
      languageVersion,
      ts.createSourceFile,
      originalReadFile,
    );
  };

  return host;
}

function createInMemoryHost(session, config) {
  const ts = session.typescript;
  const files = new Map(
    Object.entries(config.files || {}).map(([filePath, sourceText]) => [
      normalizeFilePath(filePath),
      sourceText,
    ]),
  );
  const sourceDir = dirname(config.sourceFilename);

  return {
    getSourceFile(filePath, languageVersion) {
      const normalizedPath = normalizeFilePath(filePath);
      const overlaySource = session.overlayFiles.get(normalizedPath);
      const fileSource = overlaySource ?? files.get(normalizedPath);
      if (fileSource == null) return undefined;
      return ts.createSourceFile(normalizedPath, fileSource, languageVersion, true);
    },
    readFile(filePath) {
      const normalizedPath = normalizeFilePath(filePath);
      return session.overlayFiles.get(normalizedPath) ?? files.get(normalizedPath);
    },
    fileExists(filePath) {
      const normalizedPath = normalizeFilePath(filePath);
      return session.overlayFiles.has(normalizedPath) || files.has(normalizedPath);
    },
    writeFile() {},
    getDefaultLibFileName() {
      return config.defaultLibFileName;
    },
    getCurrentDirectory() {
      return sourceDir;
    },
    getDirectories() {
      return [];
    },
    directoryExists(dirPath) {
      const normalizedPath = normalizeFilePath(dirPath);
      return normalizedPath === sourceDir || normalizedPath === dirname(config.defaultLibFileName);
    },
    getCanonicalFileName(filePath) {
      return normalizeFilePath(filePath);
    },
    useCaseSensitiveFileNames() {
      return true;
    },
    getNewLine() {
      return "\n";
    },
  };
}

function createProjectProgramKey(parsedCommandLine) {
  return JSON.stringify({
    options: parsedCommandLine.options,
    fileNames: parsedCommandLine.fileNames,
    projectReferences: parsedCommandLine.projectReferences?.map((reference) => reference.path),
    projectVersion: parsedCommandLine.projectVersion,
  });
}

function createProjectHostKey(config) {
  return JSON.stringify({
    options: config.parsedCommandLine.options,
    fileNames: config.parsedCommandLine.fileNames,
    projectReferences: config.parsedCommandLine.projectReferences?.map((reference) => reference.path),
  });
}

function createStandaloneProgramKey(config, entryFileName) {
  return JSON.stringify({
    options: config.compilerOptions,
    entryFileName,
  });
}

function createInMemoryProgramKey(config, sourceText) {
  return JSON.stringify({
    options: config.compilerOptions,
    sourceFilename: config.sourceFilename,
    rootNames: config.rootNames,
    sourceLength: sourceText.length,
  });
}

function attachProjectSessionMethods(session, config) {
  function ensureHost() {
    const hostKey = createProjectHostKey(config);
    if (!session.host || session.hostConfigKey !== hostKey) {
      session.host = createProjectHost(session, config);
      session.hostConfigKey = hostKey;
      session.program = null;
      session.programKey = null;
      session.semanticCaches.clear();
    }
    return session.host;
  }

  session.refresh = (nextConfig = {}) => {
    config = {
      ...config,
      ...nextConfig,
    };
    ensureHost();
    return session;
  };

  session.getProgram = () => {
    const programKey = createProjectProgramKey(config.parsedCommandLine);
    ensureHost();

    const builderProgram =
      session.program &&
      typeof session.typescript.createIncrementalProgram === "function"
        ? session.typescript.createIncrementalProgram({
          rootNames: config.parsedCommandLine.fileNames,
          options: config.parsedCommandLine.options,
          projectReferences: config.parsedCommandLine.projectReferences,
          host: session.host,
          oldProgram: session.program,
        })
        : null;

    const program = builderProgram
      ? (typeof builderProgram.getProgram === "function"
          ? builderProgram.getProgram()
          : builderProgram)
      : session.typescript.createProgram({
          rootNames: config.parsedCommandLine.fileNames,
          options: config.parsedCommandLine.options,
          projectReferences: config.parsedCommandLine.projectReferences,
          host: session.host,
        });

    if (session.program !== program) {
      session.semanticCaches.clear();
    }
    session.program = program;
    session.programKey = programKey;
    return program;
  };
};

function attachStandaloneSessionMethods(session, config) {
  session.refresh = (nextConfig = {}) => {
    config = {
      ...config,
      ...nextConfig,
    };
    return session;
  };

  session.getProgram = (entryFileName) => {
    const normalizedEntryFileName = normalizeFilePath(entryFileName);
    if (!session.host) {
      session.host = createStandaloneHost(session, config);
    }
    const programKey = createStandaloneProgramKey(config, normalizedEntryFileName);
    const program = session.typescript.createProgram(
      [normalizedEntryFileName],
      config.compilerOptions,
      session.host,
      session.program ?? undefined,
    );

    if (session.program !== program) {
      session.semanticCaches.clear();
    }
    session.program = program;
    session.programKey = programKey;
    return program;
  };
};

function attachInMemorySessionMethods(session, config) {
  session.refresh = (nextConfig = {}) => {
    config = {
      ...config,
      ...nextConfig,
    };
    session.invalidate({ host: true });
    return session;
  };

  session.getProgram = (sourceText) => {
    if (!session.host) {
      session.host = createInMemoryHost(session, config);
    }
    const programKey = createInMemoryProgramKey(config, sourceText);
    if (session.program && session.programKey === programKey) {
      return session.program;
    }

    session.setOverlayFile(config.sourceFilename, sourceText);
    const program = session.typescript.createProgram(
      config.rootNames,
      config.compilerOptions,
      session.host,
    );

    if (session.program !== program) {
      session.semanticCaches.clear();
    }
    session.program = program;
    session.programKey = programKey;
    return program;
  };
}

function attachCommonSessionMethods(session) {
  session.getChecker = (...args) => session.getProgram(...args).getTypeChecker();
  session.getSourceFile = (fileName, ...args) => session.getProgram(...args).getSourceFile(fileName);
  session.getTypeResolver = (fileName, sourceText) => {
    session.setOverlayFile(fileName, sourceText);
    const program =
      session.kind === "project"
        ? session.getProgram()
        : session.kind === "standalone"
          ? session.getProgram(fileName)
          : session.getProgram(sourceText);
    const sourceFile = program.getSourceFile(fileName);
    if (!sourceFile) {
      session.clearOverlayFile(fileName);
      return null;
    }
    return {
      filename: normalizeFilePath(fileName),
      sourceFile,
      checker: program.getTypeChecker(),
      program,
      getSemanticCache(name, factory) {
        return session.getSemanticCache(name, factory);
      },
    };
  };
}

export function createProjectTsSession(config) {
  const session = createSessionBase({
    kind: "project",
    key: config.sessionKey,
    typescript: config.typescript,
  });
  attachProjectSessionMethods(session, config);
  attachCommonSessionMethods(session);
  return session;
}

export function getOrCreateProjectTsSession(key, config) {
  const cached = PROJECT_SESSION_CACHE.get(key);
  if (cached) {
    PROJECT_SESSION_CACHE.delete(key);
    PROJECT_SESSION_CACHE.set(key, cached);
    cached.refresh(config);
    return cached;
  }

  const session = createProjectTsSession({
    ...config,
    sessionKey: key,
  });
  PROJECT_SESSION_CACHE.set(key, session);
  trimCacheToLimit(PROJECT_SESSION_CACHE, SESSION_CACHE_LIMIT);
  return session;
}

export function createStandaloneTsSession(config) {
  const session = createSessionBase({
    kind: "standalone",
    key: config.sessionKey,
    typescript: config.typescript,
  });
  attachStandaloneSessionMethods(session, config);
  attachCommonSessionMethods(session);
  return session;
}

export function getOrCreateStandaloneTsSession(key, config) {
  const cached = STANDALONE_SESSION_CACHE.get(key);
  if (cached) {
    STANDALONE_SESSION_CACHE.delete(key);
    STANDALONE_SESSION_CACHE.set(key, cached);
    cached.refresh(config);
    return cached;
  }

  const session = createStandaloneTsSession({
    ...config,
    sessionKey: key,
  });
  STANDALONE_SESSION_CACHE.set(key, session);
  trimCacheToLimit(STANDALONE_SESSION_CACHE, SESSION_CACHE_LIMIT);
  return session;
}

export function createInMemoryTsSession(config) {
  const session = createSessionBase({
    kind: "in-memory",
    key: config.sessionKey || `in-memory:${config.sourceFilename}`,
    typescript: config.typescript,
  });
  attachInMemorySessionMethods(session, config);
  attachCommonSessionMethods(session);
  return session;
}

export {
  dirname,
  normalizeFilePath,
};
