export function interopDefault(module) {
  if (module && typeof module === "object" && "default" in module) {
    const defaultExport = module.default;
    if (defaultExport !== undefined && defaultExport !== null) {
      return defaultExport;
    }
  }
  return module;
}
