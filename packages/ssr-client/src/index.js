function normalizeClientImports(value) {
  const values = Array.isArray(value) ? value : value == null ? [] : [value];
  return [...new Set(values.filter((entry) => typeof entry === "string" && entry.length > 0))];
}

export const LITSX_CLIENT_IMPORTS_SCRIPT_ID = "__LITSX_CLIENT_IMPORTS__";
export const LITSX_HYDRATION_DATA_SCRIPT_ID = "__LITSX_HYDRATION__";
export const LITSX_ROOT_ATTRIBUTE = "data-litsx-root";

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

function normalizeHydrationRoots(value) {
  if (!value || !Array.isArray(value.roots)) {
    return [];
  }

  return value.roots.filter((root) =>
    root &&
    typeof root === "object" &&
    typeof root.id === "string" &&
    root.id.length > 0,
  );
}

function queryHydrationRoot(container, id) {
  if (!container || !id) {
    return null;
  }

  if (typeof container.getAttribute === "function" &&
      container.getAttribute(LITSX_ROOT_ATTRIBUTE) === id) {
    return container;
  }

  if (container.host &&
      typeof container.host.getAttribute === "function" &&
      container.host.getAttribute(LITSX_ROOT_ATTRIBUTE) === id) {
    return container.host;
  }

  if (typeof container.querySelector === "function") {
    return container.querySelector(`[${LITSX_ROOT_ATTRIBUTE}="${id}"]`);
  }

  return null;
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

export function resolveHydrationRoots(
  rootOrDocument = typeof document === "undefined" ? null : document,
  options = {},
) {
  const hydrationData = readHydrationData(rootOrDocument, options);
  const roots = normalizeHydrationRoots(hydrationData);

  return roots.map((root) => {
    const element = queryHydrationRoot(rootOrDocument, root.id);
    if (!element) {
      throw new Error(
        `Failed to find a LitSX hydration root with ${LITSX_ROOT_ATTRIBUTE}="${root.id}".`
      );
    }

    const actualTagName = typeof element.tagName === "string"
      ? element.tagName.toLowerCase()
      : null;
    if (root.tagName && actualTagName && actualTagName !== String(root.tagName).toLowerCase()) {
      throw new Error(
        `Hydration root "${root.id}" expected <${root.tagName}> but found <${actualTagName}>.`
      );
    }

    return {
      ...root,
      element,
    };
  });
}

/**
 * Resolve a single LitSX hydration root by id from the current SSR metadata.
 */
export function resolveHydrationRoot(
  rootOrDocument = typeof document === "undefined" ? null : document,
  rootId,
  options = {},
) {
  if (typeof rootId !== "string" || rootId.length === 0) {
    throw new TypeError("resolveHydrationRoot(...) requires a non-empty root id.");
  }

  const roots = resolveHydrationRoots(rootOrDocument, options);
  const match = roots.find((entry) => entry.id === rootId);
  if (!match) {
    throw new Error(`Hydration metadata did not include root "${rootId}".`);
  }

  return match;
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

  const hydrationRoots = resolveHydrationRoots(root, options);

  const specifiers = readClientImports(root, options);
  await Promise.all(specifiers.map((specifier) => moduleLoader(specifier)));

  return hydrationRoots.length > 0 ? hydrationRoots : root;
}

export async function hydrateRoot(
  root,
  options = {},
) {
  const {
    register,
    moduleLoader = importClientModule,
    hydrationSupportLoader = importLitHydrationSupport,
  } = options;
  const element = root?.host ?? root;
  const rootId = typeof element?.getAttribute === "function"
    ? element.getAttribute(LITSX_ROOT_ATTRIBUTE)
    : null;

  if (!rootId) {
    throw new Error(
      `hydrateRoot(...) requires a root element marked with ${LITSX_ROOT_ATTRIBUTE}.`
    );
  }

  await installHydrationSupport(hydrationSupportLoader);

  if (typeof register === "function") {
    await register();
  }

  const specifiers = readClientImports(root, options);
  await Promise.all(specifiers.map((specifier) => moduleLoader(specifier)));

  const match = resolveHydrationRoot(resolveDocument(root) ?? root, rootId, options);

  return match.element ?? element;
}

export async function hydrateDocument(options = {}) {
  const root = options.document ?? (typeof document === "undefined" ? null : document);
  return hydrate(root, options);
}
