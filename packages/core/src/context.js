import {
  ContextConsumer,
  ContextProvider,
  createContext as createLitContext,
} from "@lit/context";
import { useHost } from "./host-hooks.js";
import { getCurrentSsrCustomElementInstanceStack } from "./runtime-ssr-state.js";

const REACT_CONTEXT_MARK = Symbol("litsx.reactContext");
const REACT_CONTEXT_KEY = Symbol("litsx.reactContext.key");
const HOST_CONTEXT_CONSUMERS = Symbol("litsx.reactContextConsumers");

function createContextSentinel(context, kind) {
  return Object.freeze({
    kind,
    context,
  });
}

function getReactContextRecord(context, callerName) {
  if (!context || typeof context !== "object" || context[REACT_CONTEXT_MARK] !== true) {
    throw new TypeError(
      `${callerName} requires a context created by createContext(...).`
    );
  }

  return context;
}

function getHostContextConsumerCache(host) {
  if (!host[HOST_CONTEXT_CONSUMERS]) {
    host[HOST_CONTEXT_CONSUMERS] = new Map();
  }

  return host[HOST_CONTEXT_CONSUMERS];
}

function getSsrProvidedContextValue(record) {
  const stack = getCurrentSsrCustomElementInstanceStack();
  if (!stack) {
    return null;
  }

  for (let index = stack.length - 1; index >= 0; index -= 1) {
    const element = stack[index]?.element;
    if (!(element instanceof LitsxContextProviderElement)) {
      continue;
    }

    if (element.context === record) {
      return {
        provided: true,
        value: element.value,
      };
    }
  }

  return null;
}

export function createContext(defaultValue) {
  const record = {
    defaultValue,
  };

  Object.defineProperty(record, REACT_CONTEXT_MARK, {
    value: true,
    enumerable: false,
    configurable: false,
  });

  Object.defineProperty(record, REACT_CONTEXT_KEY, {
    value: createLitContext(Symbol("litsx.react-context")),
    enumerable: false,
    configurable: false,
  });

  record.Provider = createContextSentinel(record, "Provider");
  record.Consumer = createContextSentinel(record, "Consumer");

  return Object.freeze(record);
}

export function useContext(hostOrContext, maybeContext) {
  const hasExplicitHost = arguments.length > 1;
  const resolvedHost = hasExplicitHost ? useHost(hostOrContext) : useHost();
  const record = getReactContextRecord(
    hasExplicitHost ? maybeContext : hostOrContext,
    "useContext"
  );
  const ssrValue = getSsrProvidedContextValue(record);
  if (ssrValue) {
    return ssrValue.value;
  }
  const cache = getHostContextConsumerCache(resolvedHost);

  let entry = cache.get(record);
  if (!entry) {
    entry = {
      provided: false,
      value: undefined,
      consumer: null,
    };
    entry.consumer = new ContextConsumer(
      resolvedHost,
      record[REACT_CONTEXT_KEY],
      (value) => {
        entry.provided = true;
        entry.value = value;
      },
      true
    );
    cache.set(record, entry);
  }

  return entry.provided
    ? entry.value
    : record.defaultValue;
}

export function renderContext(host, context, render) {
  if (typeof render !== "function") {
    throw new TypeError(
      "renderContext requires a function child."
    );
  }

  return render(useContext(host, context));
}

export class LitsxContextProviderElement extends HTMLElement {
  constructor() {
    super();
    this._context = undefined;
    this._value = undefined;
    this._provider = null;
    this._connected = false;
  }

  get context() {
    return this._context;
  }

  set context(value) {
    if (value == null) {
      if (this._provider) {
        throw new TypeError(
          "litsx-context-provider requires a context created by createContext(...)."
        );
      }
      this._context = value;
      return;
    }

    const record = getReactContextRecord(value, "litsx-context-provider");
    if (this._context && this._context !== record) {
      throw new TypeError(
        "litsx-context-provider does not allow changing context after initialization."
      );
    }

    this._context = record;
    this._ensureProvider();
  }

  get value() {
    return this._value;
  }

  set value(nextValue) {
    this._value = nextValue;
    if (this._provider) {
      this._provider.setValue(nextValue);
    }
  }

  connectedCallback() {
    this._connected = true;
    const provider = this._ensureProvider();
    provider?.hostConnected?.();
  }

  disconnectedCallback() {
    this._connected = false;
    this._provider?.hostDisconnected?.();
  }

  _ensureProvider() {
    if (!this._context) {
      return null;
    }

    if (!this._provider) {
      this._provider = new ContextProvider(
        this,
        this._context[REACT_CONTEXT_KEY],
        this._value
      );
    }

    this._provider.setValue(this._value);

    if (this._connected) {
      this._provider.hostConnected?.();
    }

    return this._provider;
  }
}
