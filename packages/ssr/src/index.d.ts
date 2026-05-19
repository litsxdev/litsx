export interface LitsxSsrContext {
  /**
   * Prefix used when generating SSR root ids and hook instance ids.
   */
  idPrefix?: string;
}

/**
 * Rewrite a discovered LitSX module id to a public client import URL.
 */
export interface LitsxSsrAssetResolver {
  (moduleId: string): string | null | undefined;
}

/**
 * Configure the client bootstrap script emitted by `renderDocument(...)`.
 */
export interface LitsxSsrBootstrapScript {
  /**
   * Module or script URL to emit in the final document.
   */
  src?: string;

  /**
   * Inline script contents to emit when no `src` is provided.
   */
  content?: string;

  /**
   * Script `type` attribute. Defaults to `"module"`.
   */
  type?: string;

  /**
   * Additional attributes to emit on the bootstrap `<script>` tag.
   */
  attributes?: Record<string, string | number | boolean | null | undefined>;
}

/**
 * Low-level scoped SSR render options shared by string and document rendering.
 *
 * The scoped SSR lifecycle described by this package is defined around
 * LitSX-authored component trees. Plain Lit templates are accepted as input,
 * but arbitrary third-party Lit components are not yet promoted into the full
 * LitSX SSR component model by default.
 */
export interface LitsxSsrRenderOptions {
  context?: LitsxSsrContext;
  assetResolver?: LitsxSsrAssetResolver;
}

export interface LitsxHydrationRoot {
  /**
   * Stable SSR root id used to match server markup with hydration metadata.
   */
  id: string;

  /**
   * Lowercase custom element tag rendered as the hydration root host.
   */
  tagName: string;

  /**
   * Original authored module id for the LitSX root when available.
   */
  moduleId?: string;
}

export interface LitsxHydrationPayload {
  /**
   * Serializable root-scoped payload keyed by hydration root id.
   */
  roots: Record<string, unknown>;

  /**
   * Serializable hook state payload keyed by `${rootId}:${instanceId}`.
   */
  instances: Record<string, {
    rootId: string;
    instanceId: string;
    state: unknown[];
  }>;
}

export interface LitsxHydrationData {
  /**
   * Payload format version.
   */
  version: 1;

  /**
   * Declared LitSX hydration roots in render order.
   */
  roots: LitsxHydrationRoot[];

  /**
   * Serializable root payload and hook state captured during SSR.
   */
  payload: LitsxHydrationPayload;

  /**
   * Deduplicated client module imports needed to hydrate the rendered roots.
   */
  clientImports?: string[];
}

export interface LitsxSsrMetadata {
  /**
   * Deduplicated client module imports discovered while rendering LitSX roots.
   */
  clientImports: string[];

  /**
   * Structured hydration metadata emitted for LitSX roots, or `null` when the
   * rendered value does not contain scoped LitSX roots.
   */
  hydrationData: LitsxHydrationData | null;

  /**
   * Render discovered client imports as `<script type="module">` tags.
   */
  renderClientImports(): string;

  /**
   * Render discovered client imports as a JSON script tag that
   * `@litsx/ssr-client` can consume.
   */
  renderClientImportsData(scriptId?: string): string;

  /**
   * Render discovered client imports as `<link rel="modulepreload">` tags.
   */
  renderModulePreloads(): string;

  /**
   * Render LitSX hydration metadata as a JSON script tag.
   */
  renderHydrationData(scriptId?: string): string;
}

export interface LitsxSsrResult extends LitsxSsrMetadata {
  /**
   * Prerendered HTML fragment for the provided SSR root value.
   */
  html: string;
}

/**
 * Options for `renderDocument(...)`.
 */
export interface LitsxSsrDocumentOptions extends LitsxSsrRenderOptions {
  /**
   * `lang` attribute emitted on the root `<html>` element. Defaults to `"en"`.
   */
  lang?: string;

  /**
   * `<title>` text emitted in the generated document head.
   */
  title?: string;

  /**
   * Additional HTML inserted into the generated `<head>`.
   */
  head?: string | string[];

  /**
   * Attributes emitted on the generated `<body>` element.
   */
  bodyAttributes?: Record<string, string | number | boolean | null | undefined>;

  /**
   * Attributes emitted on the generated `<html>` element.
   */
  htmlAttributes?: Record<string, string | number | boolean | null | undefined>;

  /**
   * Client bootstrap script emitted at the end of the generated `<body>`.
   *
   * Pass a string for a simple module `src`, or a structured object to emit an
   * inline script or add custom attributes.
   */
  bootstrap?: string | LitsxSsrBootstrapScript | null | false | undefined;

  /**
   * Override the JSON script id used by `renderHydrationData(...)` inside the
   * generated document.
   */
  hydrationScriptId?: string | undefined;
}

export interface LitsxSsrDocumentResult extends LitsxSsrResult {
  /**
   * Complete HTML document generated around the rendered SSR fragment.
   */
  document: string;

  /**
   * Final bootstrap `<script>` markup emitted into the generated document.
   */
  bootstrap: string;
}

/**
 * Values passed to `createSsrDevServer(...).render(...)`.
 */
export interface LitsxSsrDevRenderContext {
  module: Record<string, unknown>;
  html: typeof import("lit").html;
  scopedTemplate: typeof import("@litsx/core/elements").__litsxScopedTemplate;
  serverEntry: string;
  clientEntry: string | null;
  root: string;
}

export interface LitsxSsrDevServerOptions extends LitsxSsrDocumentOptions {
  /**
   * Filesystem root passed to Vite and used to resolve authored entries.
   */
  root?: string;

  /**
   * Authored LitSX module compiled for SSR on each request.
   */
  serverEntry: string;

  /**
   * Optional client bootstrap module resolved relative to `root`.
   */
  clientEntry?: string;

  /**
   * Optional location for the compiled temporary SSR module.
   */
  compiledServerPath?: string;

  /**
   * Host used by the Vite dev server.
   */
  host?: string;

  /**
   * Preferred port used by the Vite dev server.
   */
  port?: number;

  /**
   * Forwarded to Vite `server.strictPort`.
   */
  strictPort?: boolean;

  /**
   * Forwarded to the underlying Vite `logLevel`.
   */
  logLevel?: string;

  /**
   * Extra Vite `server` options merged into the created dev server.
   */
  server?: Record<string, unknown>;

  /**
   * Extra top-level Vite options merged into the created dev server config.
   */
  vite?: Record<string, unknown>;

  /**
   * Extra `@litsx/vite-plugin` options merged into the LitSX plugin instance.
   */
  litsx?: Record<string, unknown>;

  /**
   * Extra Vite plugins appended after the LitSX plugin.
   */
  plugins?: unknown[];

  /**
   * Produce the SSR root value for each request using the compiled server
   * module plus Lit / LitSX helpers.
   */
  render(context: LitsxSsrDevRenderContext): unknown | Promise<unknown>;
}

export interface LitsxSsrStreamResult {
  /**
   * Web stream that yields serialized HTML chunks.
   */
  stream: ReadableStream<string>;

  /**
   * Resolves once the full stream metadata is available.
   */
  allReady: Promise<LitsxSsrMetadata>;
}

export declare const LITSX_CLIENT_IMPORTS_SCRIPT_ID: "__LITSX_CLIENT_IMPORTS__";
export declare const LITSX_HYDRATION_DATA_SCRIPT_ID: "__LITSX_HYDRATION__";

/**
 * Render a Lit or LitSX value to HTML using the scoped LitSX SSR runtime.
 *
 * @usage Use this when you want the rendered HTML fragment and SSR metadata, but
 * you are assembling the surrounding document shell yourself.
 * @param value Lit or LitSX value to render through the scoped SSR runtime.
 * @param options Optional scoped SSR context and client asset resolution.
 * @returns A prerendered HTML fragment plus client import and hydration helpers.
 * @example
 * const result = await renderToString(<ProductCard .product={product} />);
 * result.html;
 * result.renderHydrationData();
 */
export declare function renderToString(
  value: unknown,
  options?: LitsxSsrRenderOptions,
): Promise<LitsxSsrResult>;

/**
 * Render a Lit or LitSX value to a complete HTML document.
 *
 * This helper wraps `renderToString(...)` with a standard document shell,
 * emitted hydration metadata, module preloads, and an optional bootstrap
 * script suitable for whole-page SSR responses.
 *
 * @usage Use this as the main whole-page SSR entrypoint when the server should
 * return a complete HTML document instead of a fragment.
 * @param value Lit or LitSX value to render through the scoped SSR runtime.
 * @param options Document shell, bootstrap, and hydration-script options.
 * @returns A complete HTML document plus the same fragment metadata helpers as
 * `renderToString(...)`.
 * @example
 * const result = await renderDocument(<AppRoot .data={data} />, {
 *   title: "Dashboard",
 *   bootstrap: "/src/main.js",
 * });
 *
 * return new Response(result.document, {
 *   headers: { "content-type": "text/html; charset=utf-8" },
 * });
 */
export declare function renderDocument(
  value: unknown,
  options?: LitsxSsrDocumentOptions,
): Promise<LitsxSsrDocumentResult>;

/**
 * Create a Vite-backed development server for authored LitSX SSR entrypoints.
 *
 * @usage Use this for local SSR development when your server entry is still an
 * authored `.litsx` module and you want Vite to serve the hydrated page.
 * @param options Dev-server, authored entry, and render callback configuration.
 * @returns A configured Vite dev server instance that still needs `listen()`.
 * @example
 * const server = await createSsrDevServer({
 *   root: process.cwd(),
 *   serverEntry: "./src/App.litsx",
 *   clientEntry: "./src/main.js",
 *   render({ module, html, scopedTemplate }) {
 *     return scopedTemplate(html`<app-root></app-root>`, {
 *       "app-root": module.AppRoot,
 *     });
 *   },
 * });
 *
 * await server.listen();
 */
export declare function createSsrDevServer(
  options: LitsxSsrDevServerOptions,
): Promise<unknown>;

/**
 * Render a Lit or LitSX value to a Web Stream using the scoped LitSX SSR runtime.
 *
 * @usage Use this when you want to stream HTML to the client while still
 * collecting the same SSR metadata available from `renderToString(...)`.
 * @param value Lit or LitSX value to render through the scoped SSR runtime.
 * @param options Optional scoped SSR context and client asset resolution.
 * @returns A Web stream plus an `allReady` promise for the final SSR metadata.
 */
export declare function renderToStream(
  value: unknown,
  options?: LitsxSsrRenderOptions,
): Promise<LitsxSsrStreamResult>;
