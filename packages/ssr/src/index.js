import {
  createScopedSsrContext,
  renderScopedTemplateWithLitSsr,
} from "@litsx/core/internal/runtime-scoped-ssr";

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
