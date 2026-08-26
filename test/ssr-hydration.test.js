import assert from "assert";
import fs from "node:fs";
import path from "node:path";
import { beforeEach, describe, it, vi } from "vitest";
import {
  LITSX_HYDRATABLE_TAG,
  LITSX_MODULE_ID,
} from "../packages/core/src/elements/index.js";
import { useSsrResourceSnapshot } from "../packages/core/src/index.js";

const SSR_RESOURCE_SNAPSHOT_BRIDGE = Symbol.for(
  "litsx.ssr.resourceSnapshotBridge",
);

describe("@litsx/ssr/hydration", () => {
  beforeEach(() => {
    vi.resetModules();
    delete globalThis.document;
    delete globalThis.customElements;
    delete globalThis[SSR_RESOURCE_SNAPSHOT_BRIDGE];
  });

  function createCustomElementsRegistry() {
    const definitions = new Map();
    return {
      define: vi.fn((tagName, ctor) => {
        definitions.set(tagName, ctor);
      }),
      get: vi.fn((tagName) => definitions.get(tagName) ?? null),
      definitions,
    };
  }

  function createHydratableComponent(tagName) {
    class HydratableComponent {}
    HydratableComponent[LITSX_HYDRATABLE_TAG] = tagName;
    return HydratableComponent;
  }

  function createRootMarkerDocument({
    rootId = "litsx-root-0",
    tagName = "PRODUCT-CARD",
  } = {}) {
    const rootElement = {
      nodeType: 1,
      tagName,
      previousSibling: null,
      nextSibling: null,
      childNodes: [],
    };
    const marker = {
      nodeType: 8,
      data: `litsx-root id=${rootId} tag=${tagName.toLowerCase()}`,
      previousSibling: null,
      nextSibling: rootElement,
    };
    rootElement.previousSibling = marker;

    return {
      rootElement,
      documentRef: {
        childNodes: [marker, rootElement],
        getElementById() {
          return null;
        },
      },
    };
  }

  function createRootAttributeDocument({
    rootId = "litsx-root-0",
    tagName = "PRODUCT-CARD",
  } = {}) {
    const rootElement = {
      nodeType: 1,
      tagName,
      previousSibling: null,
      nextSibling: null,
      childNodes: [],
      getAttribute(name) {
        return name === "data-litsx-root" ? rootId : null;
      },
    };

    return {
      rootElement,
      documentRef: {
        childNodes: [rootElement],
        getElementById() {
          return null;
        },
      },
    };
  }

  it("installs Lit hydration support before importing @litsx/core/elements", () => {
    const hydrationSource = fs.readFileSync(
      path.resolve("packages/ssr/src/hydration.js"),
      "utf8",
    );
    const litHydrationImport = 'import "@lit-labs/ssr-client/lit-element-hydrate-support.js";';
    const coreImport = 'from "@litsx/core/elements";';

    assert.match(hydrationSource, /@lit-labs\/ssr-client\/lit-element-hydrate-support\.js/);
    assert.match(hydrationSource, /from "@litsx\/core\/elements"/);
    assert.ok(
      hydrationSource.indexOf(litHydrationImport) < hydrationSource.indexOf(coreImport),
      "expected Lit hydration support import to come before @litsx/core/elements",
    );
  });

  it("registers a module with one hydratable LitSX export", async () => {
    const { registerHydrationModule } = await import("../packages/ssr/src/hydration.js");
    const registry = createCustomElementsRegistry();
    globalThis.customElements = registry;
    const ProductCard = createHydratableComponent("product-card");

    registerHydrationModule({
      ProductCard,
      helper: () => {},
      value: 123,
    });

    assert.strictEqual(registry.get("product-card"), ProductCard);
    assert.strictEqual(registry.define.mock.calls.length, 1);
  });

  it("registers multiple hydratable exports from one module", async () => {
    const { registerHydrationModule } = await import("../packages/ssr/src/hydration.js");
    const registry = createCustomElementsRegistry();
    globalThis.customElements = registry;
    const ProductCard = createHydratableComponent("product-card");
    const ProductImage = createHydratableComponent("product-image");

    registerHydrationModule({
      ProductCard,
      ProductImage,
    });

    assert.strictEqual(registry.get("product-card"), ProductCard);
    assert.strictEqual(registry.get("product-image"), ProductImage);
    assert.strictEqual(registry.define.mock.calls.length, 2);
  });

  it("does not redefine a tag already registered with the same constructor", async () => {
    const { registerHydrationModule } = await import("../packages/ssr/src/hydration.js");
    const registry = createCustomElementsRegistry();
    globalThis.customElements = registry;
    const ProductCard = createHydratableComponent("product-card");

    registerHydrationModule({ ProductCard });
    registerHydrationModule({ ProductCard });

    assert.strictEqual(registry.define.mock.calls.length, 1);
  });

  it("accepts an equivalent constructor evaluated through the same authored module", async () => {
    const { registerHydrationModule } = await import("../packages/ssr/src/hydration.js");
    const registry = createCustomElementsRegistry();
    globalThis.customElements = registry;
    const ProductCardA = createHydratableComponent("product-card");
    const ProductCardB = createHydratableComponent("product-card");
    ProductCardA[LITSX_MODULE_ID] = "/src/product-card.tsx";
    ProductCardB[LITSX_MODULE_ID] = "/src/product-card.tsx";

    registerHydrationModule({ ProductCardA });
    registerHydrationModule({ ProductCardB });

    assert.strictEqual(registry.get("product-card"), ProductCardA);
    assert.strictEqual(registry.define.mock.calls.length, 1);
  });

  it("fails clearly when the same tag is already registered with a different constructor", async () => {
    const { registerHydrationModule } = await import("../packages/ssr/src/hydration.js");
    const registry = createCustomElementsRegistry();
    globalThis.customElements = registry;
    const ProductCardA = createHydratableComponent("product-card");
    const ProductCardB = createHydratableComponent("product-card");

    registerHydrationModule({ ProductCardA });

    assert.throws(
      () => registerHydrationModule({ ProductCardB }),
      /Cannot register LitSX hydration element "product-card" with a different constructor/,
    );
  });

  it("ignores modules without hydratable exports", async () => {
    const { registerHydrationModule } = await import("../packages/ssr/src/hydration.js");
    const registry = createCustomElementsRegistry();
    globalThis.customElements = registry;

    assert.doesNotThrow(() =>
      registerHydrationModule({
        default: {},
        helper() {},
        value: "noop",
      })
    );
    assert.strictEqual(registry.define.mock.calls.length, 0);
  });

  it("accepts async loaders in registerHydrationModules", async () => {
    const { registerHydrationModules } = await import("../packages/ssr/src/hydration.js");
    const registry = createCustomElementsRegistry();
    globalThis.customElements = registry;
    const ProductCard = createHydratableComponent("product-card");
    const ProductImage = createHydratableComponent("product-image");

    await registerHydrationModules([
      async () => ({ ProductCard }),
      { ProductImage },
    ]);

    assert.strictEqual(registry.get("product-card"), ProductCard);
    assert.strictEqual(registry.get("product-image"), ProductImage);
  });

  it("registers modules without depending on document and stays separate from hydration", async () => {
    const {
      registerHydrationModule,
      hydratePage,
    } = await import("../packages/ssr/src/hydration.js");
    const registry = createCustomElementsRegistry();
    globalThis.customElements = registry;
    const ProductCard = createHydratableComponent("product-card");
    const register = vi.fn(async () => {});

    registerHydrationModule({ ProductCard });

    assert.strictEqual(registry.get("product-card"), ProductCard);
    assert.strictEqual(register.mock.calls.length, 0);

    await hydratePage({
      document: { getElementById() { return null; } },
      hydrationData: { version: 1, roots: [], payload: { roots: {}, instances: {} } },
      register,
    });

    assert.strictEqual(register.mock.calls.length, 1);
  });

  it("enables registered pure custom-element roots after registration", async () => {
    const { hydratePage } = await import("../packages/ssr/src/hydration.js");
    const registry = createCustomElementsRegistry();
    const { documentRef, rootElement } = createRootAttributeDocument({
      tagName: "PLAIN-LIT-ROOT",
    });
    const attributes = new Set(["defer-hydration"]);
    rootElement.hasAttribute = (name) => attributes.has(name);
    rootElement.removeAttribute = vi.fn((name) => attributes.delete(name));
    globalThis.customElements = registry;

    class PlainLitRoot {}

    await hydratePage({
      document: documentRef,
      hydrationData: {
        version: 1,
        roots: [{ id: "litsx-root-0", tagName: "plain-lit-root" }],
        payload: { roots: {}, instances: {} },
      },
      register() {
        registry.define("plain-lit-root", PlainLitRoot);
      },
    });

    assert.strictEqual(attributes.has("defer-hydration"), false);
    assert.deepStrictEqual(rootElement.removeAttribute.mock.calls, [
      ["defer-hydration"],
    ]);
  });

  it("recreates a forwarded client ref before custom elements upgrade", async () => {
    const { hydrate, prepareForwardedRefs } = await import("../packages/ssr/src/hydration.js");
    const createElement = (attributes = {}) => ({
      nodeType: 1,
      attributes,
      children: [],
      childNodes: [],
      getAttribute(name) {
        return this.attributes[name] ?? null;
      },
    });
    const target = createElement({ "data-litsx-forwarded-ref-target": "page-context" });
    const consumer = createElement({
      "data-litsx-forwarded-ref-props": JSON.stringify({ contextRef: "page-context" }),
    });
    const root = createElement();
    root.children.push(target, consumer);
    root.childNodes.push(target, consumer);
    const documentRef = {
      nodeType: 9,
      documentElement: root,
      getElementById() { return null; },
    };
    root.ownerDocument = documentRef;
    target.ownerDocument = documentRef;
    consumer.ownerDocument = documentRef;

    prepareForwardedRefs(documentRef);

    assert.ok(consumer.contextRef);
    assert.strictEqual(consumer.contextRef.current, target);

    consumer.contextRef = null;
    await hydrate(documentRef, {
      hydrationData: { version: 1, roots: [], payload: { roots: {}, instances: {} } },
      register() {
        assert.strictEqual(consumer.contextRef.current, target);
      },
    });

    root.children.length = 0;
    root.childNodes.length = 0;
    prepareForwardedRefs(documentRef);
    assert.strictEqual(consumer.contextRef.current, null);
  });

  it("hydrates by bootstrapping roots and loading deduped client imports", async () => {
    const { hydrate } = await import("../packages/ssr/src/hydration.js");
    const calls = [];
    const root = { kind: "document" };
    const ProductCard = createHydratableComponent("product-card");

    const result = await hydrate(root, {
      clientImports: ["/assets/a.js", "", "/assets/b.js", "/assets/a.js", null],
      register: async () => {
        calls.push("register");
      },
      moduleLoader: async (specifier) => {
        calls.push(`import:${specifier}`);
        return specifier === "/assets/a.js" ? { ProductCard } : {};
      },
    });

    assert.strictEqual(result, root);
    assert.deepStrictEqual(calls, [
      "register",
      "import:/assets/a.js",
      "import:/assets/b.js",
    ]);
  });

  it("restores SSR resources synchronously before registration and module imports", async () => {
    const { hydrate } = await import("../packages/ssr/src/hydration.js");
    const calls = [];
    const cache = new Map();
    const useResource = () => {
      useSsrResourceSnapshot({
        key: "library:i18n",
        capture: () => ({}),
        restore(snapshot) {
          calls.push("restore");
          for (const [key, value] of Object.entries(snapshot)) {
            cache.set(key, value);
          }
        },
      });
      if (!cache.has("home.title")) {
        throw new Error("client resource suspended before restore");
      }
      return cache.get("home.title");
    };

    await hydrate({ kind: "document" }, {
      hydrationData: {
        version: 1,
        roots: [],
        payload: {
          roots: {},
          instances: {},
          resources: { "library:i18n": { "home.title": "Home" } },
        },
      },
      clientImports: ["/feature.js"],
      register() {
        calls.push(`register:${useResource()}`);
        useResource();
      },
      async moduleLoader() {
        calls.push(`import:${useResource()}`);
        return {};
      },
    });

    assert.deepStrictEqual(calls, [
      "restore",
      "register:Home",
      "import:Home",
    ]);
  });

  it("publicly prepares resource snapshots for incremental framework hydration", async () => {
    const { prepareHydrationResources } = await import("../packages/ssr/src/hydration.js");
    const restored = [];

    prepareHydrationResources({
      version: 1,
      roots: [],
      payload: {
        roots: {},
        instances: {},
        resources: { "library:delta": { locale: "es" } },
      },
    });
    useSsrResourceSnapshot({
      key: "library:delta",
      capture: () => null,
      restore(snapshot) {
        restored.push(snapshot);
      },
    });

    assert.deepStrictEqual(restored, [{ locale: "es" }]);
  });

  it("accepts repeated authored resource snapshot registrations", async () => {
    const { prepareHydrationResources } = await import("../packages/ssr/src/hydration.js");
    const restored = [];

    prepareHydrationResources({
      version: 1,
      roots: [],
      payload: {
        roots: {},
        instances: {},
        resources: {
          "library:direct": { value: "direct" },
          "library:compiled": { value: "compiled" },
        },
      },
    });

    useSsrResourceSnapshot({
      key: "library:direct",
      capture: () => null,
      restore(snapshot) {
        restored.push(snapshot.value);
      },
    });
    useSsrResourceSnapshot({
      key: "library:compiled",
      capture: () => null,
      restore(snapshot) {
        restored.push(snapshot.value);
      },
    });

    assert.deepStrictEqual(restored, ["direct", "compiled"]);
  });

  it("makes resources available to hydrateRoot and remains compatible without them", async () => {
    const { hydrate, hydrateRoot } = await import("../packages/ssr/src/hydration.js");
    const { rootElement, documentRef } = createRootAttributeDocument();
    let restored = 0;
    const useResource = () => useSsrResourceSnapshot({
      key: "library:data",
      capture: () => null,
      restore(snapshot) {
        restored += snapshot.value;
      },
    });

    await hydrateRoot(rootElement, {
      rootId: "litsx-root-0",
      hydrationData: {
        version: 1,
        roots: [{ id: "litsx-root-0", tagName: "product-card" }],
        payload: {
          roots: {},
          instances: {},
          resources: { "library:data": { value: 2 } },
        },
      },
      register: useResource,
    });
    useResource();
    assert.strictEqual(restored, 2);

    await hydrate(documentRef, {
      hydrationData: {
        version: 1,
        roots: [],
        payload: { roots: {}, instances: {} },
      },
      register: useResource,
    });
    assert.strictEqual(restored, 2);
  });

  it("reads client imports and hydration data from JSON script tags", async () => {
    const {
      LITSX_CLIENT_IMPORTS_SCRIPT_ID,
      LITSX_HYDRATION_DATA_SCRIPT_ID,
      readClientImports,
      readHydrationData,
    } = await import("../packages/ssr/src/hydration.js");
    const documentRef = {
      getElementById(id) {
        if (id === LITSX_CLIENT_IMPORTS_SCRIPT_ID) {
          return { textContent: JSON.stringify(["/assets/a.js", "/assets/b.js", "/assets/a.js"]) };
        }
        if (id === LITSX_HYDRATION_DATA_SCRIPT_ID) {
          return { textContent: JSON.stringify({ roots: ["app-root"] }) };
        }
        return null;
      },
    };

    assert.deepStrictEqual(readClientImports(documentRef), [
      "/assets/a.js",
      "/assets/b.js",
    ]);
    assert.deepStrictEqual(readHydrationData(documentRef), {
      roots: ["app-root"],
    });
  });

  it("reads the structured root hydration payload emitted by @litsx/ssr", async () => {
    const {
      LITSX_HYDRATION_DATA_SCRIPT_ID,
      readHydrationData,
    } = await import("../packages/ssr/src/hydration.js");
    const payload = {
      version: 1,
      roots: [
        {
          id: "litsx-root-0",
          tagName: "product-card",
          moduleId: "/src/ProductCard.tsx",
        },
      ],
    };
    const documentRef = {
      getElementById(id) {
        if (id === LITSX_HYDRATION_DATA_SCRIPT_ID) {
          return { textContent: JSON.stringify(payload) };
        }
        return null;
      },
    };

    assert.deepStrictEqual(readHydrationData(documentRef), payload);
  });

  it("reads client imports from hydration data when no standalone imports script exists", async () => {
    const { readClientImports } = await import("../packages/ssr/src/hydration.js");

    assert.deepStrictEqual(
      readClientImports(
        {
          getElementById() {
            return null;
          },
        },
        {
          hydrationData: {
            version: 1,
            roots: [],
            clientImports: ["/assets/a.js", "/assets/a.js", "/assets/b.js"],
          },
        },
      ),
      ["/assets/a.js", "/assets/b.js"],
    );
  });

  it("applies root hydration payloads idempotently", async () => {
    const {
      LITSX_HYDRATION_PAYLOAD_PROPERTY,
      applyHydrationPayload,
    } = await import("../packages/ssr/src/hydration.js");
    const element = {};
    const roots = [
      {
        id: "litsx-root-0",
        tagName: "product-card",
        element,
      },
    ];
    const hydrationData = {
      version: 1,
      roots: [{ id: "litsx-root-0", tagName: "product-card" }],
      payload: {
        roots: {
          "litsx-root-0": {
            props: {
              product: {
                name: "Trail Shoe",
              },
            },
          },
        },
        instances: {},
      },
    };

    assert.strictEqual(applyHydrationPayload(roots, hydrationData), roots);
    assert.deepStrictEqual(element[LITSX_HYDRATION_PAYLOAD_PROPERTY], {
      props: {
        product: {
          name: "Trail Shoe",
        },
      },
    });
    assert.strictEqual(applyHydrationPayload(roots, hydrationData), roots);
  });

  it("rejects invalid hydration payload shapes", async () => {
    const { readHydrationPayload } = await import("../packages/ssr/src/hydration.js");

    assert.throws(
      () =>
        readHydrationPayload(null, {
          hydrationData: {
            version: 1,
            roots: [],
            payload: {
              roots: [],
              instances: {},
            },
          },
        }),
      /Invalid LitSX SSR hydration payload/,
    );
  });

  it("rejects malformed hydration JSON and incompatible root metadata", async () => {
    const {
      readHydrationData,
      resolveHydrationRoot,
      resolveHydrationRoots,
    } = await import("../packages/ssr/src/hydration.js");
    const { documentRef } = createRootAttributeDocument();

    assert.throws(
      () => readHydrationData({ getElementById: () => ({ textContent: "{" }) }),
      /Failed to parse LitSX SSR JSON script/,
    );
    assert.throws(
      () => resolveHydrationRoots(documentRef, {
        hydrationData: { roots: [{ id: "missing-root", tagName: "product-card" }] },
      }),
      /Failed to find a LitSX hydration root element/,
    );
    assert.throws(
      () => resolveHydrationRoots(documentRef, {
        hydrationData: { roots: [{ id: "litsx-root-0", tagName: "other-card" }] },
      }),
      /expected <other-card> but found <product-card>/,
    );
    assert.throws(
      () => resolveHydrationRoot(documentRef, "missing-root", {
        hydrationData: { roots: [] },
      }),
      /Hydration metadata did not include root "missing-root"/,
    );
    assert.throws(
      () => resolveHydrationRoot(documentRef, "", { hydrationData: { roots: [] } }),
      /requires a non-empty root id/,
    );
  });

  it("rejects conflicting payloads and hydrateRoot tag mismatches", async () => {
    const {
      applyHydrationPayload,
      hydrateRoot,
      LITSX_HYDRATION_PAYLOAD_PROPERTY,
    } = await import("../packages/ssr/src/hydration.js");
    const { rootElement } = createRootAttributeDocument();
    const roots = [{ id: "litsx-root-0", element: rootElement }];
    const firstPayload = { roots: { "litsx-root-0": { props: { title: "first" } }, }, instances: {} };
    const secondPayload = { roots: { "litsx-root-0": { props: { title: "second" } }, }, instances: {} };

    applyHydrationPayload(roots, { payload: firstPayload });
    assert.strictEqual(rootElement[LITSX_HYDRATION_PAYLOAD_PROPERTY], firstPayload.roots["litsx-root-0"]);
    assert.throws(
      () => applyHydrationPayload(roots, { payload: secondPayload }),
      /has already been applied/,
    );
    await assert.rejects(
      () => hydrateRoot(rootElement, {
        hydrationData: { roots: [{ id: "litsx-root-0", tagName: "other-card" }] },
      }),
      /expected <other-card> but found <product-card>/,
    );
  });

  it("normalizes explicit imports and ignores payloads without root state", async () => {
    const {
      applyHydrationPayload,
      readClientImports,
      readHydrationPayload,
    } = await import("../packages/ssr/src/hydration.js");
    const element = { title: "unchanged" };
    const roots = [{ id: "litsx-root-0", element }];

    assert.deepStrictEqual(readClientImports(null, { imports: "/assets/app.js" }), ["/assets/app.js"]);
    assert.deepStrictEqual(readClientImports(null, { clientImports: ["", 1, "/assets/app.js", "/assets/app.js"] }), ["/assets/app.js"]);
    assert.deepStrictEqual(readHydrationPayload(null, { hydrationData: null }), { roots: {}, instances: {} });
    assert.strictEqual(
      applyHydrationPayload(roots, {
        payload: { roots: {}, instances: {} },
      }),
      roots,
    );
    assert.strictEqual(element.title, "unchanged");
  });

  it("hydrates explicit root ids through ShadowRoot-like hosts and comment markers", async () => {
    const { hydrateRoot, resolveHydrationRoots } = await import("../packages/ssr/src/hydration.js");
    const { rootElement, documentRef } = createRootMarkerDocument({ rootId: "litsx-root-comment" });
    const shadowRoot = { host: rootElement, ownerDocument: documentRef };
    const hydrationData = {
      roots: [{ id: "litsx-root-comment", tagName: "product-card" }],
      payload: { roots: {}, instances: {} },
    };

    assert.deepStrictEqual(
      resolveHydrationRoots(documentRef, { hydrationData }).map((root) => root.id),
      ["litsx-root-comment"],
    );
    assert.strictEqual(
      await hydrateRoot(shadowRoot, { rootId: "litsx-root-comment", hydrationData }),
      rootElement,
    );
  });

  it("upgrades hydrated roots by registering loaded client module exports", async () => {
    const {
      hydrate,
      registerHydrationModule,
      registerHydrationModules,
    } = await import("../packages/ssr/src/hydration.js");
    const registry = createCustomElementsRegistry();
    const ProductCard = createHydratableComponent("product-card");
    const { documentRef, rootElement } = createRootAttributeDocument();
    const calls = [];
    globalThis.customElements = registry;

    await registerHydrationModules(null);
    registerHydrationModule(null);
    const result = await hydrate(documentRef, {
      hydrationData: {
        roots: [{ id: "litsx-root-0", tagName: "product-card" }],
        payload: {
          roots: { "litsx-root-0": { props: { title: "Hydrated" } } },
          instances: {},
        },
      },
      clientImports: ["/assets/product-card.js"],
      register() {
        calls.push("register");
      },
      async moduleLoader(specifier) {
        calls.push(specifier);
        return { ProductCard };
      },
    });

    assert.strictEqual(result[0].element, rootElement);
    assert.strictEqual(rootElement.title, "Hydrated");
    assert.strictEqual(registry.get("product-card"), ProductCard);
    assert.deepStrictEqual(calls, ["register", "/assets/product-card.js"]);
  });

  it("hydrates a document by reading client imports from the default script tag", async () => {
    const {
      hydrateDocument,
      hydratePage,
      LITSX_CLIENT_IMPORTS_SCRIPT_ID,
      LITSX_HYDRATION_DATA_SCRIPT_ID,
    } = await import("../packages/ssr/src/hydration.js");
    const calls = [];
    const { documentRef, rootElement } = createRootAttributeDocument();
    documentRef.getElementById = (id) => {
      if (id === LITSX_CLIENT_IMPORTS_SCRIPT_ID) {
        return { textContent: JSON.stringify(["/assets/a.js", "/assets/a.js", "/assets/b.js"]) };
      }
      if (id === LITSX_HYDRATION_DATA_SCRIPT_ID) {
        return {
          textContent: JSON.stringify({
            version: 1,
            roots: [
              {
                id: "litsx-root-0",
                tagName: "product-card",
                moduleId: "/src/ProductCard.tsx",
              },
            ],
          }),
        };
      }
      return null;
    };

    const result = await hydrateDocument({
      document: documentRef,
      register: async () => {
        calls.push("register");
      },
      moduleLoader: async (specifier) => {
        calls.push(`import:${specifier}`);
      },
    });

    assert.deepStrictEqual(result, [
      {
        id: "litsx-root-0",
        tagName: "product-card",
        moduleId: "/src/ProductCard.tsx",
        element: rootElement,
      },
    ]);
    assert.deepStrictEqual(calls, [
      "register",
      "import:/assets/a.js",
      "import:/assets/b.js",
    ]);

    const pageCalls = [];
    const pageResult = await hydratePage({
      document: documentRef,
      register: async () => {
        pageCalls.push("register");
      },
      moduleLoader: async (specifier) => {
        pageCalls.push(`import:${specifier}`);
      },
    });

    assert.deepStrictEqual(pageResult, result);
    assert.deepStrictEqual(pageCalls, [
      "register",
      "import:/assets/a.js",
      "import:/assets/b.js",
    ]);
  });

  it("resolves and validates hydration roots from the payload", async () => {
    const {
      resolveHydrationRoot,
      resolveHydrationRoots,
    } = await import("../packages/ssr/src/hydration.js");
    const { documentRef, rootElement } = createRootAttributeDocument();

    const roots = resolveHydrationRoots(
      documentRef,
      {
        hydrationData: {
          version: 1,
          roots: [
            {
              id: "litsx-root-0",
              tagName: "product-card",
              moduleId: "/src/ProductCard.tsx",
            },
          ],
        },
      },
    );

    assert.deepStrictEqual(roots, [
      {
        id: "litsx-root-0",
        tagName: "product-card",
        moduleId: "/src/ProductCard.tsx",
        element: rootElement,
      },
    ]);

    assert.deepStrictEqual(
      resolveHydrationRoot(
        documentRef,
        "litsx-root-0",
        {
          hydrationData: {
            version: 1,
            roots: [
              {
                id: "litsx-root-0",
                tagName: "product-card",
                moduleId: "/src/ProductCard.tsx",
              },
            ],
          },
        },
      ),
      {
        id: "litsx-root-0",
        tagName: "product-card",
        moduleId: "/src/ProductCard.tsx",
        element: rootElement,
      },
    );
  });

  it("resolves hydrateRoot ids from LitSX root attributes", async () => {
    const { hydrateRoot } = await import("../packages/ssr/src/hydration.js");
    const { rootElement } = createRootAttributeDocument();

    const result = await hydrateRoot(rootElement, {
      hydrationData: {
        version: 1,
        roots: [{ id: "litsx-root-0", tagName: "product-card" }],
      },
    });

    assert.strictEqual(result, rootElement);
  });

  it("resolves hydrateRoot ids from the preceding LitSX root marker fallback", async () => {
    const { hydrateRoot } = await import("../packages/ssr/src/hydration.js");
    const { rootElement } = createRootMarkerDocument();

    const result = await hydrateRoot(rootElement, {
      hydrationData: {
        version: 1,
        roots: [{ id: "litsx-root-0", tagName: "product-card" }],
      },
    });

    assert.strictEqual(result, rootElement);
  });

  it("requires hydrateRoot targets to have a LitSX root attribute, marker, or explicit root id", async () => {
    const { hydrateRoot } = await import("../packages/ssr/src/hydration.js");

    await assert.rejects(
      () =>
        hydrateRoot(
          {
            tagName: "PRODUCT-CARD",
          },
          {
            hydrationData: {
              version: 1,
              roots: [{ id: "litsx-root-0", tagName: "product-card" }],
            },
          },
        ),
      /requires a root id or an element marked as a LitSX SSR root/,
    );
  });
});
