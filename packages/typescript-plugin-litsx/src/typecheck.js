#!/usr/bin/env node
import { fileURLToPath } from "url";
import path from "path";
import ts from "typescript";

import {
  createToolingVirtualLitsxSource,
  looksLikeLitsxJsx,
  remapToolingTextSpanToOriginal,
  remapVirtualText,
} from "./virtual-source.js";

function isRelevantFile(fileName) {
  return /\.(jsx|tsx)$/.test(fileName);
}

function getPluginsForFile(fileName) {
  return fileName.endsWith(".tsx") ? ["typescript"] : [];
}

function createVirtualizationState() {
  const cache = new Map();

  function normalizeFileName(fileName) {
    return path.resolve(fileName);
  }

  function buildVirtualization(fileName, sourceText) {
    if (!isRelevantFile(fileName) || !looksLikeLitsxJsx(sourceText)) {
      cache.delete(normalizeFileName(fileName));
      return null;
    }

    const virtualization = createToolingVirtualLitsxSource(sourceText, {
      plugins: getPluginsForFile(fileName),
    });

    if (virtualization.code === sourceText) {
      cache.delete(normalizeFileName(fileName));
      return null;
    }

    const record = {
      ...virtualization,
      sourceText,
    };
    cache.set(normalizeFileName(fileName), record);
    return record;
  }

  return {
    get(fileName) {
      return cache.get(normalizeFileName(fileName)) ?? null;
    },
    buildVirtualizedText(fileName, sourceText) {
      const virtualization = buildVirtualization(fileName, sourceText);
      return virtualization?.code ?? sourceText;
    },
  };
}

function createVirtualizedCompilerHost(parsedCommandLine, virtualizationState) {
  const host = ts.createCompilerHost(parsedCommandLine.options);
  const originalReadFile = host.readFile.bind(host);
  const originalGetSourceFile = host.getSourceFile.bind(host);

  host.readFile = (fileName) => {
    const sourceText = originalReadFile(fileName);
    if (typeof sourceText !== "string") {
      return sourceText;
    }

    return virtualizationState.buildVirtualizedText(fileName, sourceText);
  };

  host.getSourceFile = (fileName, languageVersion, onError, shouldCreateNewSourceFile) => {
    const sourceText = originalReadFile(fileName);
    if (typeof sourceText !== "string") {
      return originalGetSourceFile(fileName, languageVersion, onError, shouldCreateNewSourceFile);
    }

    const virtualizedText = virtualizationState.buildVirtualizedText(fileName, sourceText);
    return ts.createSourceFile(fileName, virtualizedText, languageVersion, true);
  };

  return host;
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

  return ts.parseJsonConfigFileContent(
    configFile.config,
    configHost,
    path.dirname(projectPath),
    parsedCommandLine.options,
    projectPath,
  );
}

export function runLitsxTypecheck(rawArgs = process.argv.slice(2)) {
  const parsedCommandLine = resolveParsedCommandLine(rawArgs);
  const formatHost = createFormatHost();

  if (parsedCommandLine.errors?.length) {
    const output = ts.formatDiagnosticsWithColorAndContext(parsedCommandLine.errors, formatHost);
    if (output) {
      process.stderr.write(output);
    }
    return 1;
  }

  const virtualizationState = createVirtualizationState();
  const host = createVirtualizedCompilerHost(parsedCommandLine, virtualizationState);

  const program = ts.createProgram({
    rootNames: parsedCommandLine.fileNames,
    options: parsedCommandLine.options,
    projectReferences: parsedCommandLine.projectReferences,
    host,
  });

  const diagnostics = ts
    .getPreEmitDiagnostics(program)
    .map((diagnostic) => remapDiagnostic(diagnostic, virtualizationState));

  if (diagnostics.length > 0) {
    const output = ts.formatDiagnosticsWithColorAndContext(diagnostics, formatHost);
    if (output) {
      process.stderr.write(output);
    }
    return 1;
  }

  return 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  process.exitCode = runLitsxTypecheck(process.argv.slice(2));
}
