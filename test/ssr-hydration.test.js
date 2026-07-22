import assert from "assert";
import fs from "node:fs";
import path from "node:path";
import { beforeEach, describe, it, vi } from "vitest";
import {
  LITSX_COMPONENT,
  LITSX_HYDRATABLE_TAG,
} from "../packages/core/src/elements/index.js";

describe("@litsx/ssr/hydration", () => {
  beforeEach(() => {
    vi.resetModules();
    delete globalThis.document;
    delete globalThis.customElements;
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
    HydratableComponent[LITSX_COMPONENT] = true;
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

  it("installs Lit hydration support before importing @litsx/core", () => {
    const hydrationSource = fs.readFileSync(
      path.resolve("packages/ssr/src/hydration.js"),
      "utf8",
    );
    const litHydrationImport = 'import "@lit-labs/ssr-client/lit-element-hydrate-support.js";';
    const coreImport = 'import { LITSX_COMPONENT, LITSX_HYDRATABLE_TAG } from "@litsx/core";';

    assert.match(hydrationSource, /@lit-labs\/ssr-client\/lit-element-hydrate-support\.js/);
    assert.match(hydrationSource, /from "@litsx\/core"/);
    assert.ok(
      hydrationSource.indexOf(litHydrationImport) < hydrationSource.indexOf(coreImport),
      "expected Lit hydration support import to come before @litsx/core",
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

  it("hydrates by bootstrapping roots and loading deduped client imports", async () => {
    const { hydrate } = await import("../packages/ssr/src/hydration.js");
    const calls = [];
    const root = { kind: "document" };

    const result = await hydrate(root, {
      clientImports: ["/assets/a.js", "", "/assets/b.js", "/assets/a.js", null],
      register: async () => {
        calls.push("register");
      },
      moduleLoader: async (specifier) => {
        calls.push(`import:${specifier}`);
      },
    });

    assert.strictEqual(result, root);
    assert.deepStrictEqual(calls, [
      "register",
      "import:/assets/a.js",
      "import:/assets/b.js",
    ]);
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
          moduleId: "/src/ProductCard.litsx",
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
                moduleId: "/src/ProductCard.litsx",
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
        moduleId: "/src/ProductCard.litsx",
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
              moduleId: "/src/ProductCard.litsx",
            },
          ],
        },
      },
    );

    assert.deepStrictEqual(roots, [
      {
        id: "litsx-root-0",
        tagName: "product-card",
        moduleId: "/src/ProductCard.litsx",
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
                moduleId: "/src/ProductCard.litsx",
              },
            ],
          },
        },
      ),
      {
        id: "litsx-root-0",
        tagName: "product-card",
        moduleId: "/src/ProductCard.litsx",
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
