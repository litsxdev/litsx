import {
  createScopedSsrContext,
  renderScopedTemplateWithLitSsr,
} from "@litsx/core/internal/runtime-scoped-ssr";

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

  return {
    html: await renderScopedTemplateWithLitSsr(value, {
      litsxSsrContext: context,
    }),
    clientImports: [...context.clientImports],
  };
}
