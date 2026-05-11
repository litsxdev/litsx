import {
  createScopedSsrContext,
  renderScopedTemplateWithLitSsr,
} from "@litsx/core/internal/runtime-scoped-ssr";

export const LITSX_CLIENT_IMPORTS_SCRIPT_ID = "__LITSX_CLIENT_IMPORTS__";
export const LITSX_HYDRATION_DATA_SCRIPT_ID = "__LITSX_HYDRATION__";

function escapeHtmlAttribute(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function escapeJsonScript(value) {
  return JSON.stringify(value)
    .replaceAll("<", "\\u003C")
    .replaceAll(">", "\\u003E")
    .replaceAll("&", "\\u0026");
}

/**
 * Render a Lit or LitSX template to HTML using the scoped SSR runtime.
 *
 * LitSX roots are expected to arrive as scoped templates produced by the
 * SSR root transform, for example from:
 *
 * `renderToString(<ProductCard .product={product} />)`
 *
 * The current MVP returns prerendered HTML plus the deduplicated list of
 * client module imports discovered while resolving scoped LitSX elements.
 */
export async function renderToString(value, options = {}) {
  const context = createScopedSsrContext({
    idPrefix: options.context?.idPrefix,
    assetResolver: options.assetResolver,
  });
  const html = await renderScopedTemplateWithLitSsr(value, {
    litsxSsrContext: context,
  });
  const clientImports = [...context.clientImports];
  const hydrationData = context.hydrationData.roots.length > 0
    ? context.hydrationData
    : null;

  return {
    html,
    clientImports,
    hydrationData,
    renderClientImports() {
      return clientImports
        .map((src) => `<script type="module" src="${escapeHtmlAttribute(src)}"></script>`)
        .join("");
    },
    renderClientImportsData(
      scriptId = LITSX_CLIENT_IMPORTS_SCRIPT_ID,
    ) {
      if (clientImports.length === 0) {
        return "";
      }

      return `<script type="application/json" id="${escapeHtmlAttribute(scriptId)}">${escapeJsonScript(clientImports)}</script>`;
    },
    renderModulePreloads() {
      return clientImports
        .map((href) => `<link rel="modulepreload" href="${escapeHtmlAttribute(href)}">`)
        .join("");
    },
    renderHydrationData(
      scriptId = LITSX_HYDRATION_DATA_SCRIPT_ID,
    ) {
      if (hydrationData == null) {
        return "";
      }

      return `<script type="application/json" id="${escapeHtmlAttribute(scriptId)}">${escapeJsonScript(hydrationData)}</script>`;
    },
  };
}
