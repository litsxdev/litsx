import {
  ContextEvent,
  ContextProvider,
  ContextRoot,
  createContext as createLitContext,
} from "@lit/context";
import { useHost } from "./host-hooks.js";
import { getCurrentSsrCustomElementInstanceStack } from "./runtime-ssr-state.js";

const REACT_CONTEXT_MARK = Symbol("litsx.reactContext");
const REACT_CONTEXT_KEY = Symbol("litsx.reactContext.key");
const HOST_CONTEXT_CONSUMERS = Symbol("litsx.reactContextConsumers");
const CONTEXT_ROOTS = Symbol.for("litsx.contextRoots");
const LitsxContextProviderElementBase = globalThis.HTMLElement ?? class {};

function ensureDocumentContextRoot() {
  const documentRef = globalThis.document;
  if (!documentRef || typeof documentRef.addEventListener !== "function") {
    return null;
  }

  const roots = globalThis[CONTEXT_ROOTS] ??= new WeakMap();
  let root = roots.get(documentRef);
  if (!root) {
    root = new ContextRoot();
    root.attach(documentRef);
    roots.set(documentRef, root);
  }
  return root;
}

class HookContextConsumer {
  constructor(host, context, callback) {
    this.host = host;
    this.context = context;
    this.callback = callback;
    this.provided = false;
    this.value = undefined;
    this.unsubscribe = undefined;
    this.initializing = true;
    this.onValue = (value, unsubscribe) => {
      if (this.unsubscribe && this.unsubscribe !== unsubscribe) {
        this.unsubscribe();
        this.provided = false;
      }

      const changed = !this.provided || !Object.is(this.value, value);
      this.provided = true;
      this.value = value;
      this.unsubscribe = unsubscribe;
      this.callback(value);

      if (!this.initializing && changed) {
        this.host.requestUpdate?.();
      }
    };

    this.host.addController(this);
    this.initializing = false;
  }

  hostConnected() {
    this.host.dispatchEvent(
      new ContextEvent(this.context, this.host, this.onValue, true)
    );
  }

  hostDisconnected() {
    this.unsubscribe?.();
    this.unsubscribe = undefined;
    this.provided = false;
  }
}

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

export function useContext(context) {
  ensureDocumentContextRoot();
  const resolvedHost = useHost();
  const record = getReactContextRecord(
    context,
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
    cache.set(record, entry);
  }

  if (!entry.consumer) {
    entry.consumer = new HookContextConsumer(
      resolvedHost,
      record[REACT_CONTEXT_KEY],
      (value) => {
        entry.provided = true;
        entry.value = value;
      }
    );
  }

  return entry.provided
    ? entry.value
    : record.defaultValue;
}

export function renderContext(context, render) {
  if (typeof render !== "function") {
    throw new TypeError(
      "renderContext requires a function child."
    );
  }

  return render(useContext(context));
}

export class LitsxContextProviderElement extends LitsxContextProviderElementBase {
  static observedAttributes = [];

  constructor() {
    super();
    this._context = undefined;
    this._value = undefined;
    this._provider = null;
    this._connected = false;
    this._providerConnected = false;
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
    this._connectProvider();
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
    ensureDocumentContextRoot();
    this._connected = true;
    this._ensureProvider();
    this._connectProvider();
  }

  disconnectedCallback() {
    this._connected = false;
    if (this._providerConnected) {
      this._provider?.hostDisconnected?.();
      this._providerConnected = false;
    }
  }

  _ensureProvider() {
    if (!this._context) {
      return null;
    }

    if (typeof this.addEventListener !== "function") {
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

    return this._provider;
  }

  _connectProvider() {
    if (!this._connected || !this._provider || this._providerConnected) {
      return;
    }

    this._provider.hostConnected?.();
    this._providerConnected = true;
  }
}
