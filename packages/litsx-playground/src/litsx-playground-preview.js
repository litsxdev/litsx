const playgroundRuntimeUrl = new URL("./playground-runtime.js", import.meta.url).href;
const playgroundLitUrl = new URL("./preview-runtime/lit.js", import.meta.url).href;
const playgroundLitElementUrl =
  new URL("./preview-runtime/lit-element.js", import.meta.url).href;
const playgroundLitHtmlUrl =
  new URL("./preview-runtime/lit-html.js", import.meta.url).href;
const playgroundLitHtmlIsServerUrl =
  new URL("./preview-runtime/lit-html-is-server.js", import.meta.url).href;
const playgroundLitKeyedUrl =
  new URL("./preview-runtime/keyed.js", import.meta.url).href;
const playgroundLitRepeatUrl =
  new URL("./preview-runtime/repeat.js", import.meta.url).href;
const playgroundLitWhenUrl =
  new URL("./preview-runtime/when.js", import.meta.url).href;
const playgroundReactiveElementUrl =
  new URL("./preview-runtime/reactive-element.js", import.meta.url).href;
const scopedElementsModuleUrl =
  "https://cdn.jsdelivr.net/npm/@open-wc/scoped-elements@3.0.6/lit-element.js";
const scopedElementsHtmlElementModuleUrl =
  "https://cdn.jsdelivr.net/npm/@open-wc/scoped-elements@3.0.6/html-element.js";
const dedupeMixinModuleUrl =
  "https://cdn.jsdelivr.net/npm/@open-wc/dedupe-mixin@1.4.0/index.js";
const lightDomRegistryModuleUrl =
  new URL("../../light-dom-registry/src/index.js", import.meta.url).href;
const scopedCustomElementRegistryPolyfillUrl =
  "https://cdn.jsdelivr.net/npm/@webcomponents/scoped-custom-element-registry@0.0.10/scoped-custom-element-registry.min.js";

export const previewRuntimeUrls = {
  lit: playgroundLitUrl,
  litElement: playgroundLitElementUrl,
  litHtml: playgroundLitHtmlUrl,
  litHtmlIsServer: playgroundLitHtmlIsServerUrl,
  litKeyed: playgroundLitKeyedUrl,
  litRepeat: playgroundLitRepeatUrl,
  litWhen: playgroundLitWhenUrl,
  reactiveElement: playgroundReactiveElementUrl,
  litsx: playgroundRuntimeUrl,
  scopedElements: scopedElementsModuleUrl,
  scopedElementsHtmlElement: scopedElementsHtmlElementModuleUrl,
  dedupeMixin: dedupeMixinModuleUrl,
  lightDomRegistry: lightDomRegistryModuleUrl,
  scopedCustomElementRegistryPolyfill: scopedCustomElementRegistryPolyfillUrl,
};

function escapeInlineModuleCode(code) {
  return code.replace(/<\/script/gi, "<\\\\/script");
}

export function currentEmittedOutput(
  compileError,
  compileErrorDetails,
  previewError,
  emittedCode
) {
  if (compileError || previewError) {
    return [compileError, compileErrorDetails, previewError].filter(Boolean).join("\n\n");
  }

  return emittedCode || "";
}

export function createFallbackPreviewDocument(message) {
  return `<!doctype html><html><body style="margin:0;padding:16px;font-family:system-ui;background:#ffffff;color:#b42318;">${
    message || "Compiling..."
  }</body></html>`;
}

export function buildPreviewDocument(
  compiledCode,
  exportName,
  previewTagName,
  previewId
) {
  const moduleCode = escapeInlineModuleCode(compiledCode);

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <script type="importmap">
      {
        "imports": {
          "lit": ${JSON.stringify(previewRuntimeUrls.lit)},
          "lit-element/lit-element.js": ${JSON.stringify(previewRuntimeUrls.litElement)},
          "lit-html": ${JSON.stringify(previewRuntimeUrls.litHtml)},
          "lit-html/is-server.js": ${JSON.stringify(previewRuntimeUrls.litHtmlIsServer)},
          "lit/directives/keyed.js": ${JSON.stringify(previewRuntimeUrls.litKeyed)},
          "lit/directives/repeat.js": ${JSON.stringify(previewRuntimeUrls.litRepeat)},
          "lit/directives/when.js": ${JSON.stringify(previewRuntimeUrls.litWhen)},
          "@lit/reactive-element": ${JSON.stringify(previewRuntimeUrls.reactiveElement)},
          "litsx": ${JSON.stringify(previewRuntimeUrls.litsx)},
          "litsx/context": ${JSON.stringify(previewRuntimeUrls.litsx)},
          "litsx/runtime-infrastructure": ${JSON.stringify(previewRuntimeUrls.litsx)},
          "@litsx/light-dom-registry": ${JSON.stringify(previewRuntimeUrls.lightDomRegistry)},
          "@open-wc/scoped-elements/lit-element.js": ${JSON.stringify(previewRuntimeUrls.scopedElements)},
          "@open-wc/scoped-elements/html-element.js": ${JSON.stringify(previewRuntimeUrls.scopedElementsHtmlElement)},
          "@open-wc/dedupe-mixin": ${JSON.stringify(previewRuntimeUrls.dedupeMixin)},
          "@webcomponents/scoped-custom-element-registry": ${JSON.stringify(previewRuntimeUrls.scopedCustomElementRegistryPolyfill)}
        }
      }
    <\/script>
    <style>
      html, body {
        margin: 0;
        padding: 0;
        min-height: 100%;
        background: #ffffff;
        color: #213547;
        font-family: "IBM Plex Sans", "Segoe UI", sans-serif;
      }
      body {
        padding: 16px;
        box-sizing: border-box;
      }
      #mount-shell {
        display: inline-block;
        vertical-align: top;
        max-width: none;
      }
    </style>
  </head>
  <body>
    <div id="mount-shell"><div id="mount"></div></div>
    <script>
      window.__litsxPlaygroundReportError = (message) => {
        const mount = document.getElementById("mount");
        if (!mount) return;
        mount.innerHTML = "";
        const pre = document.createElement("pre");
        pre.style.margin = "0";
        pre.style.whiteSpace = "pre-wrap";
        pre.style.color = "#b42318";
        pre.textContent = message;
        mount.appendChild(pre);
        window.parent.postMessage(
          {
            type: "litsx-playground-preview-error",
            previewId: ${JSON.stringify(previewId)},
            message,
          },
          "*"
        );
      };

      window.addEventListener("error", (event) => {
        const message =
          event?.error instanceof Error
            ? event.error.message
            : event?.message || "Unknown preview error.";
        window.__litsxPlaygroundReportError(message);
      });

      window.addEventListener("unhandledrejection", (event) => {
        const reason = event?.reason;
        const message = reason instanceof Error ? reason.message : String(reason || "Unhandled preview promise rejection.");
        window.__litsxPlaygroundReportError(message);
      });
    <\/script>
    <script type="module">
// The import map is parsed before this module runs. The browser then resolves
// and links the full ESM graph first, so the scoped registry polyfill's side
// effects are applied before the emitted example module is evaluated.
import "@webcomponents/scoped-custom-element-registry";
${moduleCode}
      const mount = document.getElementById("mount");
      const mountShell = document.getElementById("mount-shell");
      const reportHeight = () => {
        const bodyHeight = document.body ? document.body.scrollHeight : 0;
        const docHeight = document.documentElement ? document.documentElement.scrollHeight : 0;
        const mountHeight = mount ? mount.scrollHeight : 0;
        const height = Math.max(bodyHeight, docHeight, mountHeight);
        window.parent.postMessage(
          {
            type: "litsx-playground-preview-height",
            previewId: ${JSON.stringify(previewId)},
            height
          },
          "*"
        );
      };
      const reportWidth = () => {
        const shellWidth = mountShell
          ? Math.ceil(mountShell.getBoundingClientRect().width)
          : 0;
        const mountWidth = mount ? mount.scrollWidth : 0;
        const width = Math.max(shellWidth, mountWidth);
        window.parent.postMessage(
          {
            type: "litsx-playground-preview-width",
            previewId: ${JSON.stringify(previewId)},
            width
          },
          "*"
        );
      };
      const observeHeight = target => {
        if (!target) return;
        resizeObserver.observe(target);
      };
      const scheduleHeightReports = () => {
        requestAnimationFrame(reportHeight);
        requestAnimationFrame(reportWidth);
        requestAnimationFrame(() => {
          requestAnimationFrame(reportHeight);
          requestAnimationFrame(reportWidth);
        });
        setTimeout(reportHeight, 0);
        setTimeout(reportWidth, 0);
        setTimeout(reportHeight, 120);
        setTimeout(reportWidth, 120);
        setTimeout(reportHeight, 320);
        setTimeout(reportWidth, 320);
      };
      const renderError = (error) => {
        const message = error instanceof Error ? error.message : String(error);
        window.__litsxPlaygroundReportError(message);
        reportHeight();
        reportWidth();
      };

      const resizeObserver = new ResizeObserver(() => {
        reportHeight();
        reportWidth();
      });

      observeHeight(document.body);
      observeHeight(document.documentElement);
      observeHeight(mountShell);
      observeHeight(mount);

      try {
        const Component = typeof ${exportName} !== "undefined" ? ${exportName} : undefined;
        if (!Component) {
          throw new Error("Preview export not found: ${exportName}");
        }
        if (Component.scopedElements && typeof CustomElementRegistry !== "function") {
          throw new Error(
            "Scoped custom element registry polyfill did not load inside the preview iframe."
          );
        }
        if (!customElements.get(${JSON.stringify(previewTagName)})) {
          customElements.define(${JSON.stringify(previewTagName)}, Component);
        }
        const node = document.createElement(${JSON.stringify(previewTagName)});
        mount.appendChild(node);
        observeHeight(node);
        if (node.updateComplete && typeof node.updateComplete.then === "function") {
          node.updateComplete.then(() => {
            scheduleHeightReports();
          });
        }
        scheduleHeightReports();
      } catch (error) {
        renderError(error);
      }
    <\/script>
  </body>
</html>`;
}

export function readPreviewMessage(event, previewId) {
  if (!event?.data || event.data.previewId !== previewId) {
    return null;
  }

  const { type, message, height, width } = event.data || {};

  if (type === "litsx-playground-preview-height") {
    if (typeof height === "number" && Number.isFinite(height)) {
      return {
        type,
        height: Math.max(height, 1),
      };
    }

    return null;
  }

  if (type === "litsx-playground-preview-width") {
    if (typeof width === "number" && Number.isFinite(width)) {
      return {
        type,
        width: Math.max(width, 1),
      };
    }

    return null;
  }

  if (type === "litsx-playground-preview-error") {
    return {
      type,
      message: message || "Unknown preview error.",
    };
  }

  return null;
}
