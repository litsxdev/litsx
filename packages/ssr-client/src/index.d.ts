/**
 * Shared hydration options used by the document, root, and low-level helpers.
 */
export interface HydrateOptions {
  /**
   * Explicit client imports to load after hydration support and bootstrap.
   */
  clientImports?: string | string[] | null | undefined;

  /**
   * Alias for `clientImports`.
   */
  imports?: string | string[] | null | undefined;

  /**
   * Explicit hydration data object. When omitted, the default JSON script tag
   * emitted by `@litsx/ssr` is read from the document.
   */
  hydrationData?: unknown;

  /**
   * Override the JSON script id used for hydration data or client imports.
   */
  scriptId?: string | null | undefined;

  /**
   * Optional bootstrap callback that defines the custom elements for the page.
   */
  register?: (() => unknown | Promise<unknown>) | null | undefined;

  /**
   * Override how discovered client module imports are loaded.
   */
  moduleLoader?: ((specifier: string) => unknown | Promise<unknown>) | null | undefined;

  /**
   * Override how Lit's hydration support side effect is installed.
   */
  hydrationSupportLoader?: (() => unknown | Promise<unknown>) | null | undefined;

  /**
   * Explicit root id used by `hydrateRoot(...)`.
   */
  rootId?: string | null | undefined;
}

export interface HydrateDocumentOptions extends HydrateOptions {
  /**
   * Explicit document to hydrate. Defaults to the global `document`.
   */
  document?: Document | null | undefined;
}

export declare const LITSX_CLIENT_IMPORTS_SCRIPT_ID: "__LITSX_CLIENT_IMPORTS__";
export declare const LITSX_HYDRATION_DATA_SCRIPT_ID: "__LITSX_HYDRATION__";
export declare const LITSX_ROOT_ATTRIBUTE: "data-litsx-root";
export declare const LITSX_ROOT_MARKER_PREFIX: "litsx-root";
export declare const LITSX_HYDRATION_PAYLOAD_PROPERTY: "__litsxHydrationPayload";

/**
 * Read deduplicated client imports from explicit options, the standalone
 * imports script, or the LitSX hydration payload.
 */
export declare function readClientImports(
  rootOrDocument?: Document | Element | null,
  options?: Pick<HydrateOptions, "clientImports" | "imports" | "scriptId">,
): string[];

/**
 * Read LitSX hydration metadata from the current document or explicit options.
 */
export declare function readHydrationData<T = unknown>(
  rootOrDocument?: Document | Element | null,
  options?: Pick<HydrateOptions, "hydrationData" | "scriptId">,
): T | null;

/**
 * Read and validate the structured hydration payload object.
 */
export declare function readHydrationPayload<T = unknown>(
  rootOrDocument?: Document | Element | null,
  options?: Pick<HydrateOptions, "hydrationData" | "scriptId">,
): T;

export interface ResolvedHydrationRoot {
  /**
   * LitSX SSR root id.
   */
  id: string;

  /**
   * Expected custom element tag name when declared by the server payload.
   */
  tagName?: string;

  /**
   * Original authored module id for the root when available.
   */
  moduleId?: string;

  /**
   * Matched DOM element for the SSR root boundary.
   */
  element: Element;
}

/**
 * Attach a root-scoped SSR hydration payload to its matching root elements.
 */
export declare function applyHydrationPayload(
  roots: ResolvedHydrationRoot[],
  hydrationData: unknown,
): ResolvedHydrationRoot[];

/**
 * Resolve every LitSX hydration root declared in the current SSR payload.
 */
export declare function resolveHydrationRoots(
  rootOrDocument?: Document | Element | ShadowRoot | null,
  options?: Pick<HydrateOptions, "hydrationData" | "scriptId">,
): ResolvedHydrationRoot[];

/**
 * Resolve a single LitSX hydration root by id from the current SSR payload.
 */
export declare function resolveHydrationRoot(
  rootOrDocument: Document | Element | ShadowRoot | null | undefined,
  rootId: string,
  options?: Pick<HydrateOptions, "hydrationData" | "scriptId">,
): ResolvedHydrationRoot;

/**
 * Install Lit's hydration support before importing LitSX client modules.
 *
 * @usage Call this only when you need manual control over when Lit hydration
 * support is installed. Most apps should use `hydratePage(...)`,
 * `hydrateDocument(...)`, or `hydrate(...)`.
 */
export declare function installHydrationSupport(
  loader?: (() => unknown | Promise<unknown>) | null,
): Promise<unknown>;

/**
 * Install hydration support, run optional root-registration bootstrap code, and
 * then load the provided client module imports.
 *
 * This is the lowest-level document or element hydration helper exposed by
 * `@litsx/ssr-client`.
 *
 * @usage Use this when you need explicit control over the root node being
 * hydrated or over how client imports are discovered and loaded.
 * @param root Document, element, or root-like container to hydrate.
 * @param options Bootstrap, payload, and client-module loading options.
 * @returns The resolved hydration roots when metadata exists, otherwise the
 * original root.
 */
export declare function hydrate<T = Document | null>(
  root?: T,
  options?: HydrateOptions,
): Promise<T | ResolvedHydrationRoot[]>;

/**
 * Hydrate one explicit LitSX root element and validate it against SSR metadata
 * when that metadata is available.
 *
 * @usage Use this when you want to hydrate a single SSR root instead of the
 * whole document.
 * @param root Root element or shadow root to hydrate.
 * @param options Root id, payload, bootstrap, and client-module loading options.
 * @returns The hydrated root element.
 */
export declare function hydrateRoot<T = Element | ShadowRoot | Document | null>(
  root: T,
  options?: HydrateOptions,
): Promise<Element | T>;

/**
 * Hydrate a whole document and return resolved LitSX root boundaries when the
 * SSR payload declares them.
 *
 * @usage Use this when you want document-level hydration but prefer the
 * explicit `document`-oriented naming over `hydrate(...)`.
 * @param options Document, payload, bootstrap, and client-module loading options.
 * @returns The resolved hydration roots when metadata exists, otherwise the
 * document.
 */
export declare function hydrateDocument(
  options?: HydrateDocumentOptions,
): Promise<Document | null | ResolvedHydrationRoot[]>;

/**
 * Recommended whole-page hydration entrypoint for documents rendered by
 * `renderDocument(...)` in `@litsx/ssr`.
 *
 * @usage Use this as the standard client entrypoint for HTML documents emitted
 * by `renderDocument(...)`.
 * @param options Document, payload, bootstrap, and client-module loading options.
 * @returns The resolved hydration roots when metadata exists, otherwise the
 * document.
 * @example
 * await hydratePage({
 *   register: () => import("./main.js"),
 * });
 */
export declare function hydratePage(
  options?: HydrateDocumentOptions,
  ): Promise<Document | null | ResolvedHydrationRoot[]>;
