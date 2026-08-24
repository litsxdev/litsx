import { adoptStyles, nothing } from "lit";
import { isTemplateResult } from "lit/directive-helpers.js";
import { render as renderLightDom } from "lit/html.js";
import { Directive, PartType, directive } from "lit/directive.js";
import {
  createLightDomRegistry,
  upgradeScopedRegistryTree,
  withLightDomCreationContext,
} from "@litsx/scoped-registry-shim";
import {
  __isLitsxScopedTemplate,
  __isLitsxServerComponentCall,
  LITSX_SSR_CONTEXT,
} from "./elements/index.js";
import { withSuspenseCapture } from "./runtime-suspense.js";
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
const RENDERER_MOUNT_HOST = Symbol("litsx.rendererMountHost");
const RENDERER_MOUNT_ROOT = Symbol("litsx.rendererMountRoot");
const RENDERER_MOUNT_ELEMENTS = Symbol("litsx.rendererMountElements");
const RENDERER_SHADOW_CONTAINER = Symbol("litsx.rendererShadowContainer");
const PROJECTED_LIGHT_DOM_ATTRIBUTE = "data-litsx-projected-root";

const RENDERER_SSR_VALUE_ERROR =
  "SSR renderer props must return a renderable TemplateResult, not a server component call or scoped template.";

export function isShadowRootContainer(value) {
  return (
    (typeof ShadowRoot !== "undefined" && value instanceof ShadowRoot) ||
    value?.[RENDERER_SHADOW_CONTAINER] === true
  );
}

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

// Renderer props remain a synchronous projection mechanism in SSR.
// They may return normal renderable values such as TemplateResult trees,
// but not async server-component calls or scoped-template envelopes.
function resolveRendererSsrValue(value) {
  return resolveStrictSyncSsrRenderableValue(value);
}

export function resolveRendererSsrValueWithContext(value, ssrContext) {
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

export function captureCreationScope(host) {
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

export function getContextualElements(context) {
  const ctor = context?.host?.constructor;
  if (!ctor || typeof ctor !== "function") {
    return null;
  }

  const elements = ctor.scopedElements ?? ctor.elements ?? null;
  return elements && typeof elements === "object" ? elements : null;
}

export function getContextualStyles(context) {
  const styles = context?.host?.constructor?.elementStyles;
  return Array.isArray(styles) ? styles : [];
}

export function hasSameElementDefinitions(previousElements, nextElements) {
  const previousEntries = Object.entries(previousElements || {});
  const nextEntries = Object.entries(nextElements || {});
  if (previousEntries.length !== nextEntries.length) {
    return false;
  }

  return nextEntries.every(([tagName, ctor]) => previousElements?.[tagName] === ctor);
}

export function createPlatformScopedRegistry() {
  if (typeof CustomElementRegistry !== "function") {
    return null;
  }

  try {
    return new CustomElementRegistry();
  } catch {
    return null;
  }
}

export function attachRendererShadowRoot(host, registry) {
  if (!registry) {
    return host.attachShadow({ mode: "open" });
  }

  const hasCurrentApi =
    typeof ShadowRoot !== "undefined" &&
    "customElementRegistry" in ShadowRoot.prototype;
  if (hasCurrentApi) {
    return host.attachShadow({ mode: "open", customElementRegistry: registry });
  }

  // The published Web Components polyfill predates the current option name.
  return host.attachShadow({
    mode: "open",
    customElements: registry,
    registry,
  });
}

export function defineScopedElements(registry, elements = {}) {
  for (const [tagName, elementClass] of Object.entries(elements)) {
    if (!tagName || typeof elementClass !== "function") {
      continue;
    }

    const existing = registry.get?.(tagName) ?? null;
    if (existing === elementClass) {
      continue;
    }

    if (existing && existing !== elementClass) {
      throw new Error(
        `Projected renderer host cannot redefine scoped element "${tagName}" with a different constructor.`,
      );
    }

    registry.define(tagName, elementClass);
  }
}

export function assignShadowRootRegistry(shadowRoot, registry) {
  for (const key of ["registry", "customElements", "customElementRegistry"]) {
    try {
      shadowRoot[key] = registry;
    } catch {
      // Ignore readonly experimental aliases.
    }
  }
}

function createRendererMount(host, context) {
  const elements = getContextualElements(context) ?? {};
  const hasScopedElements = Object.keys(elements).length > 0;
  const mountHost = host.ownerDocument.createElement("div");
  mountHost.style.display = "contents";

  let registry = hasScopedElements ? createPlatformScopedRegistry() : null;
  const shadowRoot = attachRendererShadowRoot(mountHost, registry);
  shadowRoot[RENDERER_SHADOW_CONTAINER] = true;

  if (registry) {
    defineScopedElements(registry, elements);
    assignShadowRootRegistry(shadowRoot, registry);
  } else if (hasScopedElements) {
    registry = createLightDomRegistry(shadowRoot, {});
    defineScopedElements(registry, elements);
  }

  adoptStyles(shadowRoot, getContextualStyles(context));

  mountHost[RENDERER_MOUNT_ROOT] = shadowRoot;
  mountHost[RENDERER_MOUNT_ELEMENTS] = { ...elements };
  host.appendChild(mountHost);
  host[RENDERER_MOUNT_HOST] = mountHost;
  return mountHost;
}

function ensureRendererMount(host, context) {
  const elements = getContextualElements(context) ?? {};
  let mountHost = host[RENDERER_MOUNT_HOST] ?? null;

  if (
    mountHost &&
    !hasSameElementDefinitions(mountHost[RENDERER_MOUNT_ELEMENTS], elements)
  ) {
    renderLightDom(nothing, mountHost[RENDERER_MOUNT_ROOT] ?? mountHost);
    mountHost.remove();
    mountHost = null;
    host[RENDERER_MOUNT_HOST] = null;
  }

  if (!mountHost) {
    mountHost = createRendererMount(host, context);
  }

  const shadowRoot = mountHost?.[RENDERER_MOUNT_ROOT] ?? null;
  if (!shadowRoot) {
    return null;
  }

  adoptStyles(shadowRoot, getContextualStyles(context));
  return shadowRoot;
}

function clearRendererMount(host) {
  const mountHost = host?.[RENDERER_MOUNT_HOST] ?? null;
  if (!mountHost) {
    return;
  }

  renderLightDom(nothing, mountHost[RENDERER_MOUNT_ROOT] ?? mountHost);
  mountHost.remove?.();
  host[RENDERER_MOUNT_HOST] = null;
}

export function getScopedRegistry(scope) {
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

export function resolveContextCreationScope(context) {
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

export function hasExternalScopedRegistry(scope) {
  const registry = getScopedRegistry(scope);
  return Boolean(registry && typeof registry._getDefinition !== "function");
}

export function prefersDirectProjectedLightDom(host) {
  return host?.getAttribute?.(PROJECTED_LIGHT_DOM_ATTRIBUTE) === "light";
}

export function shouldUseProjectedLightDom(host, context) {
  if (!context?.projected) {
    return false;
  }

  if (prefersDirectProjectedLightDom(host)) {
    return true;
  }

  return resolveContextCreationScope(context) == null;
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
    if (projected) {
      return render();
    }
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
  if (context?.projected) {
    return {
      value: render() ?? nothing,
      context,
      projected: true,
    };
  }
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

export function resolveRenderedValueForSsr(rendered) {
  if (!rendered) {
    return nothing;
  }

  const currentSsrEntry = getCurrentSsrCustomElementInstanceStack()?.at(-1) ?? null;
  const currentSsrHost = currentSsrEntry?.element ?? currentSsrEntry ?? null;
  const ssrContext = currentSsrHost?.[LITSX_SSR_CONTEXT]?.context ?? null;

  return resolveRendererSsrValueWithContext(rendered.value ?? nothing, ssrContext);
}

export function withRendererSsrSuspenseCapture(capture, render) {
  return withSuspenseCapture(capture ?? null, render);
}

export function renderWithRendererContext(render, container, value, context, options = {}) {
  const resolvedRenderMode = isShadowRootContainer(container) ? "shadow" : "light";

  if (resolvedRenderMode === "shadow") {
    return render(value, container, {
      ...options,
      renderMode: resolvedRenderMode,
      ...(context?.host ? { host: context.host } : {}),
    });
  }

  const creationScope = resolveContextCreationScope(context);
  const projectedCreationHost = context?.projected
    ? options.creationContextHost ?? null
    : null;
  const useExternalCreationScope = hasExternalScopedRegistry(creationScope);
  const { creationContextHost, ...renderOptions } = options;
  const renderValue = () =>
    render(value, container, {
      ...renderOptions,
      renderMode: resolvedRenderMode,
      ...(context?.host ? { host: context.host } : {}),
      ...(creationScope && (!projectedCreationHost || useExternalCreationScope)
        ? { creationScope }
        : {}),
    });

  return !context?.host
    ? renderValue()
    : projectedCreationHost && !useExternalCreationScope
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

  const useProjectedLightDom = shouldUseProjectedLightDom(
    host,
    rendered?.context ?? null,
  );
  const useShadowMount =
    rendered?.context?.projected &&
    !useProjectedLightDom;

  const rendererRoot = useShadowMount
    ? ensureRendererMount(host, rendered?.context ?? null)
    : null;
  if (!useShadowMount) {
    clearRendererMount(host);
  }
  const creationContextHost =
    useProjectedLightDom
      ? rendered?.context?.host ?? host
      : host;
  host.hidden = !visible;
  if (!visible && !rendered?.context && !host[RENDERER_HOST_INITIALIZED]) {
    return;
  }
  renderWithRendererContext(
    render,
    rendererRoot ?? host,
    visible ? rendered?.value ?? nothing : nothing,
    rendered?.context ?? null,
    { creationContextHost },
  );
  const contextualRegistry = rendered?.context?.host?.registry ?? null;
  if (typeof contextualRegistry?._getDefinition === "function") {
    upgradeScopedRegistryTree(rendererRoot ?? host, contextualRegistry);
  }
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
