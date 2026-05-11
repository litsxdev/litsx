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

  it("hydrates a document by reading client imports from the default script tag", async () => {
    const {
      hydrateDocument,
      LITSX_CLIENT_IMPORTS_SCRIPT_ID,
    } = await import("../packages/ssr-client/src/index.js");
    const calls = [];
    const documentRef = {
      getElementById(id) {
        if (id === LITSX_CLIENT_IMPORTS_SCRIPT_ID) {
          return { textContent: JSON.stringify(["/assets/a.js", "/assets/a.js", "/assets/b.js"]) };
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

    assert.strictEqual(result, documentRef);
    assert.deepStrictEqual(calls, [
      "support",
      "register",
      "import:/assets/a.js",
      "import:/assets/b.js",
    ]);
  });
});
