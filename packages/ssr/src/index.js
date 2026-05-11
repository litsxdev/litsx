import {
  createScopedSsrContext,
  renderScopedTemplateWithLitSsr,
} from "@litsx/core/internal/runtime-scoped-ssr";

function escapeHtmlAttribute(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
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

  return {
    html,
    clientImports,
    renderClientImports() {
      return clientImports
        .map((src) => `<script type="module" src="${escapeHtmlAttribute(src)}"></script>`)
        .join("");
    },
    renderModulePreloads() {
      return clientImports
        .map((href) => `<link rel="modulepreload" href="${escapeHtmlAttribute(href)}">`)
        .join("");
    },
  };
}
