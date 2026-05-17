import {
  createScopedSsrContext,
  renderScopedTemplateWithLitSsr,
} from "./scoped-rendering.js";
import { resolveTopLevelSsrValue } from "./values.js";

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

function createHydrationData(context) {
  if (context.hydrationData.roots.length === 0) {
    return null;
  }

  const data = {
    version: context.hydrationData.version,
    roots: context.hydrationData.roots,
  };
  const payload = context.hydrationData.payload;
  const clientImports = [...context.clientImports];

  Object.defineProperties(data, {
    payload: {
      enumerable: false,
      value: payload,
    },
    clientImports: {
      enumerable: false,
      value: clientImports,
    },
    toJSON: {
      enumerable: false,
      value() {
        return {
          version: data.version,
          roots: data.roots,
          payload,
          clientImports,
        };
      },
    },
  });

  return data;
}

function createSsrResult(html, context) {
  const clientImports = [...context.clientImports];
  const hydrationData = createHydrationData(context);

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

function createSsrContext(options) {
  return createScopedSsrContext({
    idPrefix: options.context?.idPrefix,
    assetResolver: options.assetResolver,
  });
}

async function renderResolvedValue(value, context) {
  const resolvedValue = await resolveTopLevelSsrValue(value, context);
  return renderScopedTemplateWithLitSsr(resolvedValue, {
    litsxSsrContext: context,
  });
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
  const context = createSsrContext(options);
  const html = await renderResolvedValue(value, context);
  return createSsrResult(html, context);
}

export async function renderToStream(value, options = {}) {
  const context = createSsrContext(options);
  let resolveAllReady;
  let rejectAllReady;
  const allReady = new Promise((resolve, reject) => {
    resolveAllReady = resolve;
    rejectAllReady = reject;
  });

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const html = await renderResolvedValue(value, context);
        controller.enqueue(html);
        controller.close();
        const result = createSsrResult(html, context);
        resolveAllReady({
          clientImports: result.clientImports,
          hydrationData: result.hydrationData,
          renderClientImports: result.renderClientImports,
          renderClientImportsData: result.renderClientImportsData,
          renderModulePreloads: result.renderModulePreloads,
          renderHydrationData: result.renderHydrationData,
        });
      } catch (error) {
        controller.error(error);
        rejectAllReady(error);
      }
    },
  });

  return {
    stream,
    allReady,
  };
}
