export interface LitsxSsrContext {
  /**
   * Prefix used when generating SSR root ids and hook instance ids.
   */
  idPrefix?: string;

  /**
   * Request-scoped SSR metadata only.
   *
   * This config does not expose or carry the LitSX execution context.
   * A fresh execution context is created internally for each public SSR call
   * and can be reached during that render through
   * `getCurrentExecutionContext()` from `@litsx/core`.
   */
}

export declare const LITSX_AUTHORED_SSR_ENTRY: unique symbol;
export declare const LITSX_SSR_MAX_SUSPENSE_PASSES_ERROR: "LITSX_SSR_MAX_SUSPENSE_PASSES_EXCEEDED";

/**
 * Rewrite a discovered LitSX module id to a public client import URL.
 */
export interface LitsxSsrAssetResolver {
  (moduleId: string): string | null | undefined;
}

/**
 * Local scoped custom element registry used to render LitSX-authored tags
 * without globally defining them.
 */
export interface LitsxSsrElements {
  [tagName: string]: unknown;
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
  /**
   * SSR metadata and id-generation configuration for this render.
   *
   * This is distinct from the request execution context exposed by
   * `@litsx/core`. Callers do not inject an execution context through
   * `@litsx/ssr`; LitSX creates one internally per SSR request/render.
   */
  context?: LitsxSsrContext;
  assetResolver?: LitsxSsrAssetResolver;
  /**
   * Maximum number of SSR render passes allowed while rootless async hooks
   * suspend and retry. Defaults to 25.
   */
  maxSuspensePasses?: number;
  /**
   * Local scoped custom element registry used to resolve LitSX-authored tags
   * inside the provided render value.
   */
  elements?: LitsxSsrElements;
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
   * `@litsx/ssr/client` can consume.
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

export interface LitsxSsrDocumentTemplateContext extends LitsxSsrResult {
  /**
   * Resolved `lang` value for the document shell.
   */
  lang: string;

  /**
   * Resolved document title text.
   */
  title: string;

  /**
   * Normalized extra `<head>` markup from `options.head`.
   */
  head: string;

  /**
   * Resolved attributes for the `<html>` element.
   */
  htmlAttributes: Record<string, string | number | boolean | null | undefined>;

  /**
   * Resolved attributes for the `<body>` element.
   */
  bodyAttributes: Record<string, string | number | boolean | null | undefined>;

  /**
   * Final bootstrap `<script>` markup.
   */
  bootstrap: string;

  /**
   * Final `<link rel="modulepreload">` markup for discovered client imports.
   */
  modulePreloads: string;

  /**
   * Final LitSX hydration payload script markup.
   */
  hydrationScript: string;

  /**
   * Serialized `<html>` attributes, ready to insert into a template.
   */
  htmlAttributesString: string;

  /**
   * Serialized `<body>` attributes, ready to insert into a template.
   */
  bodyAttributesString: string;

  /**
   * Standard document shell produced by the built-in opinionated template.
   */
  defaultDocument: string;
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
   * Client entry module for the standard LitSX SSR hydration flow.
   *
   * When provided, `renderDocument(...)` emits a small bootstrap wrapper that
   * imports `hydratePage(...)` from `@litsx/ssr/client`, then imports this
   * client entry through `register()`.
   */
  clientEntry?: string | null | undefined;

  /**
   * Raw client bootstrap script emitted at the end of the generated `<body>`.
   *
   * Pass a string for a simple module `src`, or a structured object to emit an
   * inline script or add custom attributes.
   *
   * This is the low-level escape hatch. When `bootstrap` is provided, it takes
   * precedence over `clientEntry`.
   */
  bootstrap?: string | LitsxSsrBootstrapScript | null | false | undefined;

  /**
   * Override the JSON script id used by `renderHydrationData(...)` inside the
   * generated document.
   */
  hydrationScriptId?: string | undefined;

  /**
   * Build the final HTML document shell yourself while reusing the rendered
   * fragment, preload tags, hydration payload, and bootstrap script generated
   * by `renderDocument(...)`.
   *
   * When omitted, `renderDocument(...)` uses its standard opinionated HTML
   * document template.
   */
  template?: ((context: LitsxSsrDocumentTemplateContext) => string) | null | undefined;
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

  /**
   * Resolved `lang` value for the document shell.
   */
  lang: string;

  /**
   * Resolved document title text.
   */
  title: string;

  /**
   * Normalized extra `<head>` markup from `options.head`.
   */
  head: string;

  /**
   * Resolved attributes for the `<html>` element.
   */
  htmlAttributes: Record<string, string | number | boolean | null | undefined>;

  /**
   * Resolved attributes for the `<body>` element.
   */
  bodyAttributes: Record<string, string | number | boolean | null | undefined>;

  /**
   * Final `<link rel="modulepreload">` markup for discovered client imports.
   */
  modulePreloads: string;

  /**
   * Final LitSX hydration payload script markup.
   */
  hydrationScript: string;

  /**
   * Serialized `<html>` attributes, ready to insert into a template.
   */
  htmlAttributesString: string;

  /**
   * Serialized `<body>` attributes, ready to insert into a template.
   */
  bodyAttributesString: string;

  /**
   * Standard document shell produced by the built-in opinionated template.
   */
  defaultDocument: string;
}

export interface LitsxSsrMaxSuspensePassesError extends Error {
  name: "LitsxSsrMaxSuspensePassesError";
  code: typeof LITSX_SSR_MAX_SUSPENSE_PASSES_ERROR;
  maxPasses: number;
}

/**
 * Values passed to `createSsrDevServer(...).render(...)`.
 */
export interface LitsxSsrDevRenderContext {
  html: typeof import("lit").html;
  clientEntry: string | null;
  root: string;
}

export type LitsxSsrModuleLoader = (
  specifier: string,
) => Promise<Record<string, unknown>>;

export type LitsxSsrElementResolver =
  | unknown
  | Promise<unknown>
  | (() => unknown | Promise<unknown>);

export type LitsxSsrElementRegistry = Record<string, LitsxSsrElementResolver>;

export interface LitsxSsrAuthoredDocumentOptions extends Omit<LitsxSsrDocumentOptions, "template" | "elements"> {
  /**
   * Filesystem root passed to Vite and used to resolve authored entries.
   */
  root?: string;

  /**
   * Optional client bootstrap module resolved relative to `root`.
   */
  clientEntry?: string;

  /**
   * Optional HTML template file used by the dev server document shell.
   *
   * The file must contain `<!--app-html-->`. LitSX also recognizes
   * `<!--app-head-->`, `<!--app-bootstrap-->`, and `<!--app-title-->`.
   *
   * When omitted, `createSsrDevServer(...)` falls back to the same document
   * shell behavior as `renderDocument(...)`.
   */
  template?:
    | string
    | ((context: LitsxSsrDocumentTemplateContext) => string)
    | null
    | undefined;

  /**
   * Optional scoped element resolvers keyed by custom element tag name.
   *
   * Pass either a plain object or a function that receives a SSR-aware
   * `loader(...)` helper.
   *
   * `loader(specifier)` resolves the authored module relative to `root` and
   * returns the SSR-ready module namespace for that file. In dev it resolves
   * through Vite SSR. Outside the dev server it compiles the authored module
   * to a temporary SSR module before importing it.
   */
  elements?:
    | LitsxSsrElementRegistry
    | ((loader: LitsxSsrModuleLoader) => LitsxSsrElementRegistry);

  /**
   * Produce the SSR root value for each request.
   *
   * `html` is Lit's template tag. `clientEntry` is the normalized public
   * browser entry path when one is configured, otherwise `null`. `root` is
   * the filesystem root used to resolve authored modules and templates.
   */
  render(context: LitsxSsrDevRenderContext): unknown | Promise<unknown>;
}

export interface LitsxAuthoredSsrEntry<T> {
  readonly [LITSX_AUTHORED_SSR_ENTRY]: true;
}

export interface LitsxSsrAuthoredRenderOptions extends Omit<LitsxSsrRenderOptions, "elements"> {
  /**
   * Filesystem root used to resolve authored entries.
   */
  root?: string;

  /**
   * Optional client entry module resolved relative to `root`.
   *
   * This is passed through the authored `render(...)` context for consistency
   * with `renderDocument(...)`, even when the fragment/stream APIs do not emit
   * a bootstrap script themselves.
   */
  clientEntry?: string;

  /**
   * Optional scoped element resolvers keyed by custom element tag name.
   *
   * This follows the same contract as `renderDocument(...)`: either pass a
   * registry directly or a function that receives the SSR-aware `loader(...)`
   * helper.
   */
  elements?:
    | LitsxSsrElementRegistry
    | ((loader: LitsxSsrModuleLoader) => LitsxSsrElementRegistry);

  /**
   * Produce the SSR root value using Lit's `html` helper plus any authored
   * elements resolved through `elements(...)`.
   */
  render(context: LitsxSsrDevRenderContext): unknown | Promise<unknown>;
}

export declare function createEntry<T extends object>(options: T): T & LitsxAuthoredSsrEntry<T>;

/**
 * Render the standard LitSX SSR bootstrap markup without building a document.
 *
 * @usage Use this when a framework wants to call `renderToString(...)` and
 * assemble its own shell while still reusing the standard LitSX hydration
 * bootstrap contract.
 */
export declare function renderBootstrap(
  options?: Pick<LitsxSsrDocumentOptions, "clientEntry" | "bootstrap" | "assetResolver">,
): string;

/**
 * Build the same document-shell metadata that `renderDocument(...)` uses from
 * an existing fragment render result.
 */
export declare function createDocumentContext(
  result: LitsxSsrResult,
  options?: LitsxSsrDocumentOptions,
): LitsxSsrDocumentTemplateContext;

export declare class LitsxSsrMaxSuspensePassesError extends Error {
  constructor(maxPasses: number);
  name: "LitsxSsrMaxSuspensePassesError";
  code: typeof LITSX_SSR_MAX_SUSPENSE_PASSES_ERROR;
  maxPasses: number;
}

export interface LitsxSsrDevServerOptions extends LitsxSsrAuthoredDocumentOptions {
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
}

interface LitsxSsrInternalAuthoredDocumentOptions extends LitsxSsrAuthoredDocumentOptions {
  /**
   * Optional location for the compiled temporary SSR module.
   */
  compiledServerPath?: string;

  /**
   * Optional Vite SSR server used to resolve authored modules through Vite's
   * SSR pipeline instead of compiling them directly.
   *
   * This is primarily used internally by `createSsrDevServer(...)`.
   */
  viteServer?: import("vite").ViteDevServer | undefined;
}

export interface LitsxSsrStreamResult {
  /**
   * Web stream that yields serialized HTML chunks after the SSR pass has
   * stabilized across suspense retries.
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
 * @param options Optional scoped SSR context, scoped elements registry, and
 * client asset resolution.
 * @returns A prerendered HTML fragment plus client import and hydration helpers.
 * @example
 * const result = await renderToString(
 *   html`<product-card .product=${product}></product-card>`,
 *   {
 *     elements: {
 *       "product-card": ProductCard,
 *     },
 *   },
 * );
 * result.html;
 * result.renderHydrationData();
 */
export declare function renderToString(
  value: unknown,
  options?: LitsxSsrRenderOptions,
): Promise<LitsxSsrResult>;

/**
 * Render an authored LitSX SSR configuration to an HTML fragment.
 *
 * @usage Use this when you want the same authored-entry model as
 * `renderDocument(...)`, but only need the rendered fragment and SSR metadata.
 * Wrap authored entries in `createEntry(...)`.
 */
export declare function renderToString(
  options: LitsxSsrAuthoredRenderOptions & LitsxAuthoredSsrEntry<LitsxSsrAuthoredRenderOptions>,
): Promise<LitsxSsrResult>;

/**
 * Render a Lit or LitSX value to a complete HTML document.
 *
 * This helper wraps `renderToString(...)` with a standard document shell,
 * emitted hydration metadata, module preloads, and an optional bootstrap
 * script suitable for whole-page SSR responses. You can also override the
 * document shell with `options.template(...)` when you need a custom layout.
 *
 * @usage Use this as the main whole-page SSR entrypoint when the server should
 * return a complete HTML document instead of a fragment.
 * @param value Lit or LitSX value to render through the scoped SSR runtime.
 * @param options Document shell, bootstrap, hydration-script, and optional
 * custom template options.
 * @returns A complete HTML document plus the same fragment metadata helpers as
 * `renderToString(...)`.
 * @example
 * const result = await renderDocument(<AppRoot .data={data} />, {
 *   title: "Dashboard",
 *   clientEntry: "/src/main.js",
 * });
 *
 * return new Response(result.document, {
 *   headers: { "content-type": "text/html; charset=utf-8" },
 * });
 *
 * @example
 * const result = await renderDocument(<AppRoot .data={data} />, {
 *   title: "Dashboard",
 *   elements: {
 *     "app-root": AppRoot,
 *   },
 *   template({ html, title, modulePreloads, hydrationScript, bootstrap }) {
 *     return `<!doctype html>
 * <html>
 *   <head>
 *     <title>${title}</title>
 *     ${modulePreloads}
 *     ${hydrationScript}
 *   </head>
 *   <body>
 *     <main class="shell">${html}</main>
 *     ${bootstrap}
 *   </body>
 * </html>`;
 *   },
 * });
 */
export declare function renderDocument(
  value: unknown,
  options?: LitsxSsrDocumentOptions,
): Promise<LitsxSsrDocumentResult>;

/**
 * Render a complete HTML document from an authored LitSX entry configuration.
 *
 * @usage Use this for document SSR when you want `renderDocument(...)` to
 * resolve authored LitSX modules through `elements(loader)` instead of passing
 * an already-imported render value. Wrap authored entries in `createEntry(...)`.
 * @param options Authored entry, document-template, and render callback configuration.
 * @returns A complete HTML document plus SSR fragment metadata.
 * @example
 * const result = await renderDocument(createEntry({
 *   root: process.cwd(),
 *   template: "./index.html",
 *   clientEntry: "./src/main.js",
 *   elements(loader) {
 *     return {
 *       "app-root": async () =>
 *         (await loader("./src/App.litsx")).AppRoot,
 *     };
 *   },
 *   render({ html }) {
 *     return html`<app-root></app-root>`;
 *   },
 * }));
 */
export declare function renderDocument(
  options: LitsxSsrAuthoredDocumentOptions & LitsxAuthoredSsrEntry<LitsxSsrAuthoredDocumentOptions>,
): Promise<LitsxSsrDocumentResult>;

/**
 * Create a Vite-backed development server for authored LitSX SSR entrypoints.
 *
 * @usage Use this for local SSR development when authored `.litsx` modules are
 * resolved through `elements(loader)` and you want Vite to serve the hydrated page.
 * @param options Dev-server, document-template, authored entry, and render callback configuration.
 * @returns A configured Vite dev server instance that still needs `listen()`.
 * @example
 * const server = await createSsrDevServer({
 *   root: process.cwd(),
 *   template: "./index.html",
 *   clientEntry: "./src/main.js",
 *   elements(loader) {
 *     return {
 *       "app-root": async () =>
 *         (await loader("./src/App.litsx")).AppRoot,
 *     };
 *   },
 *   render({ html }) {
 *     return html`<app-root></app-root>`;
 *   },
 * });
 *
 * await server.listen();
 */
export declare function createSsrDevServer(
  options: LitsxSsrDevServerOptions,
): Promise<import("vite").ViteDevServer>;

/**
 * Render a Lit or LitSX value to a Web Stream using the scoped LitSX SSR runtime.
 *
 * @usage Use this when you want to stream HTML to the client while still
 * collecting the same SSR metadata available from `renderToString(...)`.
 * @param value Lit or LitSX value to render through the scoped SSR runtime.
 * @param options Optional scoped SSR context, scoped elements registry, and
 * client asset resolution.
 * @returns A Web stream plus an `allReady` promise for the final SSR metadata.
 */
export declare function renderToStream(
  value: unknown,
  options?: LitsxSsrRenderOptions,
): Promise<LitsxSsrStreamResult>;

/**
 * Render an authored LitSX SSR configuration to a stream.
 *
 * @usage Use this when you want authored-entry SSR with the streaming surface
 * instead of a full document. Wrap authored entries in `createEntry(...)`.
 */
export declare function renderToStream(
  options: LitsxSsrAuthoredRenderOptions & LitsxAuthoredSsrEntry<LitsxSsrAuthoredRenderOptions>,
): Promise<LitsxSsrStreamResult>;
