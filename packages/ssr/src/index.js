import { renderScopedTemplateWithLitSsr } from "@litsx/core/internal/runtime-scoped-ssr";

export async function renderToString(value, options = {}) {
  return {
    html: await renderScopedTemplateWithLitSsr(value, {
      litsxSsrContext: options.context,
    }),
  };
}
