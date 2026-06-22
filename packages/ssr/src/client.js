function normalizeClientImports(value) {
  const values = Array.isArray(value) ? value : value == null ? [] : [value];
  return [...new Set(values.filter((entry) => typeof entry === "string" && entry.length > 0))];
}

/**
 * Default JSON script id used for client import metadata emitted by `@litsx/ssr`.
 */
export const LITSX_CLIENT_IMPORTS_SCRIPT_ID = "__LITSX_CLIENT_IMPORTS__";

/**
 * Default JSON script id used for LitSX hydration metadata emitted by `@litsx/ssr`.
 */
export const LITSX_HYDRATION_DATA_SCRIPT_ID = "__LITSX_HYDRATION__";

/**
 * Root host attribute used to correlate DOM elements with LitSX SSR root ids.
 */
export const LITSX_ROOT_ATTRIBUTE = "data-litsx-root";

/**
 * Comment-marker prefix used as a fallback when no explicit root attribute exists.
 */
export const LITSX_ROOT_MARKER_PREFIX = "litsx-root";

/**
 * Property used to attach the resolved root-scoped hydration payload to a host.
 */
export const LITSX_HYDRATION_PAYLOAD_PROPERTY = "__litsxHydrationPayload";

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

function normalizeHydrationPayload(value) {
  const payload = value?.payload;
  if (payload == null) {
    return {
      roots: {},
      instances: {},
    };
  }

  if (
    typeof payload !== "object" ||
    Array.isArray(payload) ||
    payload.roots == null ||
    payload.instances == null ||
    typeof payload.roots !== "object" ||
    Array.isArray(payload.roots) ||
    typeof payload.instances !== "object" ||
    Array.isArray(payload.instances)
  ) {
    throw new Error("Invalid LitSX SSR hydration payload.");
  }

  return payload;
}

function parseRootMarker(value) {
  const text = String(value ?? "").trim();
  if (!text.startsWith(LITSX_ROOT_MARKER_PREFIX)) {
    return null;
  }

  const entries = Object.fromEntries(
    text
      .slice(LITSX_ROOT_MARKER_PREFIX.length)
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .map((part) => {
        const separatorIndex = part.indexOf("=");
        return separatorIndex === -1
          ? [part, ""]
          : [part.slice(0, separatorIndex), part.slice(separatorIndex + 1)];
      }),
  );

  return entries.id
    ? {
      id: entries.id,
      tagName: entries.tag ?? null,
    }
    : null;
}

function getChildNodes(container) {
  if (!container) {
    return [];
  }

  return container.childNodes ? [...container.childNodes] : [];
}

function isCommentNode(node) {
  return node?.nodeType === 8 || node?.constructor?.name === "Comment";
}

function isElementNode(node) {
  return node?.nodeType === 1 || typeof node?.tagName === "string";
}

function findNextElementSibling(node) {
  let current = node?.nextSibling ?? null;
  while (current) {
    if (isElementNode(current)) {
      return current;
    }
    current = current.nextSibling ?? null;
  }

  return null;
}

function findHydrationRootIdForElement(element) {
  if (!element) {
    return null;
  }

  const attributeRootId = element.getAttribute?.(LITSX_ROOT_ATTRIBUTE);
  if (attributeRootId) {
    return attributeRootId;
  }

  let current = element.previousSibling ?? null;
  while (current) {
    if (isElementNode(current)) {
      return null;
    }

    if (isCommentNode(current)) {
      const marker = parseRootMarker(current.data ?? current.nodeValue);
      return marker?.id ?? null;
    }

    current = current.previousSibling ?? null;
  }

  return null;
}

function walkNodes(container, visit) {
  for (const node of getChildNodes(container)) {
    if (visit(node) === false) {
      return false;
    }

    if (node?.childNodes && walkNodes(node, visit) === false) {
      return false;
    }

    if (node?.shadowRoot && walkNodes(node.shadowRoot, visit) === false) {
      return false;
    }
  }
  return true;
}

function queryHydrationRoot(container, id) {
  if (!container || !id) {
    return null;
  }

  let match = null;
  walkNodes(container, (node) => {
    if (isElementNode(node) && node.getAttribute?.(LITSX_ROOT_ATTRIBUTE) === id) {
      match = node;
      return false;
    }

    if (!isCommentNode(node)) {
      return true;
    }

    const marker = parseRootMarker(node.data ?? node.nodeValue);
    if (marker?.id !== id) {
      return true;
    }

    match = findNextElementSibling(node);
    return false;
  });

  return match;
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
  const imports = normalizeClientImports(parsed);
  if (imports.length > 0) {
    return imports;
  }

  const hydrationData = readHydrationData(rootOrDocument, {
    hydrationData: options.hydrationData,
  });
  return normalizeClientImports(hydrationData?.clientImports);
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

export function readHydrationPayload(
  rootOrDocument = typeof document === "undefined" ? null : document,
  options = {},
) {
  return normalizeHydrationPayload(readHydrationData(rootOrDocument, options));
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
          `Failed to find a LitSX hydration root element for "${root.id}".`
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

export function applyHydrationPayload(
  roots,
  hydrationData,
) {
  const payload = normalizeHydrationPayload(hydrationData);

  for (const root of roots) {
    const rootPayload = payload.roots[root.id] ?? null;
    if (rootPayload == null) {
      continue;
    }

    const currentPayload = root.element[LITSX_HYDRATION_PAYLOAD_PROPERTY];
    if (currentPayload !== undefined && currentPayload !== rootPayload) {
      throw new Error(`Hydration payload for root "${root.id}" has already been applied.`);
    }

    root.element[LITSX_HYDRATION_PAYLOAD_PROPERTY] = rootPayload;
    if (
      rootPayload.props &&
      typeof rootPayload.props === "object" &&
      !Array.isArray(rootPayload.props)
    ) {
      Object.assign(root.element, rootPayload.props);
    }
  }

  return roots;
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

  const hydrationData = readHydrationData(root, options);
  const hydrationRoots = resolveHydrationRoots(root, options);
  applyHydrationPayload(hydrationRoots, hydrationData);

  if (typeof register === "function") {
    await register();
  }

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
  const rootId = options.rootId ?? findHydrationRootIdForElement(element);

  if (!rootId) {
    throw new Error(
      "hydrateRoot(...) requires a root id or an element marked as a LitSX SSR root."
    );
  }

  await installHydrationSupport(hydrationSupportLoader);

  const documentRef = resolveDocument(root) ?? root;
  const hydrationData = readHydrationData(documentRef, options);
  const rootMetadata = normalizeHydrationRoots(hydrationData).find((entry) => entry.id === rootId);
  if (!rootMetadata) {
    throw new Error(`Hydration metadata did not include root "${rootId}".`);
  }

  const actualTagName = typeof element?.tagName === "string"
    ? element.tagName.toLowerCase()
    : null;
  if (
    rootMetadata.tagName &&
    actualTagName &&
    actualTagName !== String(rootMetadata.tagName).toLowerCase()
  ) {
    throw new Error(
      `Hydration root "${rootId}" expected <${rootMetadata.tagName}> but found <${actualTagName}>.`
    );
  }

  const match = {
    ...rootMetadata,
    element,
  };
  applyHydrationPayload([match], hydrationData);

  if (typeof register === "function") {
    await register();
  }

  const specifiers = readClientImports(root, options);
  await Promise.all(specifiers.map((specifier) => moduleLoader(specifier)));

  return match.element ?? element;
}

export async function hydrateDocument(options = {}) {
  const root = options.document ?? (typeof document === "undefined" ? null : document);
  return hydrate(root, options);
}

/**
 * Hydrate a full SSR-rendered page using the default LitSX SSR document metadata.
 *
 * This is the recommended document-level entrypoint for pages rendered by
 * `renderDocument(...)`. It is equivalent to `hydrateDocument(...)` but makes
 * the whole-page intent explicit in public API docs.
 */
export async function hydratePage(options = {}) {
  return hydrateDocument(options);
}
