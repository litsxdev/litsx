import { defineHook } from "@litsx/core";

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
  use(host, key) {
    return host.resourceConnected ? key : `pending:${key}`;
  },
});

export const useScopedResource = defineHook({
  use(_host, key) {
    return useResource(`scope:${key}`);
  },
});
