import { nothing } from "lit";
import { isTemplateResult } from "lit/directive-helpers.js";
import { render as renderLightDom } from "lit/html.js";
import { Directive, PartType, directive } from "lit/directive.js";
import {
  connectLightDomRegistry,
  withLightDomCreationContext,
} from "@litsx/light-dom-registry";
import {
  __isLitsxScopedTemplate,
  __isLitsxServerComponentCall,
  LITSX_SSR_CONTEXT,
} from "./elements/index.js";
import { getCurrentSsrCustomElementInstanceStack } from "./runtime-ssr-state.js";

/**
 * Rendering helpers used by LitSX transforms when authored JSX passes renderer
 * functions across component boundaries.
 *
 * This module is a public runtime subpath for generated code. It keeps renderer
 * callbacks associated with the host and scoped-registry creation context that
 * produced them, so projected content can render custom elements consistently.
 */

const RENDERER_CONTEXT = Symbol("litsx.rendererContext");
const RENDERER_HOST_INITIALIZED = Symbol("litsx.rendererHostInitialized");
const RENDERER_SSR_VALUE_ERROR =
  "SSR renderer props must return a renderable TemplateResult, not a server component call or scoped template.";

function resolveStrictSyncSsrRenderableValue(value) {
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

// Renderer props remain a synchronous projection mechanism in SSR.
// They may return normal renderable values such as TemplateResult trees,
// but not async server-component calls or scoped-template envelopes.
function resolveRendererSsrValue(value) {
  return resolveStrictSyncSsrRenderableValue(value);
}

function resolveRendererSsrValueWithContext(value, ssrContext) {
  if (!ssrContext) {
    return value;
  }

  if (isTemplateResult(value)) {
    const values = value.values.map((entry) =>
      resolveRendererSsrValueWithContext(entry, ssrContext)
    );
    return {
      ...value,
      values,
    };
  }

  if (Array.isArray(value)) {
    return value.map((entry) => resolveRendererSsrValueWithContext(entry, ssrContext));
  }

  return resolveRendererSsrValue(value);
}

function captureCreationScope(host) {
  if (!host || typeof host !== "object") {
    return null;
  }

  if (host.renderOptions?.creationScope) {
    return host.renderOptions.creationScope;
  }

  if (host.shadowRoot && typeof host.shadowRoot.importNode === "function") {
    return host.shadowRoot;
  }

  return null;
}

function getContextualElements(context) {
  const ctor = context?.host?.constructor;
  if (!ctor || typeof ctor !== "function") {
    return null;
  }

  const elements = ctor.scopedElements ?? ctor.elements ?? null;
  return elements && typeof elements === "object" ? elements : null;
}

function getScopedRegistry(scope) {
  for (const key of ["registry", "customElements", "customElementRegistry"]) {
    const registry = scope?.[key];
    if (
      registry &&
      typeof registry.define === "function" &&
      typeof registry.get === "function"
    ) {
      return registry;
    }
  }

  return null;
}

function assignProjectedHostRegistry(host, registry) {
  for (const key of ["registry", "customElements", "customElementRegistry"]) {
    try {
      host[key] = registry;
    } catch {
      // Some DOM implementations expose readonly scoped registry aliases.
    }
  }
}

function hasExternalScopedRegistry(scope) {
  const registry = getScopedRegistry(scope);
  return Boolean(registry && typeof registry._getDefinition !== "function");
}

function resolveContextCreationScope(context) {
  if (!context?.host) {
    return null;
  }

  if (context.creationScope) {
    return context.creationScope;
  }

  const creationScope = captureCreationScope(context.host);
  if (creationScope) {
    context.creationScope = creationScope;
  }
  return creationScope;
}

function syncProjectedHostRegistry(host, context) {
  const elements = getContextualElements(context);
  if (!host || !elements) {
    return;
  }

  if (context?.projected) {
    connectLightDomRegistry(host, elements);
    return;
  }

  const creationScope = resolveContextCreationScope(context);
  const scopedRegistry = getScopedRegistry(creationScope);
  if (scopedRegistry && hasExternalScopedRegistry(creationScope)) {
    assignProjectedHostRegistry(host, scopedRegistry);
    return;
  }

  connectLightDomRegistry(host, elements);
}

export function bindRendererContext(host, renderer, options = {}) {
  if (typeof renderer !== "function") {
    return renderer;
  }

  const contextHost = host && typeof host === "object" ? host : null;
  const projected = Boolean(options?.projected);
  const context = {
    host: contextHost,
    creationScope: captureCreationScope(contextHost),
    projected,
  };

  const boundRenderer = (...args) => {
    const render = () => renderer(...args);
    const creationScope = resolveContextCreationScope(context);
    if (hasExternalScopedRegistry(creationScope)) {
      return render();
    }
    return withLightDomCreationContext(contextHost, render);
  };
  Object.defineProperty(boundRenderer, RENDERER_CONTEXT, {
    value: context,
    configurable: true,
  });
  return boundRenderer;
}

export function invokeRenderer(renderer, ...args) {
  if (typeof renderer !== "function") {
    return {
      value: nothing,
      context: null,
      projected: false,
    };
  }

  const context = renderer[RENDERER_CONTEXT] ?? null;
  const render = () => renderer(...args);
  const creationScope = resolveContextCreationScope(context);
  const value = !context?.host
    ? render()
    : hasExternalScopedRegistry(creationScope)
      ? render()
      : withLightDomCreationContext(context?.host ?? null, render);
  return {
    value: value ?? nothing,
    context,
    projected: Boolean(context?.projected),
  };
}

export function renderWithRendererContext(render, container, value, context, options = {}) {
  const creationScope = resolveContextCreationScope(context);
  const projectedCreationHost = context?.projected
    ? options.creationContextHost ?? null
    : null;
  const { creationContextHost, ...renderOptions } = options;
  const renderValue = () =>
    render(value, container, {
      ...renderOptions,
      ...(context?.host ? { host: context.host } : {}),
      ...(creationScope && !projectedCreationHost ? { creationScope } : {}),
    });

  return !context?.host
    ? renderValue()
    : projectedCreationHost
      ? withLightDomCreationContext(projectedCreationHost, renderValue)
    : hasExternalScopedRegistry(creationScope)
      ? renderValue()
      : withLightDomCreationContext(context?.host ?? null, renderValue);
}

export function syncRendererHost(
  host,
  rendered,
  {
    render,
    visible = true,
  }
) {
  if (!host || typeof render !== "function") {
    return;
  }

  syncProjectedHostRegistry(host, rendered?.context ?? null);
  host.hidden = !visible;
  if (!visible && !rendered?.context && !host[RENDERER_HOST_INITIALIZED]) {
    return;
  }
  renderWithRendererContext(
    render,
    host,
    visible ? rendered?.value ?? nothing : nothing,
    rendered?.context ?? null,
    { creationContextHost: host },
  );
  host[RENDERER_HOST_INITIALIZED] = true;
}

class RendererCallDirective extends Directive {
  constructor(partInfo) {
    super(partInfo);
    if (partInfo.type !== PartType.CHILD) {
      throw new Error("renderRendererCall can only be used in child expressions");
    }
    this._host = null;
  }

  render() {
    const [renderer, ...args] = arguments;
    const rendered = invokeRenderer(renderer, ...args);
    const currentSsrEntry = getCurrentSsrCustomElementInstanceStack()?.at(-1) ?? null;
    const currentSsrHost = currentSsrEntry?.element ?? currentSsrEntry ?? null;
    const ssrContext = currentSsrHost?.[LITSX_SSR_CONTEXT]?.context ?? null;

    return resolveRendererSsrValueWithContext(rendered.value, ssrContext);
  }

  update(part, [renderer, ...args]) {
    if (!this._host) {
      const documentRef = part?.options?.host?.ownerDocument ?? null;
      if (!documentRef || typeof documentRef.createElement !== "function") {
        return nothing;
      }

      this._host = documentRef.createElement("div");
      if (!this._host || typeof this._host !== "object") {
        return nothing;
      }
      this._host.style ??= {};
      this._host.style.display = "contents";
    }

    const rendered = invokeRenderer(renderer, ...args);
    syncRendererHost(this._host, rendered, {
      render: renderLightDom,
      visible: true,
    });

    return this._host;
  }

  disconnected() {
    if (!this._host) {
      return;
    }

    renderLightDom(nothing, this._host);
  }
}

export const renderRendererCall = directive(RendererCallDirective);
