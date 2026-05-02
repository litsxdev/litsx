import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { cleanDir, writeFile } from "./shared/fs-utils.mjs";
import { fence, slugify } from "./shared/markdown-utils.mjs";

const rootDir = process.cwd();
const outputDir = path.join(rootDir, "website/docs/reference/generated");
const indexDtsPath = path.join(rootDir, "packages/litsx/src/index.d.ts");
const hooksPluginPath = path.join(rootDir, "packages/babel-preset-litsx/src/internal/transform-litsx-hooks.js");
const runtimeDocSourcePaths = [
  path.join(rootDir, "packages/litsx/src/effect-hooks.js"),
  path.join(rootDir, "packages/litsx/src/host-hooks.js"),
  path.join(rootDir, "packages/litsx/src/state-hooks.js"),
];
const errorBoundaryJsPath = path.join(rootDir, "packages/litsx/src/error-boundary.js");
const suspenseBoundaryJsPath = path.join(rootDir, "packages/litsx/src/suspense-boundary.js");
const suspenseListJsPath = path.join(rootDir, "packages/litsx/src/suspense-list.js");
const staticApis = [];
const stylingApis = ["useStyle"];

const printer = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed });

function read(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function readSourceFile(filePath, kind = ts.ScriptKind.TS) {
  return ts.createSourceFile(filePath, read(filePath), ts.ScriptTarget.Latest, true, kind);
}

function getCommentText(comment, { preserveWhitespace = false } = {}) {
  if (!comment) return "";
  if (typeof comment === "string") {
    return preserveWhitespace
      ? comment.trim()
      : comment.replace(/\s+/g, " ").trim();
  }
  if (Array.isArray(comment)) {
    const text = comment
      .map((part) => {
        if (!part) return "";
        if (typeof part === "string") return part;
        if ("text" in part && typeof part.text === "string") return part.text;
        return "";
      })
      .join(preserveWhitespace ? "" : " ");
    return preserveWhitespace
      ? text.trim()
      : text.replace(/\s+/g, " ").trim();
  }
  if (typeof comment === "object" && "text" in comment && typeof comment.text === "string") {
    return preserveWhitespace
      ? comment.text.trim()
      : comment.text.replace(/\s+/g, " ").trim();
  }
  return "";
}

function getAuthorHookNames() {
  const source = read(hooksPluginPath);
  const match = source.match(/const RUNTIME_HELPERS = \[([\s\S]*?)\];/);
  if (!match) return [];
  return match[1]
    .split(",")
    .map((entry) => entry.replace(/["'`\s]/g, ""))
    .filter(Boolean)
    .filter((name) => !["suspenseBoundary", "suspenseBoundaryList", "errorBoundary"].includes(name));
}

function getJsDoc(node) {
  const docs = ts.getJSDocCommentsAndTags(node).filter((entry) => ts.isJSDoc(entry));
  const doc = docs[0];
  const summary = getCommentText(doc?.comment);
  const tags = (doc?.tags ?? []).map((tag) => ({
    name: tag.tagName.text,
    text: getCommentText(tag.comment, {
      preserveWhitespace: tag.tagName.text === "example",
    }),
    paramName: "name" in tag && tag.name ? tag.name.getText() : "",
  }));
  return { summary, tags };
}

function printNode(node, sourceFile) {
  return printer.printNode(ts.EmitHint.Unspecified, node, sourceFile).trim();
}

function collectDeclarations(sourceFile, names) {
  const wanted = new Set(names);
  const found = new Map();

  for (const statement of sourceFile.statements) {
    if (!("name" in statement) || !statement.name?.text) continue;
    const name = statement.name.text;
    if (!wanted.has(name)) continue;
    const jsdoc = getJsDoc(statement);
    found.set(name, {
      name,
      node: statement,
      jsdoc,
      declaration: printNode(statement, sourceFile),
    });
  }

  return names.map((name) => found.get(name)).filter(Boolean);
}

function collectDocsFromSource(sourceFile, names) {
  const wanted = new Set(names);
  const found = new Map();

  for (const statement of sourceFile.statements) {
    if (!("name" in statement) || !statement.name?.text) continue;
    const name = statement.name.text;
    if (!wanted.has(name)) continue;
    found.set(name, getJsDoc(statement));
  }

  return found;
}

function collectDocsFromSources(sourceFiles, names) {
  const found = new Map();

  for (const sourceFile of sourceFiles) {
    for (const [name, docs] of collectDocsFromSource(sourceFile, names)) {
      found.set(name, docs);
    }
  }

  return found;
}

function toAuthoredSignature(item, sourceFile) {
  const node = item.node;

  if (ts.isFunctionDeclaration(node)) {
    const params = [...node.parameters];
    const authoredParams =
      params.length && params[0].name.getText(sourceFile) === "host"
        ? params.slice(1)
        : params;

    const clone = ts.factory.updateFunctionDeclaration(
      node,
      node.modifiers,
      node.asteriskToken,
      node.name,
      node.typeParameters,
      authoredParams,
      node.type,
      undefined
    );

    return printer.printNode(ts.EmitHint.Unspecified, clone, sourceFile).trim();
  }

  return item.declaration;
}

function findInterface(sourceFile, name) {
  for (const statement of sourceFile.statements) {
    if (ts.isInterfaceDeclaration(statement) && statement.name.text === name) {
      return statement;
    }
  }
  return null;
}

function authoredImport(name) {
  return `import { ${name} } from "litsx";`;
}

function inferUsage(item) {
  const usageTags = item.jsdoc.tags
    .filter((tag) => tag.name === "usage")
    .map((tag) => tag.text)
    .filter(Boolean);

  if (usageTags.length) {
    return usageTags;
  }

  const name = item.name;
  if (name === "SuspenseBoundary") {
    return [
      "Use `SuspenseBoundary` when part of a component tree may suspend and you want an explicit fallback boundary around that region.",
      "Treat it as a native Lit<sup>sx</sup> primitive for asynchronous UI, not as a compatibility wrapper."
    ];
  }
  if (name === "SuspenseList") {
    return [
      "Use `SuspenseList` to coordinate reveal order across several sibling `SuspenseBoundary` nodes.",
      "It is useful when fallback/content transitions should reveal in a predictable order."
    ];
  }
  if (name === "useRef") {
    return [
      "Call `useRef` when you need a mutable ref for authored Lit<sup>sx</sup> code, including refs attached to rendered elements.",
      "This keeps DOM refs and general mutable refs on the same primitive instead of splitting the model across two hooks."
    ];
  }
  return [
    `Call \`${name}\` in authored Lit<sup>sx</sup> code when you want this behavior in a component.`
  ];
}

function inferBehavior(item) {
  return item.jsdoc.tags
    .filter((tag) => tag.name === "behavior")
    .map((tag) => tag.text)
    .filter(Boolean);
}

function inferExamples(item) {
  return item.jsdoc.tags
    .filter((tag) => tag.name === "example")
    .map((tag) => tag.text)
    .filter(Boolean);
}

function inferNotes(item) {
  return item.jsdoc.tags
    .filter((tag) => tag.name === "note" || tag.name === "notes")
    .map((tag) => tag.text)
    .filter(Boolean);
}

function inferMentalModel(item) {
  return item.jsdoc.tags
    .filter((tag) => tag.name === "mentalModel")
    .map((tag) => tag.text)
    .filter(Boolean);
}

function inferPitfalls(item) {
  return item.jsdoc.tags
    .filter((tag) => tag.name === "pitfall" || tag.name === "pitfalls")
    .map((tag) => tag.text)
    .filter(Boolean);
}

function getParamTags(item) {
  return item.jsdoc.tags.filter((tag) => tag.name === "param");
}

function getParamDoc(item, paramName, index) {
  const paramTags = getParamTags(item);
  const namedMatch = paramTags.find((tag) => tag.paramName === paramName && tag.text);
  if (namedMatch) {
    return namedMatch.text;
  }

  const positionalMatch = paramTags[index];
  return positionalMatch?.text || "";
}

function getReturnsDoc(item) {
  return item.jsdoc.tags.find((tag) => tag.name === "returns" || tag.name === "return")?.text || "";
}

function classify(name) {
  if (name === "useStyle") return "Styling";
  if (name.startsWith("use")) return "Hook";
  return "Primitive";
}

function formatFunctionReference(item, sourceFile) {
  if (item.name === "useStyle") {
    return [
      "useStyle(propertyName: string, value: LitsxStyleValue): void",
      "useStyle(propertyName: string, compute: LitsxStyleFactory): void",
      "useStyle(propertyName: string, compute: LitsxStyleFactory, deps: unknown[]): void",
    ].join("\n");
  }

  return toAuthoredSignature(item, sourceFile)
    .replace(/^\/\*\*[\s\S]*?\*\/\s*/, "")
    .replace(/\/\*\*[\s\S]*?\*\//g, "")
    .replace(/^\s*export declare function\s+/, "")
    .replace(/;$/, "")
    .replace(/\s+/g, " ")
    .trim();
}

function getPrimitiveReference(name) {
  if (name === "ErrorBoundary") {
    return `<ErrorBoundary fallback={<span>Could not load profile.</span>}>\n  <ProfilePanel />\n</ErrorBoundary>`;
  }
  if (name === "SuspenseBoundary") {
    return `<SuspenseBoundary fallback={<span>Loading</span>}>\n  <Widget />\n</SuspenseBoundary>`;
  }
  if (name === "SuspenseList") {
    return `<SuspenseList revealOrder="forwards">\n  <SuspenseBoundary fallback={<span>Loading first</span>}>\n    <FirstPanel />\n  </SuspenseBoundary>\n  <SuspenseBoundary fallback={<span>Loading second</span>}>\n    <SecondPanel />\n  </SuspenseBoundary>\n</SuspenseList>`;
  }
  return name;
}

function getPropsRows(interfaceNode, sourceFile) {
  if (!interfaceNode) return [];
  return interfaceNode.members
    .filter((member) => ts.isPropertySignature(member) && member.name)
    .map((member) => ({
      name: member.name.getText(sourceFile),
      type: member.type?.getText(sourceFile) || "unknown",
      optional: Boolean(member.questionToken),
      description: getJsDoc(member).summary,
    }));
}

function getRelatedLinks(name) {
  if (name === "ErrorBoundary") {
    return [
      "- [SuspenseBoundary](./suspenseboundary.md)",
      "- [Primitives](../../guides/primitives.md)",
    ];
  }

  if (name === "SuspenseBoundary") {
    return [
      "- [SuspenseList](./suspenselist.md)",
      "- [Async UI](../../guides/suspense.md)",
    ];
  }

  if (name === "SuspenseList") {
    return [
      "- [SuspenseBoundary](./suspenseboundary.md)",
      "- [Async UI](../../guides/suspense.md)",
    ];
  }

  if (name === "useAfterUpdate") {
    return [
      "- [useOnCommit](./useoncommit.md)",
      "- [JSX Authoring](../../guides/jsx-authoring.md)",
    ];
  }

  if (name === "useOnCommit") {
    return [
      "- [useAfterUpdate](./useafterupdate.md)",
      "- [useRef](./useref.md)",
    ];
  }

  if (name === "useState") {
    return [
      "- [useReducedState](./usereducedstate.md)",
      "- [useTransition](./usetransition.md)",
    ];
  }

  if (name === "useReducedState") {
    return [
      "- [useState](./usestate.md)",
      "- [useStableCallback](./usestablecallback.md)",
    ];
  }

  if (name === "useMemoValue") {
    return [
      "- [useDeferredValue](./usedeferredvalue.md)",
      "- [useStableCallback](./usestablecallback.md)",
    ];
  }

  if (name === "useStableCallback") {
    return [
      "- [useMemoValue](./usememovalue.md)",
      "- [useExpose](./useexpose.md)",
    ];
  }

  if (name === "useTransition") {
    return [
      "- [useDeferredValue](./usedeferredvalue.md)",
      "- [useState](./usestate.md)",
    ];
  }

  if (name === "useDeferredValue") {
    return [
      "- [useTransition](./usetransition.md)",
      "- [useMemoValue](./usememovalue.md)",
    ];
  }

  if (name === "useExpose") {
    return [
      "- [useRef](./useref.md)",
      "- [Primitives](../../guides/primitives.md)",
    ];
  }

  if (name === "useExternalStore") {
    return [
      "- [useMemoValue](./usememovalue.md)",
      "- [useState](./usestate.md)",
    ];
  }

  if (name === "useStyle") {
    return [
      "- [Styling](../../guides/styling.md)",
    ];
  }

  return [
    "- [Primitives](../../guides/primitives.md)",
    "- [Framework Reference](../../framework/generated/)",
  ];
}

function buildPage(item, sourceFile) {
  const authoredSignature = toAuthoredSignature(item, sourceFile);
  const params = ts.isFunctionDeclaration(item.node)
    ? item.node.parameters.filter((param) => param.name.getText(sourceFile) !== "host")
    : [];
  const returns = ts.isFunctionDeclaration(item.node) ? item.node.type?.getText(sourceFile) || "" : "";
  const propsInterface = !item.name.startsWith("use")
    ? findInterface(sourceFile, `${item.name}Props`)
    : null;
  const propsRows = getPropsRows(propsInterface, sourceFile);
  const examples = inferExamples(item);
  const notes = inferNotes(item);
  const mentalModel = inferMentalModel(item);
  const pitfalls = inferPitfalls(item);
  const returnsDoc = getReturnsDoc(item);
  const slug = slugify(item.name);
  const lines = [
    `# ${item.name}`,
    "",
    item.jsdoc.summary || `${item.name} is part of the public Lit<sup>sx</sup> authored API.`,
    "",
    `- Kind: \`${classify(item.name)}\``,
    "",
    "## Reference",
    "",
    fence(authoredImport(item.name), "ts"),
    "",
    fence(
      ts.isFunctionDeclaration(item.node)
        ? formatFunctionReference(item, sourceFile)
        : (examples[0] || getPrimitiveReference(item.name)),
      ts.isFunctionDeclaration(item.node) ? "ts" : "tsx"
    ),
    "",
    "## Usage",
    "",
  ];

  for (const paragraph of inferUsage(item)) {
    lines.push(paragraph, "");
  }

  const behavior = inferBehavior(item);
  if (behavior.length) {
    lines.push("## Behavior", "");
    for (const paragraph of behavior) {
      lines.push(`- ${paragraph}`);
    }
    lines.push("");
  }

  if (mentalModel.length) {
    lines.push("## Mental Model", "");
    for (const paragraph of mentalModel) {
      lines.push(paragraph, "");
    }
  }

  if (notes.length) {
    lines.push("## Notes", "");
    for (const paragraph of notes) {
      lines.push(`- ${paragraph}`);
    }
    lines.push("");
  }

  if (examples.length) {
    lines.push("## Examples", "");
    for (const example of examples) {
      lines.push(fence(example, item.name.startsWith("use") ? "ts" : "tsx"), "");
    }
  }

  if (pitfalls.length) {
    lines.push("## Pitfalls", "");
    for (const paragraph of pitfalls) {
      lines.push(`- ${paragraph}`);
    }
    lines.push("");
  }

  if (item.name === "useStyle") {
    lines.push("## Parameters", "");
    lines.push("### `propertyName`", "", "Type: `string`", "", "CSS property name to set on the current host.", "");
    lines.push("### `value`", "", "Type: `LitsxStyleValue`", "", "Direct value assigned to that property for the current commit.", "");
    lines.push("### `compute`", "", "Type: `LitsxStyleFactory`", "", "Pure function that returns the value to assign after commit.", "");
    lines.push("### `deps?`", "", "Type: `unknown[]`", "", "Optional reactive inputs that control when the computed value should be recalculated. Omit them to recompute on every commit.", "");
  } else if (params.length) {
    lines.push("## Parameters", "");
    params.forEach((param, index) => {
      const paramName = param.name.getText(sourceFile);
      const paramType = param.type?.getText(sourceFile) || "unknown";
      lines.push(`### \`${paramName}\``, "", `Type: \`${paramType}\``);
      const paramDescription = getParamDoc(item, paramName, index + 1);
      if (paramDescription) {
        lines.push("", paramDescription);
      }
      lines.push("");
    });
  }

  if (returns && (returns !== "void" || returnsDoc)) {
    lines.push("## Returns", "", `Type: \`${returns}\``);
    if (returnsDoc) {
      lines.push("", returnsDoc);
    }
    lines.push("");
  }

  if (propsRows.length) {
    lines.push("## Props", "");
    for (const row of propsRows) {
      lines.push(`### \`${row.name}${row.optional ? "?" : ""}\``, "", `Type: \`${row.type}\``);
      if (row.description) {
        lines.push("", row.description);
      }
      lines.push("");
    }
  }

  lines.push("## Related", "");
  lines.push(...getRelatedLinks(item.name));

  return { slug, markdown: lines.join("\n") };
}

const sourceFile = readSourceFile(indexDtsPath);
const runtimeDocSources = runtimeDocSourcePaths.map((filePath) =>
  readSourceFile(filePath, ts.ScriptKind.JS)
);
const errorBoundarySource = readSourceFile(errorBoundaryJsPath, ts.ScriptKind.JS);
const suspenseBoundarySource = readSourceFile(suspenseBoundaryJsPath, ts.ScriptKind.JS);
const suspenseListSource = readSourceFile(suspenseListJsPath, ts.ScriptKind.JS);
const authorHookNames = [...new Set([
  "useState",
  ...getAuthorHookNames(),
].filter((name) => !["useEffect", "useLayoutEffect"].includes(name)))];
const primitives = ["ErrorBoundary", "SuspenseBoundary", "SuspenseList"];
const names = [...new Set([...primitives, ...authorHookNames, ...staticApis, ...stylingApis])];
const items = collectDeclarations(sourceFile, names);
const docsMap = new Map([
  ...collectDocsFromSources(runtimeDocSources, [...authorHookNames, ...staticApis, ...stylingApis]),
  ...collectDocsFromSource(errorBoundarySource, ["ErrorBoundary"]),
  ...collectDocsFromSource(suspenseBoundarySource, ["SuspenseBoundary"]),
  ...collectDocsFromSource(suspenseListSource, ["SuspenseList"]),
]);

for (const item of items) {
  const docs = docsMap.get(item.name);
  if (docs) {
    item.jsdoc = docs;
  }
}

cleanDir(outputDir);

for (const item of items) {
  const page = buildPage(item, sourceFile);
  writeFile(path.join(outputDir, `${page.slug}.md`), page.markdown);
}

const groups = {
  Primitives: items.filter((item) => classify(item.name) === "Primitive"),
  Hooks: items.filter((item) => classify(item.name) === "Hook"),
  "Static Declarations": items.filter((item) => classify(item.name) === "Static"),
  Styling: items.filter((item) => classify(item.name) === "Styling"),
};

const indexLines = [
  "# Reference",
  "",
  "This reference is generated from the public Lit<sup>sx</sup> authored API surface.",
  "",
  "It documents the APIs that developers write in Lit<sup>sx</sup> code, not the lower-level runtime helpers used to support compilation.",
  "",
];

for (const [group, groupItems] of Object.entries(groups)) {
  if (!groupItems.length) continue;
  const uniqueGroupItems = [...new Map(groupItems.map((item) => [item.name, item])).values()];
  indexLines.push(`## ${group}`, "");
  for (const item of uniqueGroupItems) {
    indexLines.push(`- [\`${item.name}\`](./${slugify(item.name)}.md)`);
  }
  indexLines.push("");
}

writeFile(path.join(outputDir, "index.md"), indexLines.join("\n"));
