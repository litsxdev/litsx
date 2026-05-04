import { html, nothing } from "lit";
import {
  connectLightDomRegistry,
  withLightDomCreationContext,
} from "@litsx/light-dom-registry";

const RENDERER_CONTEXT = Symbol("litsx.rendererContext");
const PROJECTED_RENDERER_HOSTS = Symbol("litsx.projectedRendererHosts");

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

function ensureProjectedHostMap(owner) {
  if (!owner[PROJECTED_RENDERER_HOSTS]) {
    owner[PROJECTED_RENDERER_HOSTS] = new Map();
  }
  return owner[PROJECTED_RENDERER_HOSTS];
}

function ensureProjectedHost(owner, slotName) {
  const documentRef = owner?.ownerDocument ?? globalThis.document;
  if (!documentRef || typeof documentRef.createElement !== "function") {
    return null;
  }

  const hostMap = ensureProjectedHostMap(owner);
  let host = hostMap.get(slotName) ?? null;
  if (host?.isConnected) {
    return host;
  }

  host = documentRef.createElement("div");
  host.slot = slotName;
  host.hidden = true;
  host.style.display = "contents";
  owner.appendChild(host);
  hostMap.set(slotName, host);
  return host;
}

function getContextualElements(context) {
  const ctor = context?.host?.constructor;
  if (!ctor || typeof ctor !== "function") {
    return null;
  }

  const elements = ctor.scopedElements ?? ctor.elements ?? null;
  return elements && typeof elements === "object" ? elements : null;
}

function syncProjectedHostRegistry(host, context) {
  const elements = getContextualElements(context);
  if (!host || !elements) {
    return;
  }

  connectLightDomRegistry(host, elements);
}

export function bindRendererContext(host, renderer, options = {}) {
  if (typeof renderer !== "function") {
    return renderer;
  }

  const contextHost = host && typeof host === "object" ? host : null;
  const creationScope = captureCreationScope(contextHost);
  const projected = Boolean(options?.projected);

  const boundRenderer = (...args) => renderer(...args);
  Object.defineProperty(boundRenderer, RENDERER_CONTEXT, {
    value: {
      host: contextHost,
      creationScope,
      projected,
    },
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
  const value = withLightDomCreationContext(context?.host ?? null, () => renderer(...args));
  return {
    value: value ?? nothing,
    context,
    projected: Boolean(context?.projected),
  };
}

export function renderWithRendererContext(render, container, value, context, options = {}) {
  return withLightDomCreationContext(context?.host ?? null, () =>
    render(value, container, {
      ...options,
      ...(context?.host ? { host: context.host } : {}),
      ...(context?.creationScope ? { creationScope: context.creationScope } : {}),
    }));
}

export function clearProjectedRendererRegion(owner, slotName, render) {
  const host = owner?.[PROJECTED_RENDERER_HOSTS]?.get(slotName) ?? null;
  if (!host) {
    return;
  }

  host.hidden = true;
  render(nothing, host);
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
  renderWithRendererContext(
    render,
    host,
    visible ? rendered?.value ?? nothing : nothing,
    rendered?.context ?? null,
  );
}

export function renderRendererRegion(
  owner,
  slotName,
  rendered,
  {
    render,
    visible = true,
  }
) {
  if (!rendered?.projected) {
    clearProjectedRendererRegion(owner, slotName, render);
    return visible ? rendered?.value ?? nothing : nothing;
  }

  const host = ensureProjectedHost(owner, slotName);
  if (!host) {
    return visible ? rendered?.value ?? nothing : nothing;
  }

  syncProjectedHostRegistry(host, rendered.context);
  host.hidden = !visible;
  renderWithRendererContext(
    render,
    host,
    visible ? rendered.value : nothing,
    rendered.context,
  );

  return visible
    ? html`<slot name="${slotName}"></slot>`
    : nothing;
}
