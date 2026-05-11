import { render } from "@lit-labs/ssr/lib/render-with-global-dom-shim.js";
import { LitElementRenderer } from "@lit-labs/ssr/lib/lit-element-renderer.js";
import {
  __isLitsxScopedTemplate,
  LITSX_SSR_CONTEXT,
} from "./elements/index.js";

const scopedRegistryStack = [];
const scopedSsrContextStack = [];

function getScopedElements(ctor) {
  return ctor?.elements ?? ctor?.scopedElements ?? null;
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
    instanceCount: 0,
    nextInstanceId() {
      const nextId = String(this.instanceCount);
      this.instanceCount += 1;
      return nextId;
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
    const context = scopedSsrContextStack.at(-1) ?? createScopedSsrContext();

    this.element[LITSX_SSR_CONTEXT] = {
      context,
      idPrefix: context.idPrefix,
      currentInstanceId: context.nextInstanceId(),
    };
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

export async function renderScopedTemplateWithLitSsr(value, renderInfo = {}) {
  return withScopedCustomElementLookup(async () => {
    const isScopedTemplate = __isLitsxScopedTemplate(value);
    const ssrContext = renderInfo.litsxSsrContext ?? createScopedSsrContext();
    const elementRenderers = renderInfo.elementRenderers?.includes(
      ScopedLitElementRenderer,
    )
      ? renderInfo.elementRenderers
      : [ScopedLitElementRenderer, ...(renderInfo.elementRenderers ?? [])];

    try {
      scopedSsrContextStack.push(ssrContext);

      if (isScopedTemplate) {
        scopedRegistryStack.push(value.elements);
      }

      return await collectRenderResult(
        render(isScopedTemplate ? value.template : value, {
          ...renderInfo,
          elementRenderers,
        }),
      );
    } finally {
      if (isScopedTemplate) {
        scopedRegistryStack.pop();
      }
      scopedSsrContextStack.pop();
    }
  });
}
