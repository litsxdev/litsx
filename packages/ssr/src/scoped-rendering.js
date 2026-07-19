import { render } from "@lit-labs/ssr/lib/render-with-global-dom-shim.js";
import { renderValue } from "@lit-labs/ssr/lib/render-value.js";
import { LitElementRenderer } from "@lit-labs/ssr/lib/lit-element-renderer.js";
import { ElementRenderer } from "@lit-labs/ssr/lib/element-renderer.js";
import {
  __isLitsxScopedTemplate,
  LITSX_LIGHT_DOM,
  LITSX_MODULE_ID,
  LITSX_SSR_CONTEXT,
} from "@litsx/core/elements";
import { LitsxContextProviderElement } from "@litsx/core/context";
import { withRendererSsrSuspenseCapture } from "@litsx/core/rendering";
import { withCurrentSsrCustomElementInstanceStack } from "./ssr-state.js";

const scopedRegistryStack = [];
const scopedSsrContextStack = [];

function getScopedElements(ctor) {
  return ctor?.elements ?? ctor?.scopedElements ?? null;
}

function isLightDomElement(ctor) {
  return Boolean(ctor?.[LITSX_LIGHT_DOM]);
}

function ensureSsrElementShape(element) {
  if (!element) {
    return;
  }

  if (typeof element.getRootNode !== "function") {
    element.getRootNode = function getRootNode() {
      return this.__host?.shadowRoot ?? null;
    };
  }

  if (!Array.isArray(element.attributes)) {
    element.attributes = [];
  }

  if (typeof element.getAttribute !== "function") {
    element.getAttribute = function getAttribute(name) {
      const attribute = this.attributes.find((entry) => entry.name === name);
      return attribute ? attribute.value : null;
    };
  }

  if (typeof element.setAttribute !== "function") {
    element.setAttribute = function setAttribute(name, value) {
      const nextValue = String(value);
      const existing = this.attributes.find((entry) => entry.name === name);

      if (existing) {
        existing.value = nextValue;
        return;
      }

      this.attributes.push({
        name,
        value: nextValue,
      });
    };
  }

  if (typeof element.addEventListener !== "function") {
    element.addEventListener = function addEventListener() {};
  }

  if (typeof element.removeEventListener !== "function") {
    element.removeEventListener = function removeEventListener() {};
  }
}

export async function collectRenderResult(result) {
  let output = "";

  for await (const chunk of result) {
    output += chunk;
  }

  return output;
}

function getRenderIterator(result) {
  if (result && typeof result[Symbol.asyncIterator] === "function") {
    return result[Symbol.asyncIterator]();
  }

  if (result && typeof result[Symbol.iterator] === "function") {
    return result[Symbol.iterator]();
  }

  throw new TypeError("Lit SSR render result is not iterable.");
}

function createScopedRenderIterable(value, renderInfo = {}) {
  const isScopedTemplate = __isLitsxScopedTemplate(value);
  const ssrContext = renderInfo.litsxSsrContext ?? createScopedSsrContext();
  const elementRenderers = [
    ScopedContextProviderRenderer,
    ScopedLitElementRenderer,
    ...(renderInfo.elementRenderers ?? []),
  ].filter((renderer, index, list) => list.indexOf(renderer) === index);
  const customElementInstanceStack = renderInfo.customElementInstanceStack ?? [];

  return (async function* streamScopedChunks() {
    const nativeGet = customElements.get.bind(customElements);
    const descriptor = Object.getOwnPropertyDescriptor(customElements, "get");

    Object.defineProperty(customElements, "get", {
      configurable: true,
      writable: true,
      value(tagName) {
        return resolveScopedConstructor(nativeGet, tagName);
      },
    });

    scopedSsrContextStack.push(ssrContext);
    if (isScopedTemplate) {
      scopedRegistryStack.push(value.elements);
    }

    let iterator;

    try {
      const renderResult = render(isScopedTemplate ? value.template : value, {
        ...renderInfo,
        customElementInstanceStack,
        elementRenderers,
      });
      iterator = getRenderIterator(renderResult);

      while (true) {
        const step = await withCurrentSsrCustomElementInstanceStack(
          customElementInstanceStack,
          () => iterator.next(),
        );

        if (step?.done) {
          break;
        }

        yield step.value;
      }
    } finally {
      try {
        if (iterator && typeof iterator.return === "function") {
          await withCurrentSsrCustomElementInstanceStack(
            customElementInstanceStack,
            () => iterator.return(),
          );
        }
      } finally {
        if (isScopedTemplate) {
          scopedRegistryStack.pop();
        }
        scopedSsrContextStack.pop();

        if (descriptor) {
          Object.defineProperty(customElements, "get", descriptor);
        } else {
          Object.defineProperty(customElements, "get", {
            configurable: true,
            writable: true,
            value: nativeGet,
          });
        }
      }
    }
  })();
}

export async function renderScopedTemplateToChunks(value, renderInfo = {}) {
  return createScopedRenderIterable(value, renderInfo);
}

function createHydrationPayload() {
  return {
    roots: {},
    instances: {},
  };
}

function isPlainSerializableObject(value) {
  if (!value || typeof value !== "object") {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null || Array.isArray(value);
}

function assertSerializable(value, path) {
  if (
    value == null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((entry, index) => assertSerializable(entry, `${path}[${index}]`));
  }

  if (isPlainSerializableObject(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [
        key,
        assertSerializable(entry, `${path}.${key}`),
      ]),
    );
  }

  throw new TypeError(
    `LitSX SSR hydration payload value at "${path}" is not JSON-serializable.`
  );
}

function trySerialize(value, path) {
  try {
    return {
      ok: true,
      value: assertSerializable(value, path),
    };
  } catch {
    return {
      ok: false,
      value: undefined,
    };
  }
}

export function createScopedSsrContext(options = {}) {
  return {
    idPrefix: options.idPrefix ?? "litsx",
    assetResolver:
      typeof options.assetResolver === "function" ? options.assetResolver : null,
    executionContext: options.executionContext ?? null,
    clientImports: new Set(),
    hydrationData: {
      version: 1,
      roots: [],
      payload: createHydrationPayload(),
    },
    instanceCount: 0,
    rootCount: 0,
    nextInstanceId() {
      const nextId = String(this.instanceCount);
      this.instanceCount += 1;
      return nextId;
    },
    nextRootId() {
      const nextId = `${this.idPrefix}-root-${this.rootCount}`;
      this.rootCount += 1;
      return nextId;
    },
    collectClientImport(component) {
      const moduleId = component?.[LITSX_MODULE_ID];
      if (!moduleId) {
        return;
      }

      const resolved = this.assetResolver ? this.assetResolver(moduleId) : moduleId;
      if (resolved) {
        this.clientImports.add(resolved);
      }
    },
    collectHydrationRoot(root) {
      this.hydrationData.roots.push(root);
    },
    collectHydrationRootPayload(rootId, payload) {
      if (!rootId) {
        return;
      }
      this.hydrationData.payload.roots[rootId] = assertSerializable(
        payload,
        `roots.${rootId}`,
      );
    },
    collectHydrationState({ rootId, instanceId, slot, value }) {
      if (!rootId || instanceId == null || slot == null) {
        return;
      }

      const instanceKey = `${rootId}:${instanceId}`;
      const instancePayload = this.hydrationData.payload.instances[instanceKey] ?? {
        rootId,
        instanceId,
        state: [],
      };
      instancePayload.state[slot] = assertSerializable(
        value,
        `instances.${instanceKey}.state.${slot}`,
      );
      this.hydrationData.payload.instances[instanceKey] = instancePayload;
    },
  };
}

export function resolveScopedConstructor(nativeGet, tagName) {
  for (let i = scopedRegistryStack.length - 1; i >= 0; i -= 1) {
    const ctor = scopedRegistryStack[i]?.[tagName];
    if (ctor) {
      return ctor;
    }
  }

  return nativeGet(tagName);
}

export async function withScopedCustomElementLookup(run) {
  const nativeGet = customElements.get.bind(customElements);
  const descriptor = Object.getOwnPropertyDescriptor(customElements, "get");

  Object.defineProperty(customElements, "get", {
    configurable: true,
    writable: true,
    value(tagName) {
      return resolveScopedConstructor(nativeGet, tagName);
    },
  });

  try {
    return await run();
  } finally {
    if (descriptor) {
      Object.defineProperty(customElements, "get", descriptor);
    } else {
      Object.defineProperty(customElements, "get", {
        configurable: true,
        writable: true,
        value: nativeGet,
      });
    }
  }
}

export class ScopedLitElementRenderer extends LitElementRenderer {
  static matchesClass(ctor) {
    return ctor?._$litElement$ === true;
  }

  get shadowRootOptions() {
    if (isLightDomElement(this.element?.constructor)) {
      return undefined;
    }

    return super.shadowRootOptions;
  }

  constructor(tagName) {
    super(tagName);
    ensureSsrElementShape(this.element);
    this.element.constructor.finalize?.();
    const context = scopedSsrContextStack.at(-1) ?? createScopedSsrContext();
    const isHydrationRoot = scopedRegistryStack.length === 1;
    const rootId = isHydrationRoot ? context.nextRootId() : null;
    const moduleId = this.element.constructor?.[LITSX_MODULE_ID] ?? null;

    this.element[LITSX_SSR_CONTEXT] = {
      context,
      executionContext: context.executionContext ?? null,
      idPrefix: context.idPrefix,
      currentInstanceId: context.nextInstanceId(),
      rootId,
    };
    context.collectClientImport(this.element.constructor);

    if (rootId) {
      this.element.setAttribute("data-litsx-root", rootId);
      context.collectHydrationRoot({
        id: rootId,
        tagName,
        ...(moduleId ? { moduleId } : {}),
      });
    }
  }

  setProperty(name, value) {
    super.setProperty(name, value);
    const rootId = this.element?.[LITSX_SSR_CONTEXT]?.rootId;
    if (rootId) {
      const serialized = trySerialize(value, `roots.${rootId}.props.${name}`);
      if (!serialized.ok) {
        return;
      }
      const existing = this.element[LITSX_SSR_CONTEXT].rootPayload ?? {};
      existing.props = {
        ...(existing.props ?? {}),
        [name]: serialized.value,
      };
      this.element[LITSX_SSR_CONTEXT].rootPayload = existing;
    }
  }

  connectedCallback() {
    super.connectedCallback();
    const ssrContext = this.element?.[LITSX_SSR_CONTEXT];
    if (ssrContext?.rootId && ssrContext.rootPayload) {
      ssrContext.context.collectHydrationRootPayload(
        ssrContext.rootId,
        ssrContext.rootPayload,
      );
    }
  }

  renderShadow(renderInfo) {
    if (isLightDomElement(this.element?.constructor)) {
      return undefined;
    }

    const elements = getScopedElements(this.element?.constructor);

    if (!elements || Object.keys(elements).length === 0) {
      return super.renderShadow(renderInfo);
    }

    return [
      () => {
        scopedRegistryStack.push(elements);
        return super.renderShadow(renderInfo);
      },
      () => {
        scopedRegistryStack.pop();
      },
    ];
  }

  renderLight(renderInfo) {
    if (!isLightDomElement(this.element?.constructor)) {
      return super.renderLight(renderInfo);
    }

    const elements = getScopedElements(this.element?.constructor);
    const render = () =>
      withRendererSsrSuspenseCapture(
        this.element?._contentSuspenseCapture ?? null,
        () => renderValue(this.element.render(), renderInfo)
      );

    if (!elements || Object.keys(elements).length === 0) {
      return [render];
    }

    return [
      () => {
        scopedRegistryStack.push(elements);
        return render();
      },
      () => {
        scopedRegistryStack.pop();
      },
    ];
  }
}

class ScopedContextProviderRenderer extends ElementRenderer {
  static matchesClass(ctor) {
    return ctor === LitsxContextProviderElement;
  }

  constructor(tagName) {
    super(tagName);
    this.element = new LitsxContextProviderElement();
    ensureSsrElementShape(this.element);
  }

  connectedCallback() {
    // Context providers should not dispatch context-request events during SSR.
  }
}

export async function renderScopedTemplateWithLitSsr(value, renderInfo = {}) {
  return collectRenderResult(
    await renderScopedTemplateToChunks(value, renderInfo),
  );
}
