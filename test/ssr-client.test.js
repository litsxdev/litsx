import assert from "assert";
import { beforeEach, describe, it, vi } from "vitest";

describe("@litsx/ssr-client", () => {
  beforeEach(() => {
    vi.resetModules();
  });

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

  it("installs hydration support only once", async () => {
    const { installHydrationSupport } = await import("../packages/ssr-client/src/index.js");
    const calls = [];
    const loader = vi.fn(async () => {
      calls.push("support");
    });

    await installHydrationSupport(loader);
    await installHydrationSupport(loader);

    assert.deepStrictEqual(calls, ["support"]);
    assert.strictEqual(loader.mock.calls.length, 1);
  });

  it("hydrates by installing support, bootstrapping roots, and loading deduped client imports", async () => {
    const { hydrate } = await import("../packages/ssr-client/src/index.js");
    const calls = [];
    const root = { kind: "document" };

    const result = await hydrate(root, {
      clientImports: ["/assets/a.js", "", "/assets/b.js", "/assets/a.js", null],
      hydrationSupportLoader: async () => {
        calls.push("support");
      },
      register: async () => {
        calls.push("register");
      },
      moduleLoader: async (specifier) => {
        calls.push(`import:${specifier}`);
      },
    });

    assert.strictEqual(result, root);
    assert.deepStrictEqual(calls, [
      "support",
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
    } = await import("../packages/ssr-client/src/index.js");
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
    } = await import("../packages/ssr-client/src/index.js");
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
    const { readClientImports } = await import("../packages/ssr-client/src/index.js");

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
    } = await import("../packages/ssr-client/src/index.js");
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
    const { readHydrationPayload } = await import("../packages/ssr-client/src/index.js");

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
      LITSX_CLIENT_IMPORTS_SCRIPT_ID,
      LITSX_HYDRATION_DATA_SCRIPT_ID,
    } = await import("../packages/ssr-client/src/index.js");
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
      hydrationSupportLoader: async () => {
        calls.push("support");
      },
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
      "support",
      "register",
      "import:/assets/a.js",
      "import:/assets/b.js",
    ]);
  });

  it("resolves and validates hydration roots from the payload", async () => {
    const {
      resolveHydrationRoot,
      resolveHydrationRoots,
    } = await import("../packages/ssr-client/src/index.js");
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
    const { hydrateRoot } = await import("../packages/ssr-client/src/index.js");
    const { rootElement } = createRootAttributeDocument();
    const calls = [];

    const result = await hydrateRoot(rootElement, {
      hydrationData: {
        version: 1,
        roots: [{ id: "litsx-root-0", tagName: "product-card" }],
      },
      hydrationSupportLoader: async () => {
        calls.push("support");
      },
    });

    assert.strictEqual(result, rootElement);
    assert.deepStrictEqual(calls, ["support"]);
  });

  it("resolves hydrateRoot ids from the preceding LitSX root marker fallback", async () => {
    const { hydrateRoot } = await import("../packages/ssr-client/src/index.js");
    const { rootElement } = createRootMarkerDocument();
    const calls = [];

    const result = await hydrateRoot(rootElement, {
      hydrationData: {
        version: 1,
        roots: [{ id: "litsx-root-0", tagName: "product-card" }],
      },
      hydrationSupportLoader: async () => {
        calls.push("support");
      },
    });

    assert.strictEqual(result, rootElement);
    assert.deepStrictEqual(calls, ["support"]);
  });

  it("requires hydrateRoot targets to have a LitSX root attribute, marker, or explicit root id", async () => {
    const { hydrateRoot } = await import("../packages/ssr-client/src/index.js");

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
            hydrationSupportLoader: async () => {},
          },
        ),
      /requires a root id or an element marked as a LitSX SSR root/,
    );
  });
});
