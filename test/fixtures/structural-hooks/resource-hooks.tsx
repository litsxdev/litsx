import { defineHook, useHost } from "@litsx/core";

const ResourceMixin = (Base) =>
  class extends Base {
    resourceConnected = false;

    connectedCallback() {
      this.resourceConnected = true;
      return super.connectedCallback?.();
    }
  };

export const useResource = defineHook({
  mixin: ResourceMixin,
  use(key) {
    const host = useHost();
    return host.resourceConnected ? key : `pending:${key}`;
  },
});

export const useScopedResource = defineHook({
  use(key) {
    return useResource(`scope:${key}`);
  },
});
