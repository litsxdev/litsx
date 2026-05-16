import { isTemplateResult } from "lit/directive-helpers.js";
import { unsafeHTML } from "lit/directives/unsafe-html.js";
import {
  __isLitsxScopedTemplate,
  __isLitsxServerComponentCall,
} from "@litsx/core/elements";
import { renderScopedTemplateWithLitSsr } from "./scoped-rendering.js";

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
