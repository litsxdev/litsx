import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { pathToFileURL } from "node:url";
import { collectSoftSuspenseThenables } from "@litsx/core";
import { __litsxScopedTemplate } from "@litsx/core/elements";
import { withCurrentSsrRuntimeState } from "./ssr-state.js";

/**
 * Default JSON script id used by `renderClientImportsData()`.
 */
export const LITSX_CLIENT_IMPORTS_SCRIPT_ID = "__LITSX_CLIENT_IMPORTS__";

/**
 * Default JSON script id used by `renderHydrationData()`.
 */
export const LITSX_HYDRATION_DATA_SCRIPT_ID = "__LITSX_HYDRATION__";
export const LITSX_AUTHORED_SSR_ENTRY = Symbol.for("@litsx/ssr/authored-entry");
export const LITSX_SSR_MAX_SUSPENSE_PASSES_ERROR =
  "LITSX_SSR_MAX_SUSPENSE_PASSES_EXCEEDED";

const DEV_TEMPLATE_TITLE_MARKER = "<!--app-title-->";
const DEV_TEMPLATE_HEAD_MARKER = "<!--app-head-->";
const DEV_TEMPLATE_HTML_MARKER = "<!--app-html-->";
const DEV_TEMPLATE_BOOTSTRAP_MARKER = "<!--app-bootstrap-->";
const DEFAULT_MAX_SUSPENSE_PASSES = 25;

let ssrRuntimePromise;

async function loadSsrRuntime() {
  ssrRuntimePromise ??= Promise.all([
    import("./scoped-rendering.js"),
    import("./values.js"),
  ]).then(([scopedRendering, values]) => ({
    createScopedSsrContext: scopedRendering.createScopedSsrContext,
    renderScopedTemplateToChunks: scopedRendering.renderScopedTemplateToChunks,
    renderScopedTemplateWithLitSsr: scopedRendering.renderScopedTemplateWithLitSsr,
    resolveTopLevelSsrValue: values.resolveTopLevelSsrValue,
  }));
  return ssrRuntimePromise;
}

function escapeHtmlText(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function escapeHtmlAttribute(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function escapeJsonScript(value) {
  return JSON.stringify(value)
    .replaceAll("<", "\\u003C")
    .replaceAll(">", "\\u003E")
    .replaceAll("&", "\\u0026");
}

function escapeInlineScriptText(value) {
  return String(value)
    .replaceAll("<", "\\u003C")
    .replaceAll(">", "\\u003E")
    .replaceAll("&", "\\u0026");
}

function normalizeTagContents(value) {
  if (value == null) {
    return "";
  }

  return Array.isArray(value)
    ? value.filter((entry) => entry != null && entry !== "").join("")
    : String(value);
}

function renderHtmlAttributes(attributes = {}) {
  if (!attributes || typeof attributes !== "object") {
    return "";
  }

  const entries = Object.entries(attributes)
    .flatMap(([name, value]) => {
      if (value == null || value === false) {
        return [];
      }

      if (value === true) {
        return [` ${name}`];
      }

      return [` ${name}="${escapeHtmlAttribute(value)}"`];
    });

  return entries.join("");
}

function renderBootstrapScript(bootstrap) {
  if (!bootstrap) {
    return "";
  }

  if (typeof bootstrap === "string") {
    return `<script type="module" src="${escapeHtmlAttribute(bootstrap)}"></script>`;
  }

  const type = bootstrap.type ?? "module";
  const attributes = renderHtmlAttributes(bootstrap.attributes);

  if (bootstrap.src) {
    return `<script type="${escapeHtmlAttribute(type)}"${attributes} src="${escapeHtmlAttribute(bootstrap.src)}"></script>`;
  }

  if (bootstrap.content) {
    return `<script type="${escapeHtmlAttribute(type)}"${attributes}>${bootstrap.content}</script>`;
  }

  return "";
}

function renderClientEntryBootstrapScript(clientEntry) {
  if (!clientEntry) {
    return "";
  }

  const source = `
import { hydratePage } from "@litsx/ssr/client";

await hydratePage({
  register: () => import(${JSON.stringify(clientEntry)}),
});
`;

  return `<script type="module">${escapeInlineScriptText(source)}</script>`;
}

function createHydrationData(context) {
  if (context.hydrationData.roots.length === 0) {
    return null;
  }

  const data = {
    version: context.hydrationData.version,
    roots: context.hydrationData.roots,
  };
  const payload = context.hydrationData.payload;
  const clientImports = [...context.clientImports];

  Object.defineProperties(data, {
    payload: {
      enumerable: false,
      value: payload,
    },
    clientImports: {
      enumerable: false,
      value: clientImports,
    },
    toJSON: {
      enumerable: false,
      value() {
        return {
          version: data.version,
          roots: data.roots,
          payload,
          clientImports,
        };
      },
    },
  });

  return data;
}

function createSsrResult(html, context) {
  const clientImports = [...context.clientImports];
  const hydrationData = createHydrationData(context);

  return {
    html,
    clientImports,
    hydrationData,
    renderClientImports() {
      return clientImports
        .map((src) => `<script type="module" src="${escapeHtmlAttribute(src)}"></script>`)
        .join("");
    },
    renderClientImportsData(
      scriptId = LITSX_CLIENT_IMPORTS_SCRIPT_ID,
    ) {
      if (clientImports.length === 0) {
        return "";
      }

      return `<script type="application/json" id="${escapeHtmlAttribute(scriptId)}">${escapeJsonScript(clientImports)}</script>`;
    },
    renderModulePreloads() {
      return clientImports
        .map((href) => `<link rel="modulepreload" href="${escapeHtmlAttribute(href)}">`)
        .join("");
    },
    renderHydrationData(
      scriptId = LITSX_HYDRATION_DATA_SCRIPT_ID,
    ) {
      if (hydrationData == null) {
        return "";
      }

      return `<script type="application/json" id="${escapeHtmlAttribute(scriptId)}">${escapeJsonScript(hydrationData)}</script>`;
    },
  };
}

function createDocumentResult(result, document, bootstrapHtml) {
  return {
    ...result,
    document,
    bootstrap: bootstrapHtml,
  };
}

function createDocumentTemplateContext(result, options = {}) {
  const lang = options.lang ?? "en";
  const htmlAttributes = {
    lang,
    ...(options.htmlAttributes || {}),
  };
  const bodyAttributes = options.bodyAttributes || {};
  const title = options.title == null ? "" : String(options.title);
  const head = normalizeTagContents(options.head);
  const bootstrap = renderResolvedBootstrap(options);
  const modulePreloads = result.renderModulePreloads();
  const hydrationScript = result.renderHydrationData(options.hydrationScriptId);
  const defaultDocument = createDefaultDocument({
    htmlAttributes,
    bodyAttributes,
    title,
    head,
    modulePreloads,
    hydrationScript,
    html: result.html,
    bootstrap,
  });

  return {
    ...result,
    title,
    lang,
    head,
    htmlAttributes: { ...htmlAttributes },
    bodyAttributes: { ...bodyAttributes },
    bootstrap,
    modulePreloads,
    hydrationScript,
    htmlAttributesString: renderHtmlAttributes(htmlAttributes),
    bodyAttributesString: renderHtmlAttributes(bodyAttributes),
    defaultDocument,
  };
}

function createDefaultDocument({
  htmlAttributes,
  bodyAttributes,
  title,
  head,
  modulePreloads,
  hydrationScript,
  html,
  bootstrap,
}) {
  return `<!doctype html>
<html${renderHtmlAttributes(htmlAttributes)}>
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtmlText(title)}</title>
    ${head}
    ${modulePreloads}
    ${hydrationScript}
  </head>
  <body${renderHtmlAttributes(bodyAttributes)}>
    ${html}
    ${bootstrap}
  </body>
</html>`;
}

function injectMarkupBeforeCloseTag(document, closeTag, markup) {
  if (!markup) {
    return document;
  }

  const closeTagIndex = document.lastIndexOf(closeTag);
  if (closeTagIndex === -1) {
    return document;
  }

  return `${document.slice(0, closeTagIndex)}${markup}\n${document.slice(closeTagIndex)}`;
}

function renderDevTemplateDocument(templateSource, context) {
  if (!templateSource.includes(DEV_TEMPLATE_HTML_MARKER)) {
    throw new TypeError(
      `createSsrDevServer(...) HTML templates must contain ${DEV_TEMPLATE_HTML_MARKER}.`,
    );
  }

  const titleMarkup = context.title ? escapeHtmlText(context.title) : "";
  const headMarkup = [
    context.head,
    context.modulePreloads,
    context.hydrationScript,
  ].filter((chunk) => chunk && chunk.length > 0).join("\n");
  let document = templateSource.replaceAll(DEV_TEMPLATE_HTML_MARKER, context.html);

  if (document.includes(DEV_TEMPLATE_TITLE_MARKER)) {
    document = document.replaceAll(DEV_TEMPLATE_TITLE_MARKER, titleMarkup);
  }

  if (document.includes(DEV_TEMPLATE_HEAD_MARKER)) {
    document = document.replaceAll(DEV_TEMPLATE_HEAD_MARKER, headMarkup);
  } else {
    document = injectMarkupBeforeCloseTag(document, "</head>", headMarkup);
  }

  if (document.includes(DEV_TEMPLATE_BOOTSTRAP_MARKER)) {
    document = document.replaceAll(DEV_TEMPLATE_BOOTSTRAP_MARKER, context.bootstrap);
  } else {
    document = injectMarkupBeforeCloseTag(document, "</body>", context.bootstrap);
  }

  return document;
}

function resolveFsPath(root, value) {
  if (!value) {
    return root;
  }

  return path.isAbsolute(value) ? value : path.join(root, value);
}

function toPublicPath(root, filePath) {
  const relativePath = path.relative(root, filePath).split(path.sep).join("/");
  return relativePath.startsWith("../") ? null : `/${relativePath}`;
}

function createServerOutputPath(root, entryPath) {
  const relativePath = path.relative(root, entryPath).split(path.sep).join("/");
  const basename = path.basename(entryPath).replace(/\.[^.]+$/, "");
  const digest = crypto.createHash("sha1").update(relativePath).digest("hex").slice(0, 10);
  return path.join(root, ".ssr", `${basename}.${digest}.server.mjs`);
}

async function compileServerEntry(entryPath, outputPath) {
  const [{ createLitsxCompilationSession }, source] = await Promise.all([
    import("@litsx/compiler"),
    fs.readFile(entryPath, "utf8"),
  ]);
  const session = createLitsxCompilationSession({
    transformOptions: {
      ssr: true,
      filename: entryPath,
    },
  });
  const result = session.transformSync(source, {
    filename: entryPath,
    sourceMaps: false,
  });

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, result.code);
  return outputPath;
}

async function loadCompiledServerModule(compiledPath) {
  return import(`${pathToFileURL(compiledPath).href}?t=${Date.now()}`);
}

async function loadServerModuleFromVite(viteServer, root, entryPath) {
  const moduleId = toPublicPath(root, entryPath) ?? entryPath;
  return viteServer.ssrLoadModule(moduleId);
}

function createDefaultAssetResolver(root, customResolver = null) {
  if (typeof customResolver === "function") {
    return customResolver;
  }

  return (moduleId) => {
    if (!moduleId) {
      return null;
    }

     if (typeof moduleId === "string" && moduleId.startsWith("/") && !path.isAbsolute(moduleId.slice(1))) {
      return moduleId;
    }

    return toPublicPath(root, moduleId);
  };
}

function resolveClientEntrySpecifier(clientEntry, assetResolver) {
  if (!clientEntry) {
    return null;
  }

  if (typeof assetResolver === "function") {
    return assetResolver(clientEntry) ?? clientEntry;
  }

  return clientEntry;
}

function renderResolvedBootstrap(options = {}) {
  return options.bootstrap === undefined
    ? renderClientEntryBootstrapScript(
      resolveClientEntrySpecifier(options.clientEntry, options.assetResolver),
    )
    : renderBootstrapScript(options.bootstrap);
}

function isAuthoredSsrEntry(value) {
  return Boolean(value && typeof value === "object" && value[LITSX_AUTHORED_SSR_ENTRY] === true);
}

function isLegacyAuthoredSsrEntry(value) {
  return Boolean(
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    typeof value.render === "function",
  );
}

function assertExplicitAuthoredSsrEntry(value, methodName) {
  if (!isLegacyAuthoredSsrEntry(value) || isAuthoredSsrEntry(value)) {
    return;
  }

  throw new TypeError(
    `${methodName}(...) authored entry objects must be wrapped in createEntry(...).`,
  );
}

export function createEntry(options = {}) {
  return {
    ...options,
    [LITSX_AUTHORED_SSR_ENTRY]: true,
  };
}

export class LitsxSsrMaxSuspensePassesError extends Error {
  constructor(maxPasses) {
    super(
      `LitSX SSR exceeded ${maxPasses} suspense render passes. ` +
        "A rootless async hook is still suspending after every retry.",
    );
    this.name = "LitsxSsrMaxSuspensePassesError";
    this.code = LITSX_SSR_MAX_SUSPENSE_PASSES_ERROR;
    this.maxPasses = maxPasses;
  }
}

function normalizeSsrRenderable(value, elements) {
  if (!elements || typeof elements !== "object") {
    return value;
  }

  const entries = Object.entries(elements).filter(([, entry]) => entry != null);
  if (entries.length === 0) {
    return value;
  }

  return __litsxScopedTemplate(value, Object.fromEntries(entries));
}

function isClassLikeValue(value) {
  return typeof value === "function" && /^class\s/.test(Function.prototype.toString.call(value));
}

async function renderAuthoredDocument(options = {}) {
  const root = resolveFsPath(process.cwd(), options.root ?? process.cwd());
  const templateSource = typeof options.template === "string"
    ? await fs.readFile(resolveFsPath(root, options.template), "utf8")
    : null;
  const assetResolver = createDefaultAssetResolver(root, options.assetResolver);
  const clientEntry = options.clientEntry
    ? resolveClientEntrySpecifier(
      resolveFsPath(root, options.clientEntry),
      assetResolver,
    ) ?? toPublicPath(root, resolveFsPath(root, options.clientEntry)) ?? options.clientEntry
    : null;

  if (typeof options.render !== "function") {
    throw new TypeError("LitSX authored document rendering requires a render(...) callback.");
  }

  await import("@lit-labs/ssr/lib/install-global-dom-shim.js");
  async function importModule(specifier) {
    const resolvedEntryPath = resolveFsPath(root, specifier);
    if (options.viteServer) {
      return loadServerModuleFromVite(options.viteServer, root, resolvedEntryPath);
    }

    const compiledServerPath = resolveFsPath(
      root,
      createServerOutputPath(root, resolvedEntryPath),
    );
    await compileServerEntry(resolvedEntryPath, compiledServerPath);
    return loadCompiledServerModule(compiledServerPath);
  }

  const [{ html }, resolvedElementRegistry] = await Promise.all([
    import("lit"),
    (async () => {
      if (!options.elements) {
        return null;
      }

      const elementResolvers = typeof options.elements === "function"
        ? options.elements(importModule)
        : options.elements;

      const pairs = await Promise.all(
        Object.entries(elementResolvers).map(async ([tagName, resolveElement]) => {
          const resolvedValue = typeof resolveElement === "function" && !isClassLikeValue(resolveElement)
            ? await resolveElement()
            : await resolveElement;

          return [tagName, resolvedValue];
        }),
      );

      return Object.fromEntries(pairs);
    })(),
  ]);

  const renderValue = await options.render({
    html,
    clientEntry,
    root,
  });
  const resolvedElements = resolvedElementRegistry && typeof resolvedElementRegistry === "object"
    ? resolvedElementRegistry
    : undefined;
  const elements = {
    ...(resolvedElements || {}),
  };

  return renderDocument(renderValue, {
    elements: Object.keys(elements).length > 0 ? elements : undefined,
    assetResolver,
    lang: options.lang,
    title: options.title,
    head: options.head,
    bodyAttributes: options.bodyAttributes,
    htmlAttributes: options.htmlAttributes,
    clientEntry:
      options.bootstrap === undefined
        ? clientEntry
        : undefined,
    bootstrap: options.bootstrap,
    hydrationScriptId: options.hydrationScriptId,
    template: templateSource
      ? (context) => renderDevTemplateDocument(templateSource, context)
      : typeof options.template === "function"
        ? options.template
        : undefined,
  });
}

async function resolveAuthoredRenderInput(options = {}) {
  const root = resolveFsPath(process.cwd(), options.root ?? process.cwd());

  if (typeof options.render !== "function") {
    throw new TypeError("LitSX authored SSR rendering requires a render(...) callback.");
  }

  await import("@lit-labs/ssr/lib/install-global-dom-shim.js");
  async function importModule(specifier) {
    const resolvedEntryPath = resolveFsPath(root, specifier);
    if (options.viteServer) {
      return loadServerModuleFromVite(options.viteServer, root, resolvedEntryPath);
    }

    const compiledServerPath = resolveFsPath(
      root,
      createServerOutputPath(root, resolvedEntryPath),
    );
    await compileServerEntry(resolvedEntryPath, compiledServerPath);
    return loadCompiledServerModule(compiledServerPath);
  }

  const [{ html }, resolvedElementRegistry] = await Promise.all([
    import("lit"),
    (async () => {
      if (!options.elements) {
        return null;
      }

      const elementResolvers = typeof options.elements === "function"
        ? options.elements(importModule)
        : options.elements;

      const pairs = await Promise.all(
        Object.entries(elementResolvers).map(async ([tagName, resolveElement]) => {
          const resolvedValue = typeof resolveElement === "function" && !isClassLikeValue(resolveElement)
            ? await resolveElement()
            : await resolveElement;

          return [tagName, resolvedValue];
        }),
      );

      return Object.fromEntries(pairs);
    })(),
  ]);

  const assetResolver = createDefaultAssetResolver(root, options.assetResolver);
  const clientEntry = options.clientEntry
    ? resolveClientEntrySpecifier(
      resolveFsPath(root, options.clientEntry),
      assetResolver,
    ) ?? toPublicPath(root, resolveFsPath(root, options.clientEntry)) ?? options.clientEntry
    : null;
  const renderValue = await options.render({
    html,
    clientEntry,
    root,
  });
  const resolvedElements = resolvedElementRegistry && typeof resolvedElementRegistry === "object"
    ? resolvedElementRegistry
    : undefined;
  const elements = Object.keys(resolvedElements || {}).length > 0
    ? resolvedElements
    : undefined;

  return {
    value: renderValue,
    options: {
      ...options,
      root,
      clientEntry,
      assetResolver,
      elements,
    },
  };
}

async function createSsrContext(options, executionContext) {
  const { createScopedSsrContext } = await loadSsrRuntime();
  return createScopedSsrContext({
    idPrefix: options.context?.idPrefix,
    assetResolver: options.assetResolver,
    executionContext,
  });
}

function createExecutionContext() {
  const store = new Map();

  return {
    get(key) {
      return store.get(key);
    },
    set(key, value) {
      store.set(key, value);
    },
    has(key) {
      return store.has(key);
    },
  };
}

async function renderResolvedValue(value, context) {
  const {
    resolveTopLevelSsrValue,
    renderScopedTemplateWithLitSsr,
  } = await loadSsrRuntime();
  const resolvedValue = await resolveTopLevelSsrValue(value, context);
  return renderScopedTemplateWithLitSsr(resolvedValue, {
    litsxSsrContext: context,
  });
}

async function renderResolvedValueToChunks(value, context) {
  const {
    resolveTopLevelSsrValue,
    renderScopedTemplateToChunks,
  } = await loadSsrRuntime();
  const resolvedValue = await resolveTopLevelSsrValue(value, context);
  return renderScopedTemplateToChunks(resolvedValue, {
    litsxSsrContext: context,
  });
}

function normalizeMaxSuspensePasses(value) {
  if (value == null) {
    return DEFAULT_MAX_SUSPENSE_PASSES;
  }

  const normalized = Number(value);
  if (!Number.isFinite(normalized) || normalized < 1) {
    throw new TypeError("maxSuspensePasses must be a positive finite number.");
  }

  return Math.floor(normalized);
}

async function renderResolvedValueWithSoftSuspense(value, options) {
  const maxPasses = normalizeMaxSuspensePasses(options.maxSuspensePasses);
  const executionContext = createExecutionContext();

  return withCurrentSsrRuntimeState({ executionContext }, async () => {
    for (let pass = 0; pass < maxPasses; pass += 1) {
      const context = await createSsrContext(options, executionContext);
      const pendingThenables = new Set();
      const html = await collectSoftSuspenseThenables(pendingThenables, async () =>
        renderResolvedValue(
          normalizeSsrRenderable(await Promise.resolve(value), options.elements),
          context,
        )
      );

      if (pendingThenables.size === 0) {
        return { html, context };
      }

      await Promise.all([...pendingThenables]);
    }

    throw new LitsxSsrMaxSuspensePassesError(maxPasses);
  });
}

async function stabilizeSsrRenderPasses(value, options) {
  const maxPasses = normalizeMaxSuspensePasses(options.maxSuspensePasses);
  const executionContext = createExecutionContext();

  await withCurrentSsrRuntimeState({ executionContext }, async () => {
    for (let pass = 0; pass < maxPasses; pass += 1) {
      const context = await createSsrContext(options, executionContext);
      const pendingThenables = new Set();

      await collectSoftSuspenseThenables(pendingThenables, async () =>
        renderResolvedValue(
          normalizeSsrRenderable(await Promise.resolve(value), options.elements),
          context,
        )
      );

      if (pendingThenables.size === 0) {
        return;
      }

      await Promise.all([...pendingThenables]);
    }

    throw new LitsxSsrMaxSuspensePassesError(maxPasses);
  });

  return executionContext;
}

/**
 * Render a Lit or LitSX template to HTML using the scoped SSR runtime.
 *
 * LitSX roots can arrive either as already-lowered scoped templates or as a
 * plain Lit value plus `options.elements`, which is wrapped into a scoped SSR
 * template internally.
 */
export async function renderToString(value, options = {}) {
  assertExplicitAuthoredSsrEntry(value, "renderToString");

  if (arguments.length === 1 && isAuthoredSsrEntry(value)) {
    const authored = await resolveAuthoredRenderInput(value);
    return renderToString(authored.value, authored.options);
  }

  const { html, context } = await renderResolvedValueWithSoftSuspense(value, options);
  return createSsrResult(html, context);
}

/**
 * Render a Lit or LitSX value to a complete HTML document.
 *
 * This helper builds on `renderToString(...)` and adds:
 * - a standard `<!doctype html>` shell
 * - optional `lang`, `title`, and arbitrary `<head>` content
 * - emitted modulepreload links for discovered client imports
 * - the LitSX hydration payload script tag
 * - an optional client bootstrap script
 *
 * Use this as the recommended document-oriented entrypoint for full-page SSR.
 */
export async function renderDocument(value, options = {}) {
  assertExplicitAuthoredSsrEntry(value, "renderDocument");

  if (arguments.length === 1 && isAuthoredSsrEntry(value)) {
    return renderAuthoredDocument(value);
  }

  const result = await renderToString(value, options);
  const documentContext = createDocumentTemplateContext(result, options);
  const document = typeof options.template === "function"
    ? String(options.template(documentContext))
    : documentContext.defaultDocument;

  return {
    ...createDocumentResult(result, document, documentContext.bootstrap),
    ...documentContext,
  };
}

/**
 * Render the standard LitSX SSR bootstrap markup without building a document.
 */
export function renderBootstrap(options = {}) {
  return renderResolvedBootstrap(options);
}

/**
 * Materialize the document-shell context that `renderDocument(...)` uses.
 */
export function createDocumentContext(result, options = {}) {
  return createDocumentTemplateContext(result, options);
}

/**
 * Render a Lit or LitSX value to a Web Stream using the scoped LitSX SSR runtime.
 */
export async function renderToStream(value, options = {}) {
  assertExplicitAuthoredSsrEntry(value, "renderToStream");

  if (arguments.length === 1 && isAuthoredSsrEntry(value)) {
    const authored = await resolveAuthoredRenderInput(value);
    return renderToStream(authored.value, authored.options);
  }

  let resolveAllReady;
  let rejectAllReady;
  const allReady = new Promise((resolve, reject) => {
    resolveAllReady = resolve;
    rejectAllReady = reject;
  });

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const executionContext = await stabilizeSsrRenderPasses(value, options);
        const context = await createSsrContext(options, executionContext);
        const chunks = await renderResolvedValueToChunks(
          normalizeSsrRenderable(await Promise.resolve(value), options.elements),
          context,
        );

        let html = "";
        for await (const chunk of chunks) {
          const stringChunk = typeof chunk === "string" ? chunk : String(chunk);
          html += stringChunk;
          controller.enqueue(stringChunk);
        }
        controller.close();
        const result = createSsrResult(html, context);
        resolveAllReady({
          clientImports: result.clientImports,
          hydrationData: result.hydrationData,
          renderClientImports: result.renderClientImports,
          renderClientImportsData: result.renderClientImportsData,
          renderModulePreloads: result.renderModulePreloads,
          renderHydrationData: result.renderHydrationData,
        });
      } catch (error) {
        controller.error(error);
        rejectAllReady(error);
      }
    },
  });

  return {
    stream,
    allReady,
  };
}

/**
 * Create a Vite-backed local development server for authored LitSX SSR.
 *
 * The server:
 * - compiles the authored server entry for SSR
 * - evaluates it through the scoped LitSX SSR runtime
 * - renders a full HTML document through `renderDocument(...)`
 * - serves the result through Vite with LitSX client sourcemaps enabled
 *
 * This is intended for local development and examples, not production builds.
 * Callers provide a `render(...)` callback that returns the SSR root template,
 * and can optionally use `elements(loader)` to resolve authored LitSX elements
 * through the same SSR-aware pipeline as the main server entry.
 */
export async function createSsrDevServer(options = {}) {
  const { createServer } = await import("vite");
  const { litsx } = await import("@litsx/vite-plugin");
  const root = resolveFsPath(process.cwd(), options.root ?? process.cwd());
  const viteServer = await createServer({
    root,
    appType: "custom",
    logLevel: options.logLevel ?? "info",
    server: {
      host: options.host ?? "127.0.0.1",
      port: options.port ?? 5177,
      strictPort: options.strictPort ?? false,
      ...(options.server || {}),
    },
    plugins: [
      litsx({
        ssr: true,
        sourceMaps: true,
        ...(options.litsx || {}),
      }),
      ...((options.plugins || [])),
    ],
    ...(options.vite || {}),
  });

  viteServer.middlewares.use(async (req, res, next) => {
    const requestUrl = new URL(req.url ?? "/", "http://127.0.0.1");
    if (
      (req.method !== "GET" && req.method !== "HEAD") ||
      (requestUrl.pathname !== "/" && requestUrl.pathname !== "/index.html")
    ) {
      next();
      return;
    }

    try {
      const result = await renderAuthoredDocument({
        ...options,
        root,
        viteServer,
      });
      res.statusCode = 200;
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.end(result.document);
    } catch (error) {
      viteServer.ssrFixStacktrace(error);
      next(error);
    }
  });

  return viteServer;
}
