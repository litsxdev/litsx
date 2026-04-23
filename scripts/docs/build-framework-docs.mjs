import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { cleanDir, writeFile } from "./shared/fs-utils.mjs";
import { fence } from "./shared/markdown-utils.mjs";

const rootDir = process.cwd();
const outputDir = path.join(rootDir, "website/docs/framework/generated");
const indexDtsPath = path.join(rootDir, "packages/litsx/src/index.d.ts");
const jsxRuntimeDtsPath = path.join(rootDir, "packages/litsx/src/jsx-runtime.d.ts");

const printer = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed });

function readSource(filePath) {
  const text = fs.readFileSync(filePath, "utf8");
  return ts.createSourceFile(filePath, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
}

function getJsDocSummary(node) {
  const docs = ts.getJSDocCommentsAndTags(node).filter((entry) => ts.isJSDoc(entry));
  const doc = docs[0];
  if (!doc?.comment) return "";
  return String(doc.comment).trim();
}

function printNode(node, sourceFile) {
  return printer.printNode(ts.EmitHint.Unspecified, node, sourceFile).trim();
}

function hasExportModifier(node) {
  return Boolean(node.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword));
}

function collectNamedDeclarations(sourceFile) {
  const declarations = new Map();

  for (const statement of sourceFile.statements) {
    if (!("name" in statement) || !statement.name?.text) continue;
    if (!hasExportModifier(statement)) continue;

    const name = statement.name.text;
    declarations.set(name, {
      name,
      summary: getJsDocSummary(statement),
      declaration: printNode(statement, sourceFile),
    });
  }

  return declarations;
}

function getItems(declarations, names) {
  return names
    .map((name) => declarations.get(name))
    .filter(Boolean);
}

function getDetailedReferenceLink(name) {
  const detailedReferenceNames = new Set([
    "ErrorBoundary",
    "SuspenseBoundary",
    "SuspenseList",
    "useAfterUpdate",
    "useOnCommit",
    "useOnConnect",
    "useEvent",
    "useEmit",
    "useState",
    "useReducedState",
    "useControlledState",
    "useAsyncState",
    "useOptimistic",
    "useTransition",
    "useDeferredValue",
    "useMemoValue",
    "usePrevious",
    "useHost",
    "useHostContent",
    "useTextContent",
    "useSlot",
    "useRef",
    "useCallbackRef",
    "useExpose",
    "useStableCallback",
    "useExternalStore",
    "useStyle",
  ]);

  if (!detailedReferenceNames.has(name)) return null;
  return `../../reference/generated/${name.toLowerCase()}.md`;
}

function section(title, intro, items) {
  const lines = [`## ${title}`, ""];

  if (intro) {
    lines.push(intro, "");
  }

  for (const item of items) {
    lines.push(`### \`${item.name}\``, "");
    if (item.summary) {
      lines.push(item.summary, "");
    }
    const detailedReferenceLink = getDetailedReferenceLink(item.name);
    if (detailedReferenceLink) {
      lines.push(`Detailed reference: [\`${item.name}\`](${detailedReferenceLink})`, "");
    }
    lines.push(fence(item.declaration, "ts"), "");
  }

  return lines;
}

const indexSource = readSource(indexDtsPath);
const jsxRuntimeSource = readSource(jsxRuntimeDtsPath);

const indexDeclarations = collectNamedDeclarations(indexSource);
const jsxRuntimeDeclarations = collectNamedDeclarations(jsxRuntimeSource);

const categories = [
  {
    title: "Core Types",
    intro: "These types describe the public authored language of Lit<sup>sx</sup>: JSX nodes, renderable values, refs, and component signatures.",
    declarations: indexDeclarations,
    names: [
      "LitsxJsxNode",
      "LitsxRenderable",
      "LitsxRef",
      "LitsxComponent",
    ],
  },
  {
    title: "JSX Surface Types",
    intro: "These types define how Lit<sup>sx</sup> models intrinsic elements, authored attributes, and the JSX-visible host element shape.",
    declarations: indexDeclarations,
    names: [
      "LitsxBaseAttributes",
      "LitsxDomAttributes",
      "LitsxHostElementProps",
      "LitsxElementProps",
      "LitsxIntrinsicElements",
    ],
  },
  {
    title: "Primitives",
    intro: "These are the native primitives that define asynchronous UI coordination and recoverable rendering failures in Lit<sup>sx</sup>.",
    declarations: indexDeclarations,
    names: [
      "ErrorBoundary",
      "SuspenseBoundary",
      "SuspenseList",
    ],
  },
  {
    title: "Primitive Props",
    intro: "These interfaces describe the public authored props of the native primitives.",
    declarations: indexDeclarations,
    names: [
      "ErrorBoundaryProps",
      "SuspenseBoundaryProps",
      "SuspenseListProps",
    ],
  },
  {
    title: "Lifecycle And Events",
    intro: "These hooks connect authored components to lifecycle timing, stable event callbacks, and DOM event emission.",
    declarations: indexDeclarations,
    names: [
      "useAfterUpdate",
      "useOnCommit",
      "useOnConnect",
      "useEvent",
      "useEmit",
    ],
  },
  {
    title: "State And Concurrency",
    intro: "These hooks own local state, controlled state, async state, optimistic overlays, and deferred rendering work.",
    declarations: indexDeclarations,
    names: [
      "useState",
      "useReducedState",
      "useControlledState",
      "useAsyncState",
      "useOptimistic",
      "useTransition",
      "useDeferredValue",
      "useMemoValue",
      "usePrevious",
    ],
  },
  {
    title: "Refs And Imperative APIs",
    intro: "These hooks model host access, mutable refs, callback refs, slot content, projected content, and imperative handles.",
    declarations: indexDeclarations,
    names: [
      "LitsxHostContent",
      "useHost",
      "useHostContent",
      "useTextContent",
      "useSlot",
      "useRef",
      "useId",
      "useCallbackRef",
      "useExpose",
      "useStableCallback",
    ],
  },
  {
    title: "External Integration",
    intro: "These APIs bridge Lit<sup>sx</sup> components to external state and dynamic host styling.",
    declarations: indexDeclarations,
    names: [
      "useExternalStore",
      "useStyle",
    ],
  },
  {
    title: "JSX Runtime",
    intro: "The JSX runtime is what lets editors, TypeScript, and compilers treat Lit<sup>sx</sup> as a first-class JSX framework.",
    declarations: jsxRuntimeDeclarations,
    names: [
      "Fragment",
      "LITSX_JSX_TYPE",
      "jsx",
      "jsxs",
      "JSX",
      "LitsxComponentProps",
    ],
  },
];

const includedNames = new Set(
  categories.flatMap((category) => category.names)
);

const explicitlyExcludedNames = new Set([
  "ErrorBoundaryElement",
  "SuspenseBoundaryElement",
  "SuspenseListElement",
  "ensureLazyElement",
]);

for (const name of explicitlyExcludedNames) {
  includedNames.add(name);
}

const uncategorizedIndexDeclarations = [...indexDeclarations.keys()].filter(
  (name) => !includedNames.has(name)
);
const uncategorizedJsxRuntimeDeclarations = [...jsxRuntimeDeclarations.keys()].filter(
  (name) => !includedNames.has(name)
);

if (uncategorizedIndexDeclarations.length > 0 || uncategorizedJsxRuntimeDeclarations.length > 0) {
  throw new Error(
    [
      "Framework docs generator has uncategorized public declarations.",
      uncategorizedIndexDeclarations.length > 0
        ? `index.d.ts: ${uncategorizedIndexDeclarations.join(", ")}`
        : null,
      uncategorizedJsxRuntimeDeclarations.length > 0
        ? `jsx-runtime.d.ts: ${uncategorizedJsxRuntimeDeclarations.join(", ")}`
        : null,
    ].filter(Boolean).join("\n")
  );
}

cleanDir(outputDir);

const frameworkLines = [
  "# Framework Reference",
  "",
  "This reference is generated from the public Lit<sup>sx</sup> type surface in `packages/litsx/src/*.d.ts`.",
  "",
  "It documents the framework API that authors write against. Internal helpers and transform-only support APIs are intentionally left out.",
  "",
  "## Language Model",
  "",
  "Lit<sup>sx</sup> is a framework for writing Lit-based web components with JSX.",
  "",
  "- JSX is the authored language",
  "- Lit is the rendering foundation",
  "- web components are the deployed unit",
  "- React compatibility is optional and exists only for legacy migration",
  "",
  "## JSX Surface",
  "",
  "Lit<sup>sx</sup> authoring is Lit-flavored:",
  "",
  "- event listeners use `@event`",
  "- property bindings use `.prop`",
  "- boolean attributes use `?attr`",
  "- component trees are authored in JSX rather than in tagged template literals",
  "",
];

for (const category of categories) {
  frameworkLines.push(
    ...section(
      category.title,
      category.intro,
      getItems(category.declarations, category.names)
    )
  );
}

writeFile(path.join(outputDir, "index.md"), frameworkLines.join("\n"));
