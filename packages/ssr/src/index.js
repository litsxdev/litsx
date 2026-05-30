import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { __litsxScopedTemplate } from "@litsx/core/elements";

/**
 * Default JSON script id used by `renderClientImportsData()`.
 */
export const LITSX_CLIENT_IMPORTS_SCRIPT_ID = "__LITSX_CLIENT_IMPORTS__";

/**
 * Default JSON script id used by `renderHydrationData()`.
 */
export const LITSX_HYDRATION_DATA_SCRIPT_ID = "__LITSX_HYDRATION__";

const DEV_TEMPLATE_TITLE_MARKER = "<!--app-title-->";
const DEV_TEMPLATE_HEAD_MARKER = "<!--app-head-->";
const DEV_TEMPLATE_HTML_MARKER = "<!--app-html-->";
const DEV_TEMPLATE_BOOTSTRAP_MARKER = "<!--app-bootstrap-->";

let ssrRuntimePromise;

async function loadSsrRuntime() {
  ssrRuntimePromise ??= Promise.all([
    import("./scoped-rendering.js"),
    import("./values.js"),
  ]).then(([scopedRendering, values]) => ({
    createScopedSsrContext: scopedRendering.createScopedSsrContext,
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
import { hydratePage } from "@litsx/ssr-client";

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
  const basename = path.basename(entryPath).replace(/\.[^.]+$/, "");
  return path.join(root, ".ssr", `${basename}.server.mjs`);
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

    return toPublicPath(root, moduleId);
  };
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
  const clientEntry = options.clientEntry
    ? toPublicPath(root, resolveFsPath(root, options.clientEntry)) ?? options.clientEntry
    : null;

  if (typeof options.render !== "function") {
    throw new TypeError("createSsrDevServer(...) requires a render(...) callback.");
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
  const assetResolver = createDefaultAssetResolver(root, options.assetResolver);

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

  const clientEntry = options.clientEntry
    ? toPublicPath(root, resolveFsPath(root, options.clientEntry)) ?? options.clientEntry
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
      elements,
    },
  };
}

async function createSsrContext(options) {
  const { createScopedSsrContext } = await loadSsrRuntime();
  return createScopedSsrContext({
    idPrefix: options.context?.idPrefix,
    assetResolver: options.assetResolver,
  });
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

/**
 * Render a Lit or LitSX template to HTML using the scoped SSR runtime.
 *
 * LitSX roots can arrive either as already-lowered scoped templates or as a
 * plain Lit value plus `options.elements`, which is wrapped into a scoped SSR
 * template internally.
 */
export async function renderToString(value, options = {}) {
  if (
    arguments.length === 1 &&
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    typeof value.render === "function"
  ) {
    const authored = await resolveAuthoredRenderInput(value);
    return renderToString(authored.value, authored.options);
  }

  const context = await createSsrContext(options);
  const html = await renderResolvedValue(
    normalizeSsrRenderable(await Promise.resolve(value), options.elements),
    context,
  );
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
  if (
    arguments.length === 1 &&
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    typeof value.render === "function"
  ) {
    return renderAuthoredDocument(value);
  }

  const result = await renderToString(value, options);
  const lang = options.lang ?? "en";
  const htmlAttributes = {
    lang,
    ...(options.htmlAttributes || {}),
  };
  const bodyAttributes = options.bodyAttributes || {};
  const title = options.title == null ? "" : String(options.title);
  const head = normalizeTagContents(options.head);
  const bootstrapHtml = options.bootstrap === undefined
    ? renderClientEntryBootstrapScript(options.clientEntry)
    : renderBootstrapScript(options.bootstrap);
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
    bootstrap: bootstrapHtml,
  });
  const document = typeof options.template === "function"
    ? String(options.template({
      ...result,
      title,
      lang,
      head,
      htmlAttributes: { ...htmlAttributes },
      bodyAttributes: { ...bodyAttributes },
      bootstrap: bootstrapHtml,
      modulePreloads,
      hydrationScript,
      htmlAttributesString: renderHtmlAttributes(htmlAttributes),
      bodyAttributesString: renderHtmlAttributes(bodyAttributes),
      defaultDocument,
    }))
    : defaultDocument;

  return createDocumentResult(result, document, bootstrapHtml);
}

/**
 * Render a Lit or LitSX value to a Web Stream using the scoped LitSX SSR runtime.
 */
export async function renderToStream(value, options = {}) {
  if (
    arguments.length === 1 &&
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    typeof value.render === "function"
  ) {
    const authored = await resolveAuthoredRenderInput(value);
    return renderToStream(authored.value, authored.options);
  }

  const context = await createSsrContext(options);
  let resolveAllReady;
  let rejectAllReady;
  const allReady = new Promise((resolve, reject) => {
    resolveAllReady = resolve;
    rejectAllReady = reject;
  });

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const html = await renderResolvedValue(
          normalizeSsrRenderable(await Promise.resolve(value), options.elements),
          context,
        );
        controller.enqueue(html);
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
