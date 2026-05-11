import assert from "assert";
import { beforeEach, describe, it, vi } from "vitest";

describe("@litsx/ssr-client", () => {
  beforeEach(() => {
    vi.resetModules();
  });

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

  it("hydrates a document by reading client imports from the default script tag", async () => {
    const {
      hydrateDocument,
      LITSX_CLIENT_IMPORTS_SCRIPT_ID,
      LITSX_HYDRATION_DATA_SCRIPT_ID,
      LITSX_ROOT_ATTRIBUTE,
    } = await import("../packages/ssr-client/src/index.js");
    const calls = [];
    const rootElement = {
      tagName: "PRODUCT-CARD",
      getAttribute(name) {
        return name === LITSX_ROOT_ATTRIBUTE ? "litsx-root-0" : null;
      },
    };
    const documentRef = {
      getElementById(id) {
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
      },
      querySelector(selector) {
        if (selector === `[${LITSX_ROOT_ATTRIBUTE}="litsx-root-0"]`) {
          return rootElement;
        }
        return null;
      },
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
      LITSX_ROOT_ATTRIBUTE,
      resolveHydrationRoot,
      resolveHydrationRoots,
    } = await import("../packages/ssr-client/src/index.js");
    const rootElement = {
      tagName: "PRODUCT-CARD",
      getAttribute(name) {
        return name === LITSX_ROOT_ATTRIBUTE ? "litsx-root-0" : null;
      },
    };

    const roots = resolveHydrationRoots(
      {
        querySelector(selector) {
          if (selector === `[${LITSX_ROOT_ATTRIBUTE}="litsx-root-0"]`) {
            return rootElement;
          }
          return null;
        },
      },
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
        {
          querySelector(selector) {
            if (selector === `[${LITSX_ROOT_ATTRIBUTE}="litsx-root-0"]`) {
              return rootElement;
            }
            return null;
          },
        },
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

  it("requires hydrateRoot targets to carry the LitSX root marker", async () => {
    const { hydrateRoot } = await import("../packages/ssr-client/src/index.js");

    await assert.rejects(
      () =>
        hydrateRoot(
          {
            getAttribute() {
              return null;
            },
          },
          {
            hydrationData: {
              version: 1,
              roots: [{ id: "litsx-root-0", tagName: "product-card" }],
            },
            querySelector() {
              return null;
            },
            hydrationSupportLoader: async () => {},
          },
        ),
      /requires a root element marked with data-litsx-root/,
    );
  });
});
