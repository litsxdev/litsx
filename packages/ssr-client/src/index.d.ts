export interface HydrateOptions {
  clientImports?: string | string[] | null | undefined;
  imports?: string | string[] | null | undefined;
  hydrationData?: unknown;
  scriptId?: string | null | undefined;
  register?: (() => unknown | Promise<unknown>) | null | undefined;
  moduleLoader?: ((specifier: string) => unknown | Promise<unknown>) | null | undefined;
  hydrationSupportLoader?: (() => unknown | Promise<unknown>) | null | undefined;
}

export interface HydrateDocumentOptions extends HydrateOptions {
  document?: Document | null | undefined;
}

export declare const LITSX_CLIENT_IMPORTS_SCRIPT_ID: "__LITSX_CLIENT_IMPORTS__";
export declare const LITSX_HYDRATION_DATA_SCRIPT_ID: "__LITSX_HYDRATION__";
export declare const LITSX_ROOT_ATTRIBUTE: "data-litsx-root";

export declare function readClientImports(
  rootOrDocument?: Document | Element | null,
  options?: Pick<HydrateOptions, "clientImports" | "imports" | "scriptId">,
): string[];

export declare function readHydrationData<T = unknown>(
  rootOrDocument?: Document | Element | null,
  options?: Pick<HydrateOptions, "hydrationData" | "scriptId">,
): T | null;

export interface ResolvedHydrationRoot {
  id: string;
  tagName?: string;
  moduleId?: string;
  element: Element;
}

export declare function resolveHydrationRoots(
  rootOrDocument?: Document | Element | ShadowRoot | null,
  options?: Pick<HydrateOptions, "hydrationData" | "scriptId">,
): ResolvedHydrationRoot[];

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

export declare function hydrateRoot<T = Element | ShadowRoot | Document | null>(
  root: T,
  options?: HydrateOptions,
): Promise<Element | T>;

export declare function hydrateDocument(
  options?: HydrateDocumentOptions,
): Promise<Document | null | ResolvedHydrationRoot[]>;
