import assert from "node:assert/strict";
import { describe, it } from "vitest";
import {
  appendToDocumentBody,
  createDefaultDocument,
  createDocumentResult,
  createDocumentTemplateContext,
  createHydrationData,
  createSsrDevErrorDocument,
  createSsrResult,
  escapeHtmlAttribute,
  escapeHtmlText,
  escapeInlineScriptText,
  escapeJsonScript,
  formatSsrConsoleArguments,
  injectMarkupBeforeCloseTag,
  normalizeTagContents,
  renderBootstrapScript,
  renderClientEntryBootstrapScript,
  renderDevTemplateDocument,
  renderHtmlAttributes,
  renderSsrDevConsoleDiagnostics,
} from "../packages/ssr/src/index.js";

function context(overrides = {}) {
  return {
    clientImports: new Set(),
    modulePreloads: new Set(),
    adapterArtifacts: [],
    headTags: [],
    hydrationData: { version: 1, roots: [], payload: { resources: {} } },
    ...overrides,
  };
}

describe("SSR document helper branches", () => {
  it("escapes text, attributes, JSON, inline scripts, and diagnostics", () => {
    assert.equal(escapeHtmlText("<&>"), "&lt;&amp;&gt;");
    assert.equal(escapeHtmlAttribute('"<&>'), "&quot;&lt;&amp;&gt;");
    assert.equal(escapeJsonScript({ value: "<&>" }), '{"value":"\\u003C\\u0026\\u003E"}');
    assert.equal(escapeInlineScriptText("a < b => c"), "a \\u003C b => c");
    assert.match(formatSsrConsoleArguments(["value", { id: 1 }]), /value.*id: 1/);
    assert.equal(renderSsrDevConsoleDiagnostics([]), "");
    const diagnostic = renderSsrDevConsoleDiagnostics([{ method: "warn", args: ["<warning>"] }]);
    assert.match(diagnostic, /\\u003Cwarning>/);
    assert.match(diagnostic, /console\[method\]/);
  });

  it("normalizes content and renders HTML attributes for every value kind", () => {
    assert.equal(normalizeTagContents(null), "");
    assert.equal(normalizeTagContents([null, "", "a", 0, "b"]), "a0b");
    assert.equal(normalizeTagContents(42), "42");
    assert.equal(renderHtmlAttributes(null), "");
    assert.equal(renderHtmlAttributes("bad"), "");
    assert.equal(
      renderHtmlAttributes({ hidden: true, ignored: false, absent: null, title: 'a"&' }),
      ' hidden title="a&quot;&amp;"'
    );
  });

  it("inserts body and close-tag markup only when possible", () => {
    assert.equal(appendToDocumentBody("<body>x</body>", ""), "<body>x</body>");
    assert.equal(appendToDocumentBody("fragment", "!"), "fragment!");
    assert.equal(appendToDocumentBody("<body>x</body>", "!"), "<body>x!</body>");
    assert.equal(injectMarkupBeforeCloseTag("<head></head>", "</head>", ""), "<head></head>");
    assert.equal(injectMarkupBeforeCloseTag("fragment", "</head>", "x"), "fragment");
    assert.equal(injectMarkupBeforeCloseTag("<head></head>", "</head>", "x"), "<head>x\n</head>");
  });

  it("renders bootstrap strings, structured scripts, and client entries", () => {
    assert.equal(renderBootstrapScript(null), "");
    assert.equal(renderBootstrapScript("/entry.js"), '<script type="module" src="/entry.js"></script>');
    assert.equal(
      renderBootstrapScript({ src: "/entry.js", type: "classic", attributes: { async: true } }),
      '<script type="classic" async src="/entry.js"></script>'
    );
    assert.equal(
      renderBootstrapScript({ content: "run()", attributes: { nonce: "x" } }),
      '<script type="module" nonce="x">run()</script>'
    );
    assert.equal(renderBootstrapScript({}), "");
    assert.equal(renderClientEntryBootstrapScript(null), "");
    assert.match(renderClientEntryBootstrapScript("</script>"), /\\u003C\/script>/);
  });

  it("creates empty and serializable hydration payloads", () => {
    assert.equal(createHydrationData(context()), null);
    const source = context({
      clientImports: new Set(["/client.js"]),
      hydrationData: {
        version: 2,
        roots: [{ id: 1 }],
        payload: { resources: { data: { value: 1 } }, extra: true },
      },
    });
    const data = createHydrationData(source);
    assert.deepEqual(data.roots, [{ id: 1 }]);
    assert.equal(data.payload.extra, true);
    assert.deepEqual(data.clientImports, ["/client.js"]);
    assert.deepEqual(JSON.parse(JSON.stringify(data)).clientImports, ["/client.js"]);
  });

  it("creates SSR result renderers for empty and populated metadata", () => {
    let captured = 0;
    const result = createSsrResult("<main />", context({
      captureResourceSnapshots: () => { captured += 1; },
      clientImports: new Set(["/a<&.js"]),
      modulePreloads: ["/preload.js", "/a<&.js"],
      adapterArtifacts: [{ id: 1 }],
      headTags: ["<meta>", "<style></style>"],
      hydrationData: { version: 1, roots: [{ id: "<root>" }], payload: { resources: {} } },
    }));
    assert.equal(captured, 1);
    assert.match(result.renderClientImports(), /a&lt;&amp;\.js/);
    assert.match(result.renderClientImportsData('id"'), /id&quot;/);
    assert.equal((result.renderModulePreloads().match(/modulepreload/g) || []).length, 2);
    assert.equal(result.renderHeadTags(), "<meta><style></style>");
    assert.match(result.renderHydrationData("hydration"), /\\u003Croot/);

    const empty = createSsrResult("", context());
    assert.equal(empty.renderClientImportsData(), "");
    assert.equal(empty.renderHydrationData(), "");
  });

  it("builds document contexts and default documents with option fallbacks", () => {
    const result = createSsrResult("<main>body</main>", context({
      headTags: ["<meta name=runtime>"],
    }));
    const documentContext = createDocumentTemplateContext(result, {
      lang: "es",
      htmlAttributes: { dir: "ltr" },
      bodyAttributes: { class: "page" },
      title: 42,
      head: ["<meta name=user>", null],
      bootstrap: "/boot.js",
    });
    assert.equal(documentContext.lang, "es");
    assert.equal(documentContext.title, "42");
    assert.match(documentContext.defaultDocument, /<html lang="es" dir="ltr">/);
    assert.match(documentContext.defaultDocument, /<body class="page">/);
    assert.match(documentContext.bootstrap, /boot\.js/);

    const minimal = createDefaultDocument({
      htmlAttributes: {}, bodyAttributes: {}, title: "<&>", head: "", modulePreloads: "",
      hydrationScript: "", html: "content", bootstrap: "",
    });
    assert.match(minimal, /<title>&lt;&amp;&gt;<\/title>/);
    assert.deepEqual(createDocumentResult(result, "doc", "boot").document, "doc");
  });

  it("renders development templates across marker and fallback branches", () => {
    const full = renderDevTemplateDocument(
      "<html><head><!--app-title--><!--app-head--></head><body><!--app-html--><!--app-bootstrap--></body></html>",
      { title: "<&>", head: "<meta>", modulePreloads: "<link>", hydrationScript: "<script></script>", html: "<main />", bootstrap: "<boot />" }
    );
    assert.match(full, /&lt;&amp;&gt;/);
    assert.match(full, /<meta>\n<link>\n<script>/);
    assert.match(full, /<main \/><boot \/>/);

    const injected = renderDevTemplateDocument(
      "<html><head></head><body><!--app-html--></body></html>",
      { title: "", head: "", modulePreloads: "", hydrationScript: "", html: "x", bootstrap: "boot" }
    );
    assert.match(injected, /xboot\n<\/body>/);
    assert.throws(
      () => renderDevTemplateDocument("<html></html>", {}),
      /must contain <!--app-html-->/
    );
  });

  it("creates safe error documents from Error and non-Error values", () => {
    assert.match(createSsrDevErrorDocument(new Error("<bad>")), /&lt;bad&gt;/);
    assert.match(createSsrDevErrorDocument("failure"), /failure/);
    const noStack = new Error("message");
    Object.defineProperty(noStack, "stack", { value: "" });
    assert.match(createSsrDevErrorDocument(noStack), /message/);
  });
});
