export interface HydrateOptions {
  clientImports?: string | string[] | null | undefined;
  imports?: string | string[] | null | undefined;
  register?: (() => unknown | Promise<unknown>) | null | undefined;
  moduleLoader?: ((specifier: string) => unknown | Promise<unknown>) | null | undefined;
  hydrationSupportLoader?: (() => unknown | Promise<unknown>) | null | undefined;
}

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
): Promise<T>;
