export const LITSX_RUNTIME_MODULE = "@litsx/core";
export const LITSX_CONTEXT_RUNTIME_MODULE = "@litsx/core/context";

export const LITSX_RUNTIME_IMPORT_SOURCES = [
  LITSX_RUNTIME_MODULE,
  LITSX_CONTEXT_RUNTIME_MODULE,
];

export const LITSX_PRESERVED_RUNTIME_IMPORT_SOURCES = [
  LITSX_CONTEXT_RUNTIME_MODULE,
];

export function isLitsxRuntimeImportSource(source) {
  return LITSX_RUNTIME_IMPORT_SOURCES.includes(source);
}

export function isLitsxRuntimeHookName(name) {
  return typeof name === "string" && /^use[A-Z0-9]/.test(name);
}
