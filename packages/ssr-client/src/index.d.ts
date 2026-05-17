export interface HydrateOptions {
  clientImports?: string | string[] | null | undefined;
  imports?: string | string[] | null | undefined;
  hydrationData?: unknown;
  scriptId?: string | null | undefined;
  register?: (() => unknown | Promise<unknown>) | null | undefined;
  moduleLoader?: ((specifier: string) => unknown | Promise<unknown>) | null | undefined;
  hydrationSupportLoader?: (() => unknown | Promise<unknown>) | null | undefined;
  rootId?: string | null | undefined;
}

export interface HydrateDocumentOptions extends HydrateOptions {
  document?: Document | null | undefined;
}

export declare const LITSX_CLIENT_IMPORTS_SCRIPT_ID: "__LITSX_CLIENT_IMPORTS__";
export declare const LITSX_HYDRATION_DATA_SCRIPT_ID: "__LITSX_HYDRATION__";
export declare const LITSX_ROOT_ATTRIBUTE: "data-litsx-root";
export declare const LITSX_ROOT_MARKER_PREFIX: "litsx-root";
export declare const LITSX_HYDRATION_PAYLOAD_PROPERTY: "__litsxHydrationPayload";

export declare function readClientImports(
  rootOrDocument?: Document | Element | null,
  options?: Pick<HydrateOptions, "clientImports" | "imports" | "scriptId">,
): string[];

export declare function readHydrationData<T = unknown>(
  rootOrDocument?: Document | Element | null,
  options?: Pick<HydrateOptions, "hydrationData" | "scriptId">,
): T | null;

export declare function readHydrationPayload<T = unknown>(
  rootOrDocument?: Document | Element | null,
  options?: Pick<HydrateOptions, "hydrationData" | "scriptId">,
): T;

export interface ResolvedHydrationRoot {
  id: string;
  tagName?: string;
  moduleId?: string;
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
 */
export declare function installHydrationSupport(
  loader?: (() => unknown | Promise<unknown>) | null,
): Promise<unknown>;

/**
 * Install hydration support, run optional root-registration bootstrap code, and
 * then load the provided client module imports.
 */
export declare function hydrate<T = Document | null>(
  root?: T,
  options?: HydrateOptions,
): Promise<T | ResolvedHydrationRoot[]>;

/**
 * Hydrate one explicit LitSX root element and validate it against SSR metadata
 * when that metadata is available.
 */
export declare function hydrateRoot<T = Element | ShadowRoot | Document | null>(
  root: T,
  options?: HydrateOptions,
): Promise<Element | T>;

/**
 * Hydrate a whole document and return resolved LitSX root boundaries when the
 * SSR payload declares them.
 */
export declare function hydrateDocument(
  options?: HydrateDocumentOptions,
): Promise<Document | null | ResolvedHydrationRoot[]>;
