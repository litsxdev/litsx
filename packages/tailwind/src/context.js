import path from "node:path";

function stableHash(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

export function createTailwindContext(options = {}) {
  const components = new Map();
  const moduleKeys = new Map();
  const listeners = new Set();
  let root = process.cwd();

  return {
    options,
    configure(config) {
      root = config.root;
    },
    get root() {
      return root;
    },
    get entry() {
      const entry = options.entry ?? "tailwindcss";
      return entry.startsWith(".") ? path.resolve(root, entry) : entry;
    },
    get sources() {
      const configured = options.sources ?? ["./src/**/*.{html,js,jsx,ts,tsx}"];
      return configured.map((source) =>
        source.startsWith(".") ? path.resolve(root, source) : source,
      );
    },
    get safelist() {
      return Array.from(new Set(options.safelist ?? []));
    },
    register(filename, owner, payload) {
      const key = stableHash(`${filename}\0${owner ?? "component"}`);
      const previous = components.get(key);
      const serialized = JSON.stringify(payload);
      components.set(key, { ...payload, filename, owner, serialized });
      const keys = moduleKeys.get(filename) ?? new Set();
      keys.add(key);
      moduleKeys.set(filename, keys);
      if (previous && previous.serialized !== serialized) {
        for (const listener of listeners) listener(key);
      }
      return key;
    },
    get(key) {
      return components.get(key) ?? null;
    },
    entries() {
      return [...components.entries()];
    },
    keys(filename) {
      return [...(moduleKeys.get(filename) ?? [])];
    },
    retain(filename, retainedKeys) {
      const retained = new Set(retainedKeys);
      const current = moduleKeys.get(filename) ?? new Set();
      for (const key of current) {
        if (!retained.has(key)) components.delete(key);
      }
      if (retained.size > 0) moduleKeys.set(filename, retained);
      else moduleKeys.delete(filename);
    },
    forget(filename) {
      for (const key of moduleKeys.get(filename) ?? []) components.delete(key);
      moduleKeys.delete(filename);
    },
    clear() {
      components.clear();
      moduleKeys.clear();
    },
    onChange(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
