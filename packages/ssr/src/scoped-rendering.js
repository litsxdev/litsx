import { render } from "@lit-labs/ssr/lib/render-with-global-dom-shim.js";
import { LitElementRenderer } from "@lit-labs/ssr/lib/lit-element-renderer.js";
import { ElementRenderer } from "@lit-labs/ssr/lib/element-renderer.js";
import {
  __isLitsxScopedTemplate,
  LITSX_MODULE_ID,
  LITSX_SSR_CONTEXT,
} from "@litsx/core/elements";
import { LitsxContextProviderElement } from "@litsx/core/context";
import { withCurrentSsrCustomElementInstanceStack } from "./ssr-state.js";

const scopedRegistryStack = [];
const scopedSsrContextStack = [];

function getScopedElements(ctor) {
  return ctor?.elements ?? ctor?.scopedElements ?? null;
}

function ensureSsrElementShape(element) {
  if (element && typeof element.getRootNode !== "function") {
    element.getRootNode = function getRootNode() {
      return this.__host?.shadowRoot ?? null;
    };
  }
}

async function collectRenderResult(result) {
  let output = "";

  for await (const chunk of result) {
    output += chunk;
  }

  return output;
}

export function createScopedSsrContext(options = {}) {
  return {
    idPrefix: options.idPrefix ?? "litsx",
    assetResolver:
      typeof options.assetResolver === "function" ? options.assetResolver : null,
    clientImports: new Set(),
    hydrationData: {
      version: 1,
      roots: [],
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
      idPrefix: context.idPrefix,
      currentInstanceId: context.nextInstanceId(),
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

  renderShadow(renderInfo) {
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
  return withScopedCustomElementLookup(async () => {
    const isScopedTemplate = __isLitsxScopedTemplate(value);
    const ssrContext = renderInfo.litsxSsrContext ?? createScopedSsrContext();
    const elementRenderers = [
      ScopedContextProviderRenderer,
      ScopedLitElementRenderer,
      ...(renderInfo.elementRenderers ?? []),
    ].filter((renderer, index, list) => list.indexOf(renderer) === index);
    const customElementInstanceStack = renderInfo.customElementInstanceStack ?? [];

    try {
      scopedSsrContextStack.push(ssrContext);

      if (isScopedTemplate) {
        scopedRegistryStack.push(value.elements);
      }

      return await withCurrentSsrCustomElementInstanceStack(
        customElementInstanceStack,
        () =>
          collectRenderResult(
            render(isScopedTemplate ? value.template : value, {
              ...renderInfo,
              customElementInstanceStack,
              elementRenderers,
            }),
          ),
      );
    } finally {
      if (isScopedTemplate) {
        scopedRegistryStack.pop();
      }
      scopedSsrContextStack.pop();
    }
  });
}
