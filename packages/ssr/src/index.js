import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

/**
 * Default JSON script id used by `renderClientImportsData()`.
 */
export const LITSX_CLIENT_IMPORTS_SCRIPT_ID = "__LITSX_CLIENT_IMPORTS__";

/**
 * Default JSON script id used by `renderHydrationData()`.
 */
export const LITSX_HYDRATION_DATA_SCRIPT_ID = "__LITSX_HYDRATION__";

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

function createServerOutputPath(root, serverEntry) {
  const basename = path.basename(serverEntry).replace(/\.[^.]+$/, "");
  return path.join(root, ".ssr", `${basename}.server.mjs`);
}

async function compileServerEntry(serverEntry, outputPath) {
  const [{ createLitsxCompilationSession }, source] = await Promise.all([
    import("@litsx/compiler"),
    fs.readFile(serverEntry, "utf8"),
  ]);
  const session = createLitsxCompilationSession({
    transformOptions: {
      ssr: true,
      filename: serverEntry,
    },
  });
  const result = session.transformSync(source, {
    filename: serverEntry,
    sourceMaps: false,
  });

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, result.code);
  return outputPath;
}

async function loadCompiledServerModule(compiledPath) {
  return import(`${pathToFileURL(compiledPath).href}?t=${Date.now()}`);
}

async function loadServerModuleFromVite(viteServer, root, serverEntry) {
  const moduleId = toPublicPath(root, serverEntry) ?? serverEntry;
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

async function renderDevDocumentFromEntry(options = {}) {
  const root = resolveFsPath(process.cwd(), options.root ?? process.cwd());
  const serverEntry = resolveFsPath(root, options.serverEntry);
  const clientEntry = options.clientEntry
    ? toPublicPath(root, resolveFsPath(root, options.clientEntry)) ?? options.clientEntry
    : null;

  if (typeof options.render !== "function") {
    throw new TypeError("createSsrDevServer(...) requires a render(...) callback.");
  }

  await import("@lit-labs/ssr/lib/install-global-dom-shim.js");
  const [moduleExports, { html }, { __litsxScopedTemplate }] = await Promise.all([
    options.viteServer
      ? loadServerModuleFromVite(options.viteServer, root, serverEntry)
      : (async () => {
          const compiledServerPath = resolveFsPath(
            root,
            options.compiledServerPath ?? createServerOutputPath(root, serverEntry),
          );
          await compileServerEntry(serverEntry, compiledServerPath);
          return loadCompiledServerModule(compiledServerPath);
        })(),
    import("lit"),
    import("@litsx/core/elements"),
  ]);

  const value = await options.render({
    module: moduleExports,
    html,
    scopedTemplate: __litsxScopedTemplate,
    serverEntry,
    clientEntry,
    root,
  });
  const assetResolver = createDefaultAssetResolver(root, options.assetResolver);

  return renderDocument(value, {
    assetResolver,
    lang: options.lang,
    title: options.title,
    head: options.head,
    bodyAttributes: options.bodyAttributes,
    htmlAttributes: options.htmlAttributes,
    bootstrap:
      options.bootstrap === undefined
        ? clientEntry
        : options.bootstrap,
    hydrationScriptId: options.hydrationScriptId,
  });
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
 * LitSX roots are expected to arrive as scoped templates produced by the
 * SSR root transform, for example from:
 *
 * `renderToString(<ProductCard .product={product} />)`
 *
 * The current MVP returns prerendered HTML plus the deduplicated list of
 * client module imports discovered while resolving scoped LitSX elements.
 */
export async function renderToString(value, options = {}) {
  const context = await createSsrContext(options);
  const html = await renderResolvedValue(value, context);
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
  const result = await renderToString(value, options);
  const lang = options.lang ?? "en";
  const htmlAttributes = {
    lang,
    ...(options.htmlAttributes || {}),
  };
  const bodyAttributes = options.bodyAttributes || {};
  const title = options.title == null ? "" : String(options.title);
  const head = normalizeTagContents(options.head);
  const bootstrapHtml = renderBootstrapScript(options.bootstrap);
  const document = `<!doctype html>
<html${renderHtmlAttributes(htmlAttributes)}>
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtmlText(title)}</title>
    ${head}
    ${result.renderModulePreloads()}
    ${result.renderHydrationData(options.hydrationScriptId)}
  </head>
  <body${renderHtmlAttributes(bodyAttributes)}>
    ${result.html}
    ${bootstrapHtml}
  </body>
</html>`;

  return createDocumentResult(result, document, bootstrapHtml);
}

/**
 * Render a Lit or LitSX value to a Web Stream using the scoped LitSX SSR runtime.
 */
export async function renderToStream(value, options = {}) {
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
        const html = await renderResolvedValue(value, context);
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
 * Callers provide a `render(...)` callback that receives the compiled server
 * module plus `html` / `scopedTemplate` helpers and returns the SSR root value.
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
      const result = await renderDevDocumentFromEntry({
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
