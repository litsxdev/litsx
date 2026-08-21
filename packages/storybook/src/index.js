import fs from "node:fs/promises";
import path from "node:path";
import { prepareLitsxAuthoredInput } from "@litsx/compiler/authored-input";
import { transformLitsxSync } from "@litsx/compiler";
import { litsx } from "@litsx/vite-plugin";

const STORY_FILE_PATTERN = /\.stories\.[cm]?[jt]sx?(?:\?.*)?$/;

function normalizeTagName(tagName) {
  return typeof tagName === "string" && tagName.includes("-") ? tagName : null;
}

function toKebabCase(value) {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1-$2")
    .toLowerCase();
}

function findImportedValueSpecifier(moduleAnalysis, localName) {
  for (const entry of moduleAnalysis?.imports ?? []) {
    for (const specifier of entry.specifiers ?? []) {
      if (
        specifier?.kind === "value" &&
        specifier.localName === localName &&
        typeof specifier.importedName === "string"
      ) {
        return { ...specifier, importSource: entry.source };
      }
    }
  }

  return null;
}

function collectStoryRegistrations(
  moduleAnalysis = null,
  { nestedLocalNames = new Set() } = {},
) {
  if (!moduleAnalysis || !Array.isArray(moduleAnalysis.jsxReferences)) {
    return [];
  }

  const registrations = [];
  const seen = new Set();

  for (const entry of moduleAnalysis.jsxReferences) {
    if (
      entry?.source === "local-declaration" &&
      nestedLocalNames.has(entry.localName)
    ) {
      continue;
    }
    if (
      entry?.source !== "imported-authored-module" &&
      entry?.source !== "local-declaration"
    ) {
      continue;
    }

    const importedSpecifier =
      entry?.source === "imported-authored-module"
        ? findImportedValueSpecifier(moduleAnalysis, entry.localName)
        : null;
    const rawTagName =
      importedSpecifier &&
      importedSpecifier.importedName !== "default" &&
      importedSpecifier?.importedName !== "*"
        ? toKebabCase(importedSpecifier.importedName)
        : entry.tagName;
    const tagName = normalizeTagName(rawTagName);
    const constructorName = entry?.localName;
    if (!tagName || typeof constructorName !== "string" || seen.has(tagName)) {
      continue;
    }

    seen.add(tagName);
    registrations.push({
      tagName,
      constructorName,
      importedSpecifier,
    });
  }

  return registrations;
}

function createRegistrationSource(moduleAnalysis = null, options = {}) {
  const registrations = collectStoryRegistrations(moduleAnalysis, options);
  if (registrations.length === 0) {
    return "";
  }

  const imports = [];
  const definitions = [];
  registrations.forEach(
    ({ tagName, constructorName, importedSpecifier }, index) => {
      let bindingName = constructorName;
      if (importedSpecifier?.importSource) {
        bindingName = `__litsxStoryElement${index}`;
        const source = JSON.stringify(importedSpecifier.importSource);
        imports.push(
          importedSpecifier.importedName === "default"
            ? `import ${bindingName} from ${source};`
            : `import { ${importedSpecifier.importedName} as ${bindingName} } from ${source};`,
        );
      }
      definitions.push(
        `if (!customElements.get("${tagName}")) customElements.define("${tagName}", ${bindingName});`,
      );
    },
  );

  return `\n\n${[...imports, ...definitions].join("\n")}\n`;
}

const AUTHORED_MODULE_SUFFIXES = [
  ".tsx",
  ".jsx",
  ".litsx",
  "/index.tsx",
  "/index.jsx",
  "/index.litsx",
];

async function fileExists(filename) {
  try {
    await fs.access(filename);
    return true;
  } catch {
    return false;
  }
}

async function resolveAuthoredStoryReferences(moduleAnalysis, filename) {
  if (!Array.isArray(moduleAnalysis?.jsxReferences)) {
    return moduleAnalysis;
  }

  const references = await Promise.all(
    moduleAnalysis.jsxReferences.map(async (reference) => {
      if (
        reference?.source !== "imported-js-module" ||
        typeof reference.importSource !== "string" ||
        !reference.importSource.startsWith(".")
      ) {
        return reference;
      }

      const importPath = path.resolve(
        path.dirname(filename.split("?", 1)[0]),
        reference.importSource,
      );
      for (const suffix of AUTHORED_MODULE_SUFFIXES) {
        if (await fileExists(`${importPath}${suffix}`)) {
          return { ...reference, source: "imported-authored-module" };
        }
      }
      return reference;
    }),
  );

  return { ...moduleAnalysis, jsxReferences: references };
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
  const error = new Error(
    `Invalid LitSX story module in ${filename}: ${message}`,
  );
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
  const line =
    typeof error?.loc?.line === "number"
      ? error.loc.line
      : typeof error?.line === "number"
        ? error.line
        : null;
  const column =
    typeof error?.loc?.column === "number"
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
    const node =
      statement.type === "ExportNamedDeclaration"
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

function collectNestedLocalComponentReferences(program) {
  const localNames = new Set(
    [...getTopLevelLocalBindings(program).keys()].filter((name) =>
      /^[A-Z]/.test(name),
    ),
  );
  const nestedLocalNames = new Set();
  const topLevelLocalNames = new Set();

  const visit = (node, ownerName = null) => {
    if (!node || typeof node !== "object") {
      return;
    }

    if (
      node.type === "VariableDeclarator" &&
      node.id?.type === "Identifier" &&
      /^[A-Z]/.test(node.id.name) &&
      (node.init?.type === "ArrowFunctionExpression" ||
        node.init?.type === "FunctionExpression")
    ) {
      visit(node.init, node.id.name);
      return;
    }

    const nextOwner =
      node.type === "FunctionDeclaration" &&
      node.id?.type === "Identifier" &&
      /^[A-Z]/.test(node.id.name)
        ? node.id.name
        : ownerName;

    if (
      node.type === "JSXOpeningElement" &&
      node.name?.type === "JSXIdentifier" &&
      localNames.has(node.name.name)
    ) {
      if (nextOwner) {
        nestedLocalNames.add(node.name.name);
      } else {
        topLevelLocalNames.add(node.name.name);
      }
    }

    for (const [key, value] of Object.entries(node)) {
      if (
        key === "loc" ||
        key === "start" ||
        key === "end" ||
        key === "extra"
      ) {
        continue;
      }
      if (Array.isArray(value)) {
        value.forEach((child) => visit(child, nextOwner));
      } else {
        visit(value, nextOwner);
      }
    }
  };

  visit(program);
  return new Set(
    [...nestedLocalNames].filter((name) => !topLevelLocalNames.has(name)),
  );
}

function resolveExportValue(node, bindings, seen = new Set()) {
  if (!node) {
    return null;
  }

  if (node.type === "Identifier") {
    if (seen.has(node.name)) {
      return null;
    }
    seen.add(node.name);
    return resolveExportValue(bindings.get(node.name) ?? null, bindings, seen);
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
        const value = resolveExportValue(declarator.init, bindings);
        if (!value || value.type !== "ObjectExpression") {
          throw createStorybookValidationError(
            filename,
            `named export "${declarator.id.name}" must be a plain object literal.`,
            getNodeStartLoc(declarator.init ?? declarator),
          );
        }

        validateObjectExpressionShape(
          value,
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
      const exportName =
        specifier.exported?.name ?? specifier.local?.name ?? "<unknown>";
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

  return {
    nestedLocalNames: collectNestedLocalComponentReferences(program),
  };
}

async function readAuthoredStorySource(transformedSource, id) {
  const filename = id.split("?", 1)[0];
  if (!filename || filename.startsWith("\0")) {
    return transformedSource;
  }

  try {
    return await fs.readFile(filename, "utf8");
  } catch {
    return transformedSource;
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
    return loadCsf(
      code,
      createStorybookCsfLoadOptions(filename, makeTitle),
    ).parse();
  } catch (error) {
    throw createStorybookCsfError(filename, error);
  }
}

async function validateStorybookCsfWithLoader(
  code,
  filename,
  makeTitle = null,
  storybookCsfLoader = null,
) {
  if (typeof storybookCsfLoader === "function") {
    try {
      return storybookCsfLoader(
        code,
        createStorybookCsfLoadOptions(filename, makeTitle),
      ).parse();
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
  test: /\.stories\.[cm]?[jt]sx?$/,
  async createIndex(fileName, { makeTitle } = {}) {
    const source = await fs.readFile(fileName, "utf8");
    validateLitsxStoryModule(source, fileName);
    const transformed = transformLitsxSync(source, {
      filename: fileName,
      sourceMaps: false,
    });
    const parsed = await validateStorybookCsfWithLoader(
      transformed.code,
      fileName,
      makeTitle,
    );

    return parsed?.indexInputs ?? [];
  },
};

export function litsxStoryRegistrationPlugin(options = {}) {
  const compilerOptions = normalizeCompilerOptions(options);
  const storybookCsfLoader = options.storybookCsfLoader;

  return {
    name: "litsx-story-registration",
    enforce: "post",
    transform: {
      order: "post",
      async handler(source, id) {
        if (!STORY_FILE_PATTERN.test(id)) {
          return null;
        }

        const authoredSource = await readAuthoredStorySource(source, id);
        const storyAnalysis = validateLitsxStoryModule(
          authoredSource,
          id,
          compilerOptions,
        );
        const result = transformLitsxSync(authoredSource, {
          ...compilerOptions,
          filename: id,
          sourceMaps: false,
        });
        await validateStorybookCsfWithLoader(
          result.code,
          id,
          null,
          storybookCsfLoader,
        );
        const resolvedModuleAnalysis = await resolveAuthoredStoryReferences(
          result.metadata?.litsxModuleAnalysis,
          id,
        );
        const registrationSource = createRegistrationSource(
          resolvedModuleAnalysis,
          storyAnalysis,
        );
        if (!registrationSource) {
          return null;
        }

        return {
          code: `${source}${registrationSource}`,
          map: null,
        };
      },
    },
  };
}

export function withLitsxStorybookViteConfig(
  config = {},
  options = {},
  vitePlugins = {},
) {
  const compilerOptions = normalizeCompilerOptions(options);
  const beforeLitsx = Array.isArray(vitePlugins.beforeLitsx)
    ? vitePlugins.beforeLitsx
    : [];
  const afterLitsx = Array.isArray(vitePlugins.afterLitsx)
    ? vitePlugins.afterLitsx
    : [];

  return {
    ...config,
    optimizeDeps: withoutRollupOptimizeDepsOptions(config.optimizeDeps),
    plugins: [
      litsxStoryRegistrationPlugin(compilerOptions),
      ...beforeLitsx,
      ...(config.plugins ?? []),
      litsx({ sourceMaps: true, ...compilerOptions }),
      ...afterLitsx,
    ],
  };
}

export function createLitsxStorybookConfig(options = {}) {
  const {
    stories = [
      "../src/**/*.stories.@(js|jsx|ts|tsx|mdx)",
      "../src/**/*.docs.mdx",
    ],
    addons = ["@storybook/addon-docs", "@storybook/addon-a11y"],
    storybook = {},
    compiler = {},
    vitePlugins = {},
  } = options;

  return {
    framework: "@storybook/web-components-vite",
    stories,
    addons,
    ...storybook,
    async experimental_indexers(existingIndexers) {
      const baseIndexers =
        typeof storybook.experimental_indexers === "function"
          ? await storybook.experimental_indexers(existingIndexers)
          : existingIndexers;
      return [...baseIndexers, litsxStoriesIndexer];
    },
    async viteFinal(config) {
      const baseConfig =
        typeof storybook.viteFinal === "function"
          ? await storybook.viteFinal(config)
          : config;
      return withLitsxStorybookViteConfig(baseConfig, compiler, vitePlugins);
    },
  };
}
