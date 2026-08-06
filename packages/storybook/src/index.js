import fs from "node:fs/promises";
import { prepareLitsxAuthoredInput } from "@litsx/compiler/authored-input";
import { transformLitsxSync } from "@litsx/compiler";
import { litsx } from "@litsx/vite-plugin";

const STORY_FILE_PATTERN = /\.stories\.litsx(?:\?.*)?$/;

function normalizeTagName(tagName) {
  return typeof tagName === "string" && tagName.includes("-")
    ? tagName
    : null;
}

function toKebabCase(value) {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1-$2")
    .toLowerCase();
}

function resolveImportedAuthoredTagName(moduleAnalysis, localName, fallbackTagName) {
  for (const entry of moduleAnalysis?.imports ?? []) {
    for (const specifier of entry.specifiers ?? []) {
      if (
        specifier?.kind === "value" &&
        specifier.localName === localName &&
        typeof specifier.importedName === "string" &&
        specifier.importedName !== "default" &&
        specifier.importedName !== "*"
      ) {
        return toKebabCase(specifier.importedName);
      }
    }
  }

  return fallbackTagName;
}

function collectStoryRegistrations(moduleAnalysis = null) {
  if (!moduleAnalysis || !Array.isArray(moduleAnalysis.jsxReferences)) {
    return [];
  }

  const registrations = [];
  const seen = new Set();

  for (const entry of moduleAnalysis.jsxReferences) {
    if (
      entry?.source !== "imported-authored-module" &&
      entry?.source !== "local-declaration"
    ) {
      continue;
    }

    const rawTagName = entry?.source === "imported-authored-module"
      ? resolveImportedAuthoredTagName(moduleAnalysis, entry.localName, entry.tagName)
      : entry.tagName;
    const tagName = normalizeTagName(rawTagName);
    const constructorName = entry?.localName;
    if (!tagName || typeof constructorName !== "string" || seen.has(tagName)) {
      continue;
    }

    seen.add(tagName);
    registrations.push({ tagName, constructorName });
  }

  return registrations;
}

function createRegistrationSource(moduleAnalysis = null) {
  const registrations = collectStoryRegistrations(moduleAnalysis);
  if (registrations.length === 0) {
    return "";
  }

  return `\n\n${registrations
    .map(
      ({ tagName, constructorName }) =>
        `if (!customElements.get("${tagName}")) customElements.define("${tagName}", ${constructorName});`,
    )
    .join("\n")}\n`;
}

function withoutRollupOptimizeDepsOptions(optimizeDeps = {}) {
  const nextOptimizeDeps = { ...optimizeDeps };
  delete nextOptimizeDeps.rollupOptions;
  return nextOptimizeDeps;
}

function normalizeCompilerOptions(options = {}) {
  const next = { ...options };
  delete next.sourceMaps;
  delete next.jsxTemplate;
  delete next.storybookCsfLoader;
  return next;
}

function getNodeStartLoc(node) {
  const line = node?.loc?.start?.line;
  const column = node?.loc?.start?.column;
  return typeof line === "number" && typeof column === "number"
    ? { line, column }
    : null;
}

function createStorybookValidationError(filename, message, loc = null) {
  const error = new Error(`Invalid LitSX story module in ${filename}: ${message}`);
  error.code = "LITSX_STORYBOOK_INVALID_STORY_MODULE";
  if (loc) {
    error.loc = { file: filename, line: loc.line, column: loc.column };
    error.line = loc.line;
    error.column = loc.column;
  }
  return error;
}

function createStorybookCsfError(filename, error) {
  const wrapped = new Error(
    `Invalid Storybook CSF generated from ${filename}: ${error?.message || "Unknown Storybook parsing error."}`,
  );
  wrapped.code = "LITSX_STORYBOOK_INVALID_CSF";
  const line = typeof error?.loc?.line === "number"
    ? error.loc.line
    : typeof error?.line === "number"
      ? error.line
      : null;
  const column = typeof error?.loc?.column === "number"
    ? error.loc.column
    : typeof error?.column === "number"
      ? error.column
      : null;
  if (line != null && column != null) {
    wrapped.loc = { file: filename, line, column };
    wrapped.line = line;
    wrapped.column = column;
  }
  wrapped.cause = error;
  return wrapped;
}

function createStorybookCsfLoadOptions(filename, makeTitle) {
  return {
    fileName: filename,
    makeTitle: typeof makeTitle === "function" ? makeTitle : (title) => title,
  };
}

function getTopLevelLocalBindings(program) {
  const bindings = new Map();

  for (const statement of program.body || []) {
    const node = statement.type === "ExportNamedDeclaration"
      ? statement.declaration
      : statement.type === "ExportDefaultDeclaration"
        ? statement.declaration
        : statement;
    if (!node) {
      continue;
    }

    if (
      node.type === "FunctionDeclaration" ||
      node.type === "ClassDeclaration"
    ) {
      if (node.id?.name) {
        bindings.set(node.id.name, node);
      }
      continue;
    }

    if (node.type !== "VariableDeclaration") {
      continue;
    }

    for (const declarator of node.declarations || []) {
      if (declarator.id?.type === "Identifier") {
        bindings.set(declarator.id.name, declarator.init ?? null);
      }
    }
  }

  return bindings;
}

function resolveExportValue(node, bindings) {
  if (!node) {
    return null;
  }

  if (node.type === "Identifier") {
    return bindings.get(node.name) ?? null;
  }

  return node;
}

function validateObjectExpressionShape(objectExpression, filename, label) {
  for (const property of objectExpression.properties || []) {
    if (property.type !== "ObjectProperty") {
      throw createStorybookValidationError(
        filename,
        `${label} only supports plain object properties.`,
        getNodeStartLoc(property),
      );
    }

    if (property.computed) {
      throw createStorybookValidationError(
        filename,
        `${label} does not support computed property keys.`,
        getNodeStartLoc(property),
      );
    }

    const isSupportedKeyShape =
      property.key?.type === "Identifier" ||
      property.key?.type === "StringLiteral";
    if (!isSupportedKeyShape) {
      throw createStorybookValidationError(
        filename,
        `${label} only supports identifier or string-literal property keys.`,
        getNodeStartLoc(property.key ?? property),
      );
    }
  }
}

function validateLitsxStoryModule(source, filename, compilerOptions = {}) {
  const { inputAst } = prepareLitsxAuthoredInput(source, {
    ...compilerOptions,
    filename,
    requireJsx: true,
  });
  const program = inputAst?.program;
  const bindings = getTopLevelLocalBindings(program);
  let sawDefaultExport = false;

  for (const statement of program.body || []) {
    if (statement.type === "ExportDefaultDeclaration") {
      sawDefaultExport = true;
      const value = resolveExportValue(statement.declaration, bindings);
      if (!value || value.type !== "ObjectExpression") {
        throw createStorybookValidationError(
          filename,
          "default export must be a plain object literal or a local const bound to one.",
          getNodeStartLoc(statement.declaration),
        );
      }

      validateObjectExpressionShape(value, filename, "default export");
      continue;
    }

    if (statement.type !== "ExportNamedDeclaration") {
      continue;
    }

    if (statement.source) {
      throw createStorybookValidationError(
        filename,
        "re-exports are not supported in LitSX story modules.",
        getNodeStartLoc(statement.source),
      );
    }

    if (statement.declaration?.type === "VariableDeclaration") {
      for (const declarator of statement.declaration.declarations || []) {
        if (declarator.id?.type !== "Identifier") {
          throw createStorybookValidationError(
            filename,
            "named story exports must use identifier bindings.",
            getNodeStartLoc(declarator.id ?? declarator),
          );
        }
        if (!declarator.init || declarator.init.type !== "ObjectExpression") {
          throw createStorybookValidationError(
            filename,
            `named export "${declarator.id.name}" must be a plain object literal.`,
            getNodeStartLoc(declarator.init ?? declarator),
          );
        }

        validateObjectExpressionShape(
          declarator.init,
          filename,
          `named export "${declarator.id.name}"`,
        );
      }
      continue;
    }

    if (statement.declaration) {
      throw createStorybookValidationError(
        filename,
        "named story exports must be object literals, not functions or classes.",
        getNodeStartLoc(statement.declaration),
      );
    }

    for (const specifier of statement.specifiers || []) {
      const exportName = specifier.exported?.name ?? specifier.local?.name ?? "<unknown>";
      const value = resolveExportValue(specifier.local, bindings);
      if (!value || value.type !== "ObjectExpression") {
        throw createStorybookValidationError(
          filename,
          `named export "${exportName}" must resolve to a plain object literal.`,
          getNodeStartLoc(specifier.local ?? specifier),
        );
      }

      validateObjectExpressionShape(
        value,
        filename,
        `named export "${exportName}"`,
      );
    }
  }

  if (!sawDefaultExport) {
    throw createStorybookValidationError(
      filename,
      "default export is required and must define the story meta object.",
    );
  }
}

async function validateStorybookCsf(code, filename, makeTitle = null) {
  let loadCsf;
  try {
    ({ loadCsf } = await import("storybook/internal/csf-tools"));
  } catch (error) {
    if (error?.code === "ERR_MODULE_NOT_FOUND") {
      return null;
    }
    throw error;
  }

  try {
    return loadCsf(code, createStorybookCsfLoadOptions(filename, makeTitle)).parse();
  } catch (error) {
    throw createStorybookCsfError(filename, error);
  }
}

async function validateStorybookCsfWithLoader(code, filename, makeTitle = null, storybookCsfLoader = null) {
  if (typeof storybookCsfLoader === "function") {
    try {
      return storybookCsfLoader(code, createStorybookCsfLoadOptions(filename, makeTitle)).parse();
    } catch (error) {
      throw createStorybookCsfError(filename, error);
    }
  }

  try {
    return await validateStorybookCsf(code, filename, makeTitle);
  } catch (error) {
    throw error;
  }
}

export const litsxStoriesIndexer = {
  test: /\.stories\.litsx$/,
  async createIndex(fileName, { makeTitle } = {}) {
    const source = await fs.readFile(fileName, "utf8");
    validateLitsxStoryModule(source, fileName);
    const transformed = transformLitsxSync(source, {
      filename: fileName,
      sourceMaps: false,
    });
    const parsed = await validateStorybookCsfWithLoader(transformed.code, fileName, makeTitle);

    return parsed?.indexInputs ?? [];
  },
};

export function litsxStoryRegistrationPlugin(options = {}) {
  const compilerOptions = normalizeCompilerOptions(options);
  const storybookCsfLoader = options.storybookCsfLoader;

  return {
    name: "litsx-story-registration",
    enforce: "pre",
    async transform(source, id) {
      if (!STORY_FILE_PATTERN.test(id)) {
        return null;
      }

      validateLitsxStoryModule(source, id, compilerOptions);
      const result = transformLitsxSync(source, {
        ...compilerOptions,
        filename: id,
        jsxTemplate: false,
        sourceMaps: false,
      });
      await validateStorybookCsfWithLoader(result.code, id, null, storybookCsfLoader);
      const registrationSource = createRegistrationSource(
        result.metadata?.litsxModuleAnalysis,
      );

      if (!registrationSource) {
        return null;
      }

      return {
        code: `${source}${registrationSource}`,
        map: null,
      };
    },
  };
}

export function withLitsxStorybookViteConfig(config = {}, options = {}) {
  const compilerOptions = normalizeCompilerOptions(options);

  return {
    ...config,
    optimizeDeps: withoutRollupOptimizeDepsOptions(config.optimizeDeps),
    plugins: [
      ...(config.plugins ?? []),
      litsxStoryRegistrationPlugin(compilerOptions),
      litsx({ sourceMaps: true, ...compilerOptions }),
    ],
  };
}

export function createLitsxStorybookConfig(options = {}) {
  const {
    stories = ["../src/**/*.stories.@(js|jsx|ts|tsx|litsx|mdx)", "../src/**/*.docs.mdx"],
    addons = ["@storybook/addon-docs", "@storybook/addon-a11y"],
    storybook = {},
    compiler = {},
  } = options;

  return {
    framework: "@storybook/web-components-vite",
    stories,
    addons,
    ...storybook,
    async experimental_indexers(existingIndexers) {
      const baseIndexers = typeof storybook.experimental_indexers === "function"
        ? await storybook.experimental_indexers(existingIndexers)
        : existingIndexers;
      return [...baseIndexers, litsxStoriesIndexer];
    },
    async viteFinal(config) {
      const baseConfig = typeof storybook.viteFinal === "function"
        ? await storybook.viteFinal(config)
        : config;
      return withLitsxStorybookViteConfig(baseConfig, compiler);
    },
  };
}
