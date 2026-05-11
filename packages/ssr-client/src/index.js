function normalizeClientImports(value) {
  const values = Array.isArray(value) ? value : value == null ? [] : [value];
  return [...new Set(values.filter((entry) => typeof entry === "string" && entry.length > 0))];
}

export const LITSX_CLIENT_IMPORTS_SCRIPT_ID = "__LITSX_CLIENT_IMPORTS__";
export const LITSX_HYDRATION_DATA_SCRIPT_ID = "__LITSX_HYDRATION__";

async function importLitHydrationSupport() {
  return import("@lit-labs/ssr-client/lit-element-hydrate-support.js");
}

async function importClientModule(specifier) {
  return import(/* @vite-ignore */ specifier);
}

let hydrationSupportPromise;

function resolveDocument(rootOrDocument) {
  if (!rootOrDocument) {
    return typeof document === "undefined" ? null : document;
  }

  if (typeof rootOrDocument.getElementById === "function") {
    return rootOrDocument;
  }

  return rootOrDocument.ownerDocument ?? null;
}

function readScriptText(documentRef, id) {
  if (!documentRef || !id || typeof documentRef.getElementById !== "function") {
    return null;
  }

  const node = documentRef.getElementById(id);
  return typeof node?.textContent === "string" ? node.textContent : null;
}

function parseJsonScript(documentRef, id) {
  const text = readScriptText(documentRef, id);
  if (text == null || text.trim() === "") {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(
      `Failed to parse LitSX SSR JSON script "${id}": ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

export function readClientImports(
  rootOrDocument = typeof document === "undefined" ? null : document,
  options = {},
) {
  const explicit = options.clientImports ?? options.imports;
  if (explicit != null) {
    return normalizeClientImports(explicit);
  }

  const documentRef = resolveDocument(rootOrDocument);
  const scriptId = options.scriptId ?? LITSX_CLIENT_IMPORTS_SCRIPT_ID;
  const parsed = parseJsonScript(documentRef, scriptId);
  return normalizeClientImports(parsed);
}

export function readHydrationData(
  rootOrDocument = typeof document === "undefined" ? null : document,
  options = {},
) {
  const explicit = options.hydrationData;
  if (explicit != null) {
    return explicit;
  }

  const documentRef = resolveDocument(rootOrDocument);
  const scriptId = options.scriptId ?? LITSX_HYDRATION_DATA_SCRIPT_ID;
  return parseJsonScript(documentRef, scriptId);
}

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
    register,
    moduleLoader = importClientModule,
    hydrationSupportLoader = importLitHydrationSupport,
  } = options;

  await installHydrationSupport(hydrationSupportLoader);

  if (typeof register === "function") {
    await register();
  }

  const specifiers = readClientImports(root, options);
  await Promise.all(specifiers.map((specifier) => moduleLoader(specifier)));

  return root;
}

export async function hydrateRoot(
  root,
  options = {},
) {
  return hydrate(root, options);
}

export async function hydrateDocument(options = {}) {
  const root = options.document ?? (typeof document === "undefined" ? null : document);
  return hydrate(root, options);
}
