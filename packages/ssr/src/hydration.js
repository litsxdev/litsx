import "@lit-labs/ssr-client/lit-element-hydrate-support.js";
import {
  isCustomElementClass,
  isHydratableCustomElementClass,
  LITSX_HYDRATABLE_TAG,
  LITSX_MODULE_ID,
} from "@litsx/core/elements";
import { withLitsxHydration } from "./hydration-state.js";

const LIT_ELEMENT_HYDRATION_SUPPORT = Symbol.for(
  "@litsx/ssr/lit-element-hydration-support",
);

export function findLitElementConstructor(ctor) {
  let current = ctor;
  while (typeof current === "function" && current.prototype) {
    const prototype = current.prototype;
    const reactivePrototype = Object.getPrototypeOf(prototype);
    if (
      Object.hasOwn(prototype, "createRenderRoot") &&
      Object.hasOwn(prototype, "update") &&
      Object.hasOwn(prototype, "render") &&
      typeof reactivePrototype?.performUpdate === "function"
    ) {
      return current;
    }
    current = Object.getPrototypeOf(current);
  }
  return null;
}

export function ensureHydratableElementSupport(ctor) {
  const LitElement = findLitElementConstructor(ctor);
  if (!LitElement || LitElement[LIT_ELEMENT_HYDRATION_SUPPORT] === true) {
    return;
  }

  const support = globalThis.litElementHydrateSupport;
  // The official hook installs an own observedAttributes descriptor on
  // LitElement. Inspect the descriptor itself: invoking a getter that was
  // already wrapped would make a second installation observable as an error.
  const alreadyInstalled = Object.hasOwn(LitElement, "observedAttributes");
  if (
    typeof support === "function" &&
    !alreadyInstalled
  ) {
    support({ LitElement });
  }
  if (typeof support === "function") {
    Object.defineProperty(LitElement, LIT_ELEMENT_HYDRATION_SUPPORT, {
      value: true,
      configurable: true,
    });
  }
}

const SSR_RESOURCE_SNAPSHOT_BRIDGE = Symbol.for(
  "litsx.ssr.resourceSnapshotBridge",
);

export function createResourceSnapshotBridge() {
  let resources = null;
  const restored = new Map();

  return {
    prepare(nextResources) {
      resources = nextResources;
    },
    restore(key, restore) {
      if (!resources || !Object.hasOwn(resources, key)) {
        return;
      }

      const snapshot = resources[key];
      const identity = JSON.stringify(snapshot);
      if (restored.get(key) === identity) {
        return;
      }

      restore(snapshot);
      restored.set(key, identity);
    },
  };
}

/**
 * Make opaque SSR resource snapshots available to library hooks before a
 * delta fragment or its hydratable modules are applied.
 */
export function prepareHydrationResources(hydrationData) {
  const resources = normalizeHydrationPayload(hydrationData).resources ?? null;
  let bridge = globalThis[SSR_RESOURCE_SNAPSHOT_BRIDGE];
  if (
    !bridge ||
    typeof bridge.prepare !== "function" ||
    typeof bridge.restore !== "function"
  ) {
    bridge = createResourceSnapshotBridge();
    globalThis[SSR_RESOURCE_SNAPSHOT_BRIDGE] = bridge;
  }
  bridge.prepare(resources);
}

export function normalizeClientImports(value) {
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

const FORWARDED_REF_TARGET_ATTRIBUTE = "data-litsx-forwarded-ref-target";
const FORWARDED_REF_PROPS_ATTRIBUTE = "data-litsx-forwarded-ref-props";
const forwardedRefsByDocument = new WeakMap();

export function getForwardedRefs(documentRef) {
  let refs = forwardedRefsByDocument.get(documentRef);
  if (!refs) {
    refs = new Map();
    forwardedRefsByDocument.set(documentRef, refs);
  }
  return refs;
}

export function getForwardedRef(documentRef, id) {
  const refs = getForwardedRefs(documentRef);
  let ref = refs.get(id);
  if (!ref) {
    ref = { current: null };
    refs.set(id, ref);
  }
  return ref;
}

export function collectElementsIncludingShadowRoots(root) {
  const elements = [];
  const seen = new Set();
  const visit = (node) => {
    if (!node || seen.has(node)) return;
    seen.add(node);
    if (node.nodeType === 1) elements.push(node);
    for (const child of node.children ?? []) visit(child);
    if (node.shadowRoot) visit(node.shadowRoot);
    for (const child of node.childNodes ?? []) {
      if (child.nodeType === 1) visit(child);
    }
  };

  if (root?.nodeType === 9) {
    visit(root.documentElement);
  } else {
    visit(root);
  }
  return elements;
}

/**
 * Recreate client refs forwarded through SSR-only composition boundaries.
 *
 * The server emits only stable ids; refs themselves remain ordinary client
 * `{ current }` objects and are assigned before custom elements upgrade.
 */
export function prepareForwardedRefs(rootOrDocument = typeof document === "undefined" ? null : document) {
  const documentRef = resolveDocument(rootOrDocument);
  if (!documentRef || !rootOrDocument) return;

  const elements = collectElementsIncludingShadowRoots(rootOrDocument);
  const targetIds = new Set();
  for (const element of elements) {
    const targetId = element.getAttribute?.(FORWARDED_REF_TARGET_ATTRIBUTE);
    if (targetId) {
      targetIds.add(targetId);
      getForwardedRef(documentRef, targetId).current = element;
    }
  }

  // A whole-document pass happens after a route delta is committed. Clear
  // handles whose target was removed rather than leaving a stale detached
  // element exposed to a persistent layout.
  if (rootOrDocument?.nodeType === 9) {
    for (const [id, ref] of getForwardedRefs(documentRef)) {
      if (!targetIds.has(id)) ref.current = null;
    }
  }

  for (const element of elements) {
    const serialized = element.getAttribute?.(FORWARDED_REF_PROPS_ATTRIBUTE);
    if (!serialized) continue;
    let bindings;
    try {
      bindings = JSON.parse(serialized);
    } catch {
      continue;
    }
    if (!bindings || typeof bindings !== "object" || Array.isArray(bindings)) continue;
    for (const [property, id] of Object.entries(bindings)) {
      if (typeof property !== "string" || !property || typeof id !== "string" || !id) continue;
      element[property] = getForwardedRef(documentRef, id);
    }
  }
}

async function importClientModule(specifier) {
  return import(/* @vite-ignore */ specifier);
}

export function isThenable(value) {
  return value != null && typeof value.then === "function";
}

async function runHydrationRegistration(register) {
  try {
    return await register();
  } catch (thrown) {
    if (!isThenable(thrown)) {
      throw thrown;
    }
    await thrown;
    return undefined;
  }
}

function getCustomElementRegistry() {
  return globalThis.customElements ?? null;
}

export function isRegistrableHydrationExport(value) {
  return isHydratableCustomElementClass(value);
}

function registerHydratableElement(ctor) {
  if (!isCustomElementClass(ctor)) {
    throw new TypeError("Hydration registration requires a custom element constructor.");
  }

  const tagName = ctor[LITSX_HYDRATABLE_TAG];
  const registry = getCustomElementRegistry();

  ensureHydratableElementSupport(ctor);

  if (!registry) {
    throw new Error(
      `Cannot register LitSX hydration element "${tagName}" because globalThis.customElements is not available.`
    );
  }

  const existing = registry.get?.(tagName) ?? null;
  if (existing === ctor) {
    return;
  }
  if (
    existing &&
    existing[LITSX_MODULE_ID] &&
    existing[LITSX_MODULE_ID] === ctor[LITSX_MODULE_ID]
  ) {
    return;
  }

  if (existing && existing !== ctor) {
    throw new Error(
      `Cannot register LitSX hydration element "${tagName}" with a different constructor.`
    );
  }

  registry.define(tagName, ctor);
}

export function collectHydratableModuleExports(moduleNamespace) {
  if (!moduleNamespace || typeof moduleNamespace !== "object") {
    return [];
  }

  const seen = new Set();
  const matches = [];
  for (const value of Object.values(moduleNamespace)) {
    if (!isRegistrableHydrationExport(value) || seen.has(value)) {
      continue;
    }
    seen.add(value);
    matches.push(value);
  }
  return matches;
}

export function resolveDocument(rootOrDocument) {
  if (!rootOrDocument) {
    return typeof document === "undefined" ? null : document;
  }

  if (typeof rootOrDocument.getElementById === "function") {
    return rootOrDocument;
  }

  return rootOrDocument.ownerDocument ?? null;
}

export function readScriptText(documentRef, id) {
  if (!documentRef || !id || typeof documentRef.getElementById !== "function") {
    return null;
  }

  const node = documentRef.getElementById(id);
  return typeof node?.textContent === "string" ? node.textContent : null;
}

export function parseJsonScript(documentRef, id) {
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

export function normalizeHydrationRoots(value) {
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

export function normalizeHydrationPayload(value) {
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

  if (
    payload.resources != null &&
    (typeof payload.resources !== "object" || Array.isArray(payload.resources))
  ) {
    throw new Error("Invalid LitSX SSR hydration payload resources.");
  }

  return payload;
}

export function parseRootMarker(value) {
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

export function getChildNodes(container) {
  if (!container) {
    return [];
  }

  return container.childNodes ? [...container.childNodes] : [];
}

export function isCommentNode(node) {
  return node?.nodeType === 8 || node?.constructor?.name === "Comment";
}

export function isElementNode(node) {
  return node?.nodeType === 1 || typeof node?.tagName === "string";
}

export function findNextElementSibling(node) {
  let current = node?.nextSibling ?? null;
  while (current) {
    if (isElementNode(current)) {
      return current;
    }
    current = current.nextSibling ?? null;
  }

  return null;
}

export function findHydrationRootIdForElement(element) {
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

export function walkNodes(container, visit) {
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

export function queryHydrationRoot(container, id) {
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

function enableRegisteredHydrationRoots(roots) {
  const registry = getCustomElementRegistry();
  if (!registry) {
    return roots;
  }

  for (const root of Array.isArray(roots) ? roots : []) {
    const tagName = root?.element?.tagName?.toLowerCase?.() ?? root?.tagName;
    const ctor = tagName ? registry.get?.(tagName) : null;
    if (!ctor) {
      continue;
    }

    ensureHydratableElementSupport(ctor);
    root.element.removeAttribute?.("defer-hydration");
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
 * Register every hydratable LitSX custom element exported by a module namespace.
 *
 * This only inspects module exports and the global custom element registry.
 * It does not touch the DOM, read hydration payloads, or trigger hydration.
 */
export function registerHydrationModule(moduleNamespace) {
  for (const ctor of collectHydratableModuleExports(moduleNamespace)) {
    registerHydratableElement(ctor);
  }
}

/**
 * Resolve module namespaces or async module loaders, then register every
 * hydratable LitSX custom element they export.
 */
export async function registerHydrationModules(modules) {
  const entries = Array.isArray(modules) ? modules : [];
  for (const entry of entries) {
    const moduleNamespace = typeof entry === "function" ? await entry() : entry;
    registerHydrationModule(moduleNamespace);
  }
}

/**
 * Read SSR hydration metadata, run optional root-registration bootstrap code,
 * and then load the client-side modules needed to upgrade SSR-rendered LitSX
 * roots.
 *
 * This helper intentionally stays minimal:
 * - it does not walk the DOM or generate hydration payloads
 * - it relies on the top-level hydration support installed by this module
 * - it leaves root custom-element registration to the caller's bootstrap code
 *
 * Typical usage:
 *
 * `await hydrate(document, { register: () => import("./main.js"), clientImports });`
 */
async function hydrateImpl(
  root = typeof document === "undefined" ? null : document,
  options = {},
) {
  const {
    register,
    moduleLoader = importClientModule,
  } = options;

  const hydrationData = readHydrationData(root, options);
  prepareHydrationResources(hydrationData);
  prepareForwardedRefs(root);
  const hydrationRoots = resolveHydrationRoots(root, options);
  applyHydrationPayload(hydrationRoots, hydrationData);

  if (typeof register === "function") {
    await runHydrationRegistration(register);
  }

  const specifiers = readClientImports(root, options);
  const modules = await Promise.all(specifiers.map((specifier) =>
    runHydrationRegistration(() => moduleLoader(specifier))
  ));
  modules.forEach((moduleNamespace) => {
    if (getCustomElementRegistry() && moduleNamespace && typeof moduleNamespace === "object") {
      registerHydrationModule(moduleNamespace);
    }
  });

  enableRegisteredHydrationRoots(hydrationRoots);

  return hydrationRoots.length > 0 ? hydrationRoots : root;
}

export async function hydrate(root, options = {}) {
  return withLitsxHydration(() => hydrateImpl(root, options));
}

async function hydrateRootImpl(
  root,
  options = {},
) {
  const {
    register,
    moduleLoader = importClientModule,
  } = options;
  const element = root?.host ?? root;
  const rootId = options.rootId ?? findHydrationRootIdForElement(element);

  if (!rootId) {
    throw new Error(
      "hydrateRoot(...) requires a root id or an element marked as a LitSX SSR root."
    );
  }

  const documentRef = resolveDocument(root) ?? root;
  const hydrationData = readHydrationData(documentRef, options);
  prepareHydrationResources(hydrationData);
  prepareForwardedRefs(root);
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
    await runHydrationRegistration(register);
  }

  const specifiers = readClientImports(root, options);
  const modules = await Promise.all(specifiers.map((specifier) =>
    runHydrationRegistration(() => moduleLoader(specifier))
  ));
  modules.forEach((moduleNamespace) => {
    if (getCustomElementRegistry() && moduleNamespace && typeof moduleNamespace === "object") {
      registerHydrationModule(moduleNamespace);
    }
  });

  return match.element ?? element;
}

export async function hydrateRoot(root, options = {}) {
  return withLitsxHydration(() => hydrateRootImpl(root, options));
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
