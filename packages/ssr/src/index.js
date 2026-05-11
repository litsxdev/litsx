import {
  createScopedSsrContext,
  renderScopedTemplateWithLitSsr,
} from "@litsx/core/internal/runtime-scoped-ssr";
import {
  __isLitsxScopedTemplate,
  __isLitsxServerComponentCall,
} from "@litsx/core/elements";
import { isTemplateResult } from "lit/directive-helpers.js";
import { unsafeHTML } from "lit/directives/unsafe-html.js";

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

async function resolveNestedSsrValue(value, context) {
  const resolvedValue = await value;

  if (__isLitsxServerComponentCall(resolvedValue)) {
    const nextValue = await resolveTopLevelSsrValue(
      resolvedValue.component(resolvedValue.props, context),
      context,
    );

    const html = await renderScopedTemplateWithLitSsr(nextValue, {
      litsxSsrContext: context,
    });
    return unsafeHTML(html);
  }

  if (__isLitsxScopedTemplate(resolvedValue)) {
    const nextValue = await resolveTopLevelSsrValue(resolvedValue, context);
    const html = await renderScopedTemplateWithLitSsr(nextValue, {
      litsxSsrContext: context,
    });
    return unsafeHTML(html);
  }

  if (isTemplateResult(resolvedValue)) {
    const values = await Promise.all(
      resolvedValue.values.map((entry) => resolveNestedSsrValue(entry, context)),
    );
    return {
      ...resolvedValue,
      values,
    };
  }

  if (Array.isArray(resolvedValue)) {
    return Promise.all(
      resolvedValue.map((entry) => resolveNestedSsrValue(entry, context)),
    );
  }

  return resolvedValue;
}

async function resolveTopLevelSsrValue(value, context) {
  const resolvedValue = await value;

  if (__isLitsxServerComponentCall(resolvedValue)) {
    return resolveTopLevelSsrValue(
      resolvedValue.component(resolvedValue.props, context),
      context,
    );
  }

  if (__isLitsxScopedTemplate(resolvedValue)) {
    return {
      ...resolvedValue,
      template: await resolveNestedSsrValue(resolvedValue.template, context),
    };
  }

  if (isTemplateResult(resolvedValue)) {
    const values = await Promise.all(
      resolvedValue.values.map((entry) => resolveNestedSsrValue(entry, context)),
    );
    return {
      ...resolvedValue,
      values,
    };
  }

  if (Array.isArray(resolvedValue)) {
    return Promise.all(
      resolvedValue.map((entry) => resolveTopLevelSsrValue(entry, context)),
    );
  }

  return resolvedValue;
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
  const resolvedValue = await resolveTopLevelSsrValue(value, context);
  const html = await renderScopedTemplateWithLitSsr(resolvedValue, {
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
