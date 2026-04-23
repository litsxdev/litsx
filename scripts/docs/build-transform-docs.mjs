import path from "node:path";
import { pathToFileURL } from "node:url";
import babelCore from "@babel/core";
import parser from "../../packages/babel-parser-litsx/src/index.mjs";
import { cleanDir, listFiles, readIfExists, writeFile } from "./shared/fs-utils.mjs";
import { fence, slugify } from "./shared/markdown-utils.mjs";

const { transformFromAstSync } = babelCore;
const rootDir = process.cwd();
const outputDir = path.join(rootDir, "website/docs/transforms/generated");
const testsDir = path.join(rootDir, "test");
const moduleCache = new Map();

function repoModuleHref(...segments) {
  return pathToFileURL(path.join(rootDir, ...segments)).href;
}

function interopDefault(mod) {
  return mod?.default ?? mod;
}

async function loadModule(modulePath) {
  if (!moduleCache.has(modulePath)) {
    moduleCache.set(modulePath, import(modulePath));
  }
  return moduleCache.get(modulePath);
}

async function loadPlugin(modulePath) {
  const mod = await loadModule(modulePath);
  return interopDefault(mod);
}

function extractTests(source) {
  const tests = [];
  const pattern = /\b(?:it|test)\(\s*["'`](.+?)["'`]\s*,/g;
  const matches = [...source.matchAll(pattern)];

  for (let index = 0; index < matches.length; index += 1) {
    const current = matches[index];
    const next = matches[index + 1];
    const title = current[1];
    const bodyStart = current.index + current[0].length;
    const bodyEnd = next ? next.index : source.length;
    const body = source.slice(bodyStart, bodyEnd);

    tests.push({
      title,
      body,
      sources: extractSourceSnippets(body),
      expectedError: extractExpectedError(body),
    });
  }

  return tests;
}

function formatCaseTitle(title) {
  if (!title) return title;
  return title.charAt(0).toUpperCase() + title.slice(1);
}

function evaluateArrayLiteral(arraySource) {
  try {
    const parts = Function(`"use strict"; return [${arraySource}];`)();
    return Array.isArray(parts) ? parts.join("\n").trim() : "";
  } catch {
    return "";
  }
}

function isSourceVariableName(varName) {
  return varName === "source" || /Source$/.test(varName);
}

function extractSourceSnippets(testBody) {
  const snippets = [];

  for (const match of testBody.matchAll(/const\s+([A-Za-z0-9_]+)\s*=\s*\[([\s\S]*?)\]\.join\(["'`]\\n["'`]\);/g)) {
    const [, varName, arraySource] = match;
    if (!isSourceVariableName(varName)) continue;
    const code = evaluateArrayLiteral(arraySource);
    if (code) {
      snippets.push({
        label: labelFromVarName(varName),
        code,
      });
    }
  }

  for (const match of testBody.matchAll(/const\s+([A-Za-z0-9_]+)\s*=\s*`([\s\S]*?)`;/g)) {
    const [, varName, templateSource] = match;
    if (!isSourceVariableName(varName)) continue;
    const code = templateSource.trim();
    if (code) {
      snippets.push({
        label: labelFromVarName(varName),
        code,
      });
    }
  }

  return snippets;
}

function labelFromVarName(varName) {
  const bare = varName.replace(/Source$/, "");
  if (bare === "source") return "Authored Input";
  return bare
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/^./, (char) => char.toUpperCase())
    .concat(" Source");
}

function extractExpectedError(testBody) {
  const match = testBody.match(/assert\.throws\([\s\S]*?,\s*\/(.+?)\/[gimsuy]*\)/);
  return match ? match[1] : "";
}

function createTransformResult(code) {
  return { kind: "code", value: code };
}

function createErrorResult(error) {
  return { kind: "error", value: error instanceof Error ? error.message : String(error) };
}

function createRunner(pipeline, run) {
  return { pipeline, run };
}

function normalizeParserPlugins(plugins = []) {
  return Array.from(new Set(plugins));
}

function parseAuthoredSource(source, parserOptions = {}) {
  const explicitPlugins = normalizeParserPlugins(parserOptions.plugins || []);
  const parserAttempts = [{ ...parserOptions, plugins: explicitPlugins }];

  if (!explicitPlugins.includes("typescript")) {
    parserAttempts.push({
      ...parserOptions,
      plugins: normalizeParserPlugins([...explicitPlugins, "typescript"]),
    });
  }

  let lastError = null;

  for (const options of parserAttempts) {
    try {
      return parser.parse(source, { sourceType: "module", ...options });
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError;
}

function transformCode(source, pluginsOrConfig, options = {}) {
  const ast = parseAuthoredSource(source, options.parser || {});
  const transformConfig = Array.isArray(pluginsOrConfig)
    ? { plugins: pluginsOrConfig }
    : pluginsOrConfig;
  const result = transformFromAstSync(ast, source, {
    configFile: false,
    babelrc: false,
    ...transformConfig,
    ...options.transform,
  });
  return result.code;
}

async function getRunner(fileName) {
  switch (fileName) {
    case "babel-plugin-transform-jsx-html-template.test.js": {
      const plugin = await loadPlugin(repoModuleHref("packages", "babel-plugin-transform-jsx-html-template", "src", "index.js"));
      return createRunner(
        ["@litsx/babel-plugin-transform-jsx-html-template"],
        (source, testBody) => {
        let plugins = [plugin];
        if (testBody.includes("tag: \"\"")) {
          plugins = [[plugin, { tag: "" }]];
        } else if (testBody.includes("tag: \"svg\"")) {
          plugins = [[plugin, { tag: "svg" }]];
        }
        return createTransformResult(transformCode(source, plugins));
        }
      );
    }
    case "babel-preset-litsx.test.js": {
      const preset = await loadPlugin(repoModuleHref("packages", "babel-preset-litsx", "src", "index.js"));
      return createRunner(["@litsx/babel-preset-litsx"], (source) =>
        createTransformResult(transformCode(source, { presets: [[preset, {}]] }))
      );
    }
    case "babel-preset-react-compat.test.js":
    case "babel-preset-react-compat-suspense.test.js":
    case "react-compat-internal-lazy.test.js": {
      const reactCompatPreset = await loadPlugin(repoModuleHref("packages", "babel-preset-react-compat", "src", "index.js"));
      return createRunner(
        ["@litsx/babel-preset-react-compat"],
        (source) =>
        createTransformResult(
          transformCode(source, {
            presets: [[reactCompatPreset, {}]],
          }, {
            transform: { generatorOpts: { decoratorsBeforeExport: true } },
          })
        )
      );
    }
    case "babel-plugin-transform-litsx-scoped-elements.test.js": {
      const plugin = await loadPlugin(repoModuleHref("packages", "babel-plugin-transform-litsx-scoped-elements", "src", "index.js"));
      return createRunner(["@litsx/babel-plugin-transform-litsx-scoped-elements"], (source) =>
        createTransformResult(transformCode(source, [plugin]))
      );
    }
    case "react-compat-internal-error-boundary.test.js": {
      const plugin = await loadPlugin(repoModuleHref("packages", "babel-preset-react-compat", "src", "internal", "react-error-boundary.js"));
      return createRunner(["@litsx/babel-plugin-transform-react-error-boundary"], (source) =>
        createTransformResult(transformCode(source, [plugin]))
      );
    }
    case "react-compat-internal-events.test.js": {
      const plugin = await loadPlugin(repoModuleHref("packages", "babel-preset-react-compat", "src", "internal", "react-events.js"));
      const templatePlugin = await loadPlugin(repoModuleHref("packages", "babel-plugin-transform-jsx-html-template", "src", "index.js"));
      return createRunner(
        ["@litsx/babel-plugin-transform-react-events", "@litsx/babel-plugin-transform-jsx-html-template?"],
        (source, testBody) => {
        let plugins = [plugin];
        if (testBody.includes("templatePlugin, plugin")) {
          plugins = [templatePlugin, plugin];
        } else if (testBody.includes("lowercaseEventNames: false")) {
          plugins = [[plugin, { lowercaseEventNames: false }]];
        }
        return createTransformResult(transformCode(source, plugins));
        }
      );
    }
    case "react-compat-internal-external-hooks.test.js": {
      const jsxPluginModule = await loadModule("@babel/plugin-syntax-jsx");
      const jsxPlugin = interopDefault(jsxPluginModule);
      const effectsModule = await loadModule(repoModuleHref("packages", "babel-preset-react-compat", "src", "internal", "react-hooks.js"));
      const sharedHooksModule = await loadModule(repoModuleHref("packages", "babel-preset-react-compat", "src", "internal", "react-shared-hooks.js"));
      const useStatePlugin = sharedHooksModule.reactUseState;
      const effectsPlugin = interopDefault(effectsModule);
      return createRunner(
        ["@babel/plugin-syntax-jsx", "@litsx/babel-plugin-transform-react-hooks", "@litsx/babel-plugin-transform-react-usestate"],
        (source, testBody) =>
        createTransformResult(
          transformCode(source, [jsxPlugin, effectsPlugin, useStatePlugin], {
            parser: { plugins: ["jsx"] },
            transform: testBody.includes("decoratorsBeforeExport")
              ? { generatorOpts: { decoratorsBeforeExport: true } }
              : {},
          })
        )
      );
    }
    case "react-compat-internal-hooks.test.js": {
      const plugin = await loadPlugin(repoModuleHref("packages", "babel-preset-react-compat", "src", "internal", "react-hooks.js"));
      return createRunner(["@litsx/babel-plugin-transform-react-hooks"], (source) =>
        createTransformResult(
          transformCode(source, [plugin], {
            transform: { generatorOpts: { decoratorsBeforeExport: true } },
          })
        )
      );
    }
    case "react-compat-internal-useref.test.js": {
      const sharedHooksModule = await loadModule(repoModuleHref("packages", "babel-preset-react-compat", "src", "internal", "react-shared-hooks.js"));
      const plugin = sharedHooksModule.reactUseRef;
      return createRunner(["@litsx/babel-plugin-transform-react-useref"], (source, testBody) =>
        createTransformResult(
          transformCode(source, [plugin], {
            parser: testBody.includes('plugins: ["jsx"]') ? { plugins: ["jsx"] } : {},
            transform: testBody.includes("decoratorsBeforeExport")
              ? { generatorOpts: { decoratorsBeforeExport: true } }
              : {},
          })
        )
      );
    }
    default:
      return null;
  }
}

function inferInterpretation(title) {
  const text = title.toLowerCase();

  if (text.includes("throws")) {
    return "This case documents an intentionally unsupported construct and the failure mode that callers should expect.";
  }
  if (text.includes("rewrites")) {
    return "This case shows the authored JSX/API surface and the normalized output produced by the compatibility transform.";
  }
  if (text.includes("keeps") || text.includes("leaves")) {
    return "This case highlights syntax that should survive the transform unchanged or be preserved semantically.";
  }
  if (text.includes("supports") || text.includes("handles") || text.includes("allows")) {
    return "This case captures supported authored syntax and the emitted code path used to preserve that behavior.";
  }
  if (text.includes("injects")) {
    return "This case documents code that is synthesized by the transform, not written directly by the user.";
  }
  if (text.includes("derives")) {
    return "This case shows how the transform infers output details from the authored binding rather than from explicit configuration.";
  }
  return "This case records the authored input and the generated output as a living transform contract.";
}

function normalizeDocRel(rel) {
  return rel;
}

cleanDir(outputDir);

const files = listFiles(testsDir, (filePath) => {
  if (!/babel-(?:plugin-transform|preset-).+\.test\.js$/.test(filePath)) {
    return false;
  }
  return true;
});

const pages = [];
const seenDocs = new Set();

for (const filePath of files) {
  const source = readIfExists(filePath);
  if (!source) continue;

  const rel = normalizeDocRel(path.relative(rootDir, filePath).replace(/\\/g, "/"));
  if (seenDocs.has(rel)) {
    continue;
  }
  seenDocs.add(rel);
  const suiteLabelMatch = source.match(/describe\(\s*["'`](.+?)["'`]/);
  const suiteLabel = suiteLabelMatch ? suiteLabelMatch[1] : rel;
  const tests = extractTests(source);
  const slug = slugify(rel);
  const runner = await getRunner(path.basename(filePath));
  const lines = [
    `# ${suiteLabel}`,
    "",
    `Source: \`${rel}\``,
    "",
    "Generated from transform tests.",
    "",
  ];

  if (runner?.pipeline?.length) {
    lines.push("## Pipeline", "");
    for (const step of runner.pipeline) {
      lines.push(`- \`${step}\``);
    }
    lines.push("");
  }

  lines.push(
    "## Covered Cases",
    "",
  );

  if (tests.length) {
    for (const test of tests) {
      lines.push(`### ${formatCaseTitle(test.title)}`, "");
      lines.push("#### Interpretation", "", inferInterpretation(test.title), "");

      if (test.sources.length) {
        for (const snippet of test.sources) {
          lines.push(`#### ${snippet.label}`, "", fence(snippet.code, "jsx"), "");

          if (runner) {
            try {
              const result = runner.run(snippet.code, test.body);
              if (result?.kind === "code" && result.value) {
                lines.push("#### Generated Output", "", fence(result.value, "js"), "");
              } else if (result?.kind === "error" && result.value) {
                lines.push("#### Generated Error", "", fence(result.value, "txt"), "");
              }
            } catch (error) {
              lines.push("#### Generated Error", "", fence(error?.message || String(error), "txt"), "");
            }
          }
        }
      } else {
        lines.push("- No inline source fixture extracted for this case.", "");
      }

      if (test.expectedError) {
        lines.push("#### Expected Error", "", fence(test.expectedError, "txt"), "");
      }
    }
  } else {
    lines.push("- No explicit test titles found.");
  }

  writeFile(path.join(outputDir, `${slug}.md`), lines.join("\n"));
  pages.push({ label: rel, slug });
}

const indexLines = [
  "# Generated Transform Docs",
  "",
  "These pages summarize the transform suites that act as living examples.",
  "",
];

for (const page of pages) {
  indexLines.push(`- [${page.label}](./${page.slug}.md)`);
}

writeFile(path.join(outputDir, "index.md"), indexLines.join("\n"));
