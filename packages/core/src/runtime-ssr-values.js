import { isTemplateResult } from "lit/directive-helpers.js";
import { unsafeHTML } from "lit/directives/unsafe-html.js";
import {
  __isLitsxScopedTemplate,
  __isLitsxServerComponentCall,
} from "./elements/index.js";
import { renderScopedTemplateWithLitSsr } from "./runtime-scoped-ssr.js";

export const RENDERER_SSR_VALUE_ERROR =
  "SSR renderer props must return a renderable TemplateResult, not a server component call or scoped template.";

export function resolveStrictSyncSsrRenderableValue(value) {
  if (__isLitsxServerComponentCall(value) || __isLitsxScopedTemplate(value)) {
    throw new Error(RENDERER_SSR_VALUE_ERROR);
  }

  if (isTemplateResult(value)) {
    return {
      ...value,
      values: value.values.map((entry) => resolveStrictSyncSsrRenderableValue(entry)),
    };
  }

  if (Array.isArray(value)) {
    return value.map((entry) => resolveStrictSyncSsrRenderableValue(entry));
  }

  return value;
}

export async function resolveNestedSsrValue(value, context) {
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
