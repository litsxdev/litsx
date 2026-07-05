import { defineHook } from "@litsx/core";

export const useResource = defineHook({
  setup(_host, args, _staticState, meta) {
    return {
      key: args[0],
      path: meta.callsitePath,
    };
  },
  use(_host, state, args) {
    state.instance.key = args[0];
    return state.instance.key;
  },
  middlewares: {
    connectedCallback(_host, state, next) {
      state.instance.connected = true;
      return next();
    },
  },
});

export const useScopedResource = defineHook({
  use(_host, _state, args) {
    return useResource(`scope:${args[0]}`);
  },
});
