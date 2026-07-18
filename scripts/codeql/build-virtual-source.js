import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

import { createToolingVirtualLitsxSource } from "../../packages/typescript/src/virtualization.js";

const JS_LIKE_EXTENSIONS = new Set([
  ".js",
  ".jsx",
  ".ts",
  ".tsx",
  ".mjs",
  ".cjs",
  ".litsx",
]);
const TEXT_COPY_EXTENSIONS = new Set([
  ".json",
  ".yml",
  ".yaml",
  ".md",
  ".txt",
  ".css",
  ".html",
  ".svg",
]);
const DEFAULT_IGNORED_DIRECTORIES = new Set([
  ".git",
  ".yarn",
  "coverage",
  "dist",
  "node_modules",
]);

function normalizeSlashes(value) {
  return value.split(path.sep).join("/");
}

function isIgnoredDirectory(relativePath, ignoredDirectories) {
  if (!relativePath) {
    return false;
  }

  const segments = normalizeSlashes(relativePath).split("/");
  return segments.some((segment) => ignoredDirectories.has(segment));
}

function shouldVirtualizeFile(relativePath) {
  const extension = path.extname(relativePath).toLowerCase();
  return JS_LIKE_EXTENSIONS.has(extension);
}

function shouldCopyTextFile(relativePath) {
  const extension = path.extname(relativePath).toLowerCase();
  return TEXT_COPY_EXTENSIONS.has(extension);
}

function isIdentifierChar(char) {
  return /[A-Za-z0-9_$]/.test(char);
}

function isWhitespace(char) {
  return (
    char === " " ||
    char === "\n" ||
    char === "\r" ||
    char === "\t" ||
    char === "\f"
  );
}

function scanQuotedString(sourceText, start, quote) {
  let index = start + 1;

  while (index < sourceText.length) {
    const char = sourceText[index];
    if (char === "\\") {
      index += 2;
      continue;
    }

    if (char === quote) {
      return index + 1;
    }

    index += 1;
  }

  return sourceText.length;
}

function scanTemplateLiteral(sourceText, start) {
  let index = start + 1;

  while (index < sourceText.length) {
    const char = sourceText[index];
    if (char === "\\") {
      index += 2;
      continue;
    }

    if (char === "`") {
      return index + 1;
    }

    if (char === "$" && sourceText[index + 1] === "{") {
      index += 2;
      let depth = 1;

      while (index < sourceText.length && depth > 0) {
        const nested = sourceText[index];
        if (nested === "'" || nested === '"') {
          index = scanQuotedString(sourceText, index, nested);
          continue;
        }

        if (nested === "`") {
          index = scanTemplateLiteral(sourceText, index);
          continue;
        }

        if (nested === "{") {
          depth += 1;
        } else if (nested === "}") {
          depth -= 1;
        }

        index += 1;
      }

      continue;
    }

    index += 1;
  }

  return sourceText.length;
}

function scanLineComment(sourceText, start) {
  let index = start + 2;
  while (index < sourceText.length && sourceText[index] !== "\n") {
    index += 1;
  }
  return index;
}

function scanBlockComment(sourceText, start) {
  let index = start + 2;
  while (index < sourceText.length) {
    if (sourceText[index] === "*" && sourceText[index + 1] === "/") {
      return index + 2;
    }
    index += 1;
  }
  return sourceText.length;
}

function skipWhitespaceAndComments(sourceText, start) {
  let index = start;

  while (index < sourceText.length) {
    const char = sourceText[index];
    const next = sourceText[index + 1];

    if (isWhitespace(char)) {
      index += 1;
      continue;
    }

    if (char === "/" && next === "/") {
      index = scanLineComment(sourceText, index);
      continue;
    }

    if (char === "/" && next === "*") {
      index = scanBlockComment(sourceText, index);
      continue;
    }

    break;
  }

  return index;
}

function isStandaloneIdentifier(sourceText, start, value) {
  if (sourceText.slice(start, start + value.length) !== value) {
    return false;
  }

  const before = start > 0 ? sourceText[start - 1] : "";
  const after = sourceText[start + value.length] ?? "";
  return !isIdentifierChar(before) && !isIdentifierChar(after);
}

function findStringLiteralStart(sourceText, start) {
  const index = skipWhitespaceAndComments(sourceText, start);
  const quote = sourceText[index];
  if (quote !== "'" && quote !== '"') {
    return null;
  }

  return index;
}

function maybeRewriteLitsxSpecifier(value) {
  if (!value.endsWith(".litsx")) {
    return value;
  }

  return `${value.slice(0, -".litsx".length)}.tsx`;
}

function rewriteSpecifierAt(sourceText, quoteStart) {
  const quote = sourceText[quoteStart];
  const literalEnd = scanQuotedString(sourceText, quoteStart, quote);
  const value = sourceText.slice(quoteStart + 1, literalEnd - 1);
  const rewritten = maybeRewriteLitsxSpecifier(value);

  if (rewritten === value) {
    return null;
  }

  return {
    start: quoteStart + 1,
    end: literalEnd - 1,
    replacement: rewritten,
    nextIndex: literalEnd,
  };
}

function findStaticImportSpecifier(sourceText, start) {
  let index = start;

  while (index < sourceText.length) {
    const char = sourceText[index];
    const next = sourceText[index + 1];

    if (char === "'" || char === '"') {
      return rewriteSpecifierAt(sourceText, index);
    }

    if (char === ";" || char === "\n") {
      return null;
    }

    if (char === "/" && next === "/") {
      index = scanLineComment(sourceText, index);
      continue;
    }

    if (char === "/" && next === "*") {
      index = scanBlockComment(sourceText, index);
      continue;
    }

    index += 1;
  }

  return null;
}

function collectSpecifierReplacements(sourceText) {
  const replacements = [];
  let index = 0;

  while (index < sourceText.length) {
    const char = sourceText[index];
    const next = sourceText[index + 1];

    if (char === "'" || char === '"') {
      index = scanQuotedString(sourceText, index, char);
      continue;
    }

    if (char === "`") {
      index = scanTemplateLiteral(sourceText, index);
      continue;
    }

    if (char === "/" && next === "/") {
      index = scanLineComment(sourceText, index);
      continue;
    }

    if (char === "/" && next === "*") {
      index = scanBlockComment(sourceText, index);
      continue;
    }

    if (isStandaloneIdentifier(sourceText, index, "from")) {
      const quoteStart = findStringLiteralStart(sourceText, index + 4);
      if (quoteStart != null) {
        const replacement = rewriteSpecifierAt(sourceText, quoteStart);
        if (replacement) {
          replacements.push(replacement);
        }
        index = replacement?.nextIndex ?? quoteStart + 1;
        continue;
      }
    }

    if (isStandaloneIdentifier(sourceText, index, "import")) {
      const afterImport = skipWhitespaceAndComments(sourceText, index + 6);

      if (sourceText[afterImport] === "(") {
        const quoteStart = findStringLiteralStart(sourceText, afterImport + 1);
        if (quoteStart != null) {
          const replacement = rewriteSpecifierAt(sourceText, quoteStart);
          if (replacement) {
            replacements.push(replacement);
          }
          index = replacement?.nextIndex ?? quoteStart + 1;
          continue;
        }
      } else {
        const replacement = findStaticImportSpecifier(sourceText, afterImport);
        if (replacement) {
          replacements.push(replacement);
          index = replacement.nextIndex;
          continue;
        }
      }
    }

    if (isStandaloneIdentifier(sourceText, index, "require")) {
      const afterRequire = skipWhitespaceAndComments(sourceText, index + 7);
      if (sourceText[afterRequire] === "(") {
        const quoteStart = findStringLiteralStart(sourceText, afterRequire + 1);
        if (quoteStart != null) {
          const replacement = rewriteSpecifierAt(sourceText, quoteStart);
          if (replacement) {
            replacements.push(replacement);
          }
          index = replacement?.nextIndex ?? quoteStart + 1;
          continue;
        }
      }
    }

    index += 1;
  }

  return replacements;
}

function applyReplacements(sourceText, replacements) {
  if (replacements.length === 0) {
    return sourceText;
  }

  let output = "";
  let cursor = 0;

  for (const replacement of replacements) {
    output += sourceText.slice(cursor, replacement.start);
    output += replacement.replacement;
    cursor = replacement.end;
  }

  output += sourceText.slice(cursor);
  return output;
}

export function rewriteLitsxSpecifiers(sourceText) {
  return applyReplacements(
    sourceText,
    collectSpecifierReplacements(sourceText),
  );
}

function getVirtualizationPlugins(relativePath) {
  const extension = path.extname(relativePath).toLowerCase();
  return extension === ".ts" || extension === ".tsx" || extension === ".litsx"
    ? ["typescript"]
    : [];
}

export function getOverlayRelativePath(relativePath) {
  return relativePath.endsWith(".litsx")
    ? `${relativePath.slice(0, -".litsx".length)}.tsx`
    : relativePath;
}

export function buildCodeqlVirtualSourceTree(options = {}) {
  const repoRoot = path.resolve(
    options.repoRoot ??
      path.join(path.dirname(fileURLToPath(import.meta.url)), "../.."),
  );
  const outputRoot = path.resolve(
    options.outputRoot ?? path.join(repoRoot, ".codeql-overlay"),
  );
  const ignoredDirectories = new Set([
    ...DEFAULT_IGNORED_DIRECTORIES,
    path.basename(outputRoot),
    ...(options.ignoredDirectories ?? []),
  ]);

  fs.rmSync(outputRoot, { recursive: true, force: true });
  fs.mkdirSync(outputRoot, { recursive: true });

  const queue = [repoRoot];
  const writtenFiles = [];

  while (queue.length > 0) {
    const currentDirectory = queue.pop();
    const entries = fs.readdirSync(currentDirectory, { withFileTypes: true });

    for (const entry of entries) {
      const absolutePath = path.join(currentDirectory, entry.name);
      const relativePath = path.relative(repoRoot, absolutePath);

      if (!relativePath) {
        continue;
      }

      if (isIgnoredDirectory(relativePath, ignoredDirectories)) {
        continue;
      }

      if (entry.isDirectory()) {
        queue.push(absolutePath);
        continue;
      }

      const outputRelativePath = getOverlayRelativePath(relativePath);
      const outputPath = path.join(outputRoot, outputRelativePath);
      const outputDirectory = path.dirname(outputPath);

      if (shouldVirtualizeFile(relativePath)) {
        const sourceText = fs.readFileSync(absolutePath, "utf8");
        const virtualized = createToolingVirtualLitsxSource(sourceText, {
          sourceFileName: outputRelativePath,
          plugins: getVirtualizationPlugins(relativePath),
        });
        const rewritten = rewriteLitsxSpecifiers(virtualized.code);

        fs.mkdirSync(outputDirectory, { recursive: true });
        fs.writeFileSync(outputPath, rewritten);
        writtenFiles.push(outputRelativePath);
        continue;
      }

      if (shouldCopyTextFile(relativePath)) {
        fs.mkdirSync(outputDirectory, { recursive: true });
        fs.copyFileSync(absolutePath, outputPath);
        writtenFiles.push(outputRelativePath);
      }
    }
  }

  return {
    repoRoot,
    outputRoot,
    writtenFiles: writtenFiles.sort(),
  };
}

function runCli() {
  const result = buildCodeqlVirtualSourceTree();
  process.stdout.write(
    `Generated CodeQL overlay at ${path.relative(result.repoRoot, result.outputRoot) || "."} with ${result.writtenFiles.length} files.\n`,
  );
}

const modulePath = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === modulePath) {
  runCli();
}
