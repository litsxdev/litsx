import { nothing } from "lit";
import { render as renderLightDom } from "lit/html.js";
import { Directive, PartType, directive } from "lit/directive.js";
import {
  connectLightDomRegistry,
  withLightDomCreationContext,
} from "@litsx/light-dom-registry";

const RENDERER_CONTEXT = Symbol("litsx.rendererContext");

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

  const boundRenderer = (...args) =>
    withLightDomCreationContext(contextHost, () => renderer(...args));
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

class RendererCallDirective extends Directive {
  constructor(partInfo) {
    super(partInfo);
    if (partInfo.type !== PartType.CHILD) {
      throw new Error("renderRendererCall can only be used in child expressions");
    }
    this._host = null;
  }

  render() {
    return nothing;
  }

  update(part, [renderer, ...args]) {
    if (!this._host) {
      const documentRef =
        part?.options?.host?.ownerDocument ??
        globalThis.document;
      if (!documentRef || typeof documentRef.createElement !== "function") {
        return nothing;
      }

      this._host = documentRef.createElement("div");
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
