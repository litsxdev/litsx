import { isTemplateResult } from "lit/directive-helpers.js";
import { unsafeHTML } from "lit/directives/unsafe-html.js";
import {
  __isLitsxScopedTemplate,
  __isLitsxServerComponentCall,
  __litsxScopedTemplate,
} from "@litsx/core/elements";
import { __getLitsxNoscriptFactory } from "@litsx/core";
import { renderScopedTemplateWithLitSsr } from "./scoped-rendering.js";

export async function resolveNestedSsrValue(value, context) {
  const resolvedValue = await value;

  const noscriptRecord = __getLitsxNoscriptFactory(resolvedValue);
  if (noscriptRecord) {
    return context.registerNoscriptFallback(noscriptRecord);
  }

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
    return {
      ...resolvedValue,
      values: await Promise.all(
        resolvedValue.values.map((entry) => resolveNestedSsrValue(entry, context)),
      ),
    };
  }

  if (Array.isArray(resolvedValue)) {
    return Promise.all(
      resolvedValue.map((entry) => resolveNestedSsrValue(entry, context)),
    );
  }

  return resolvedValue;
}

export function makeServerOnlySsrValue(value) {
  if (__isLitsxScopedTemplate(value)) {
    return {
      ...value,
      template: makeServerOnlySsrValue(value.template),
    };
  }

  if (isTemplateResult(value)) {
    return {
      ...value,
      // @lit-labs/ssr uses this internal flag for its server-only `html`
      // templates. It avoids hydration markers without changing parse5's
      // global scripting mode or using an unsafe HTML escape hatch.
      _$litServerRenderMode: 1,
      values: value.values.map((entry) => makeServerOnlySsrValue(entry)),
    };
  }

  if (Array.isArray(value)) {
    return value.map((entry) => makeServerOnlySsrValue(entry));
  }

  return value;
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function stripLitHydrationMarkers(value) {
  // The fallback is deliberately server-only. LitElement render() results are
  // produced lazily by @lit-labs/ssr, after the outer template was lowered,
  // so remove only Lit's generated marker comments at this isolated boundary.
  return value.replaceAll(/<!--\/?lit-part(?: [^>]*)?-->|<!--lit-node \d+-->/g, "");
}

export async function renderNoscriptFallbacks(document, context) {
  let output = document;

  for (const { id, factory, elements } of context.noscriptFallbacks ?? []) {
    const fallbackValue = elements && Object.keys(elements).length > 0
      ? __litsxScopedTemplate(factory(), elements)
      : factory();
    const value = makeServerOnlySsrValue(
      await resolveTopLevelSsrValue(fallbackValue, context),
    );
    const fallbackHtml = stripLitHydrationMarkers(await renderScopedTemplateWithLitSsr(value, {
      litsxSsrContext: context,
      litsxNoscriptFallback: true,
    }));
    const marker = new RegExp(
      `<noscript([^>]*?)\\sdata-litsx-noscript="${escapeRegExp(id)}"([^>]*)><\\/noscript>`,
      "g",
    );

    output = output.replace(marker, (_, before, after) =>
      `<noscript${before}${after}>${fallbackHtml}</noscript>`,
    );
  }

  return output;
}

export async function resolveTopLevelSsrValue(value, context) {
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
    return {
      ...resolvedValue,
      values: await Promise.all(
        resolvedValue.values.map((entry) => resolveNestedSsrValue(entry, context)),
      ),
    };
  }

  if (Array.isArray(resolvedValue)) {
    return Promise.all(
      resolvedValue.map((entry) => resolveTopLevelSsrValue(entry, context)),
    );
  }

  return resolvedValue;
}
