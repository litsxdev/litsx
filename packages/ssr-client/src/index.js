function normalizeClientImports(value) {
  const values = Array.isArray(value) ? value : value == null ? [] : [value];
  return [...new Set(values.filter((entry) => typeof entry === "string" && entry.length > 0))];
}

async function importLitHydrationSupport() {
  return import("@lit-labs/ssr-client/lit-element-hydrate-support.js");
}

async function importClientModule(specifier) {
  return import(/* @vite-ignore */ specifier);
}

let hydrationSupportPromise;

/**
 * Install Lit's hydration support before loading any LitSX client modules.
 *
 * Lit's SSR hydration support patches LitElement globally through a side-effect
 * module. It must be loaded before importing the modules that define the
 * custom elements you want to hydrate.
 */
export function installHydrationSupport(loader = importLitHydrationSupport) {
  hydrationSupportPromise ??= Promise.resolve().then(() => loader());
  return hydrationSupportPromise;
}

/**
 * Install hydration support and then load the client-side modules needed to
 * upgrade SSR-rendered LitSX roots.
 *
 * This helper intentionally stays minimal:
 * - it does not walk the DOM or generate hydration payloads
 * - it relies on Lit's native SSR hydration support
 * - it leaves root custom-element registration to the caller's bootstrap code
 *
 * Typical usage:
 *
 * `await hydrate(document, { register: () => import("./main.js"), clientImports });`
 */
export async function hydrate(
  root = typeof document === "undefined" ? null : document,
  options = {},
) {
  const {
    clientImports,
    imports,
    register,
    moduleLoader = importClientModule,
    hydrationSupportLoader = importLitHydrationSupport,
  } = options;

  await installHydrationSupport(hydrationSupportLoader);

  if (typeof register === "function") {
    await register();
  }

  const specifiers = normalizeClientImports(clientImports ?? imports);
  await Promise.all(specifiers.map((specifier) => moduleLoader(specifier)));

  return root;
}
