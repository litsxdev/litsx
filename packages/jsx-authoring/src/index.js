const warned = globalThis.__litsxAuthoringDeprecationWarned === true;
if (!warned && globalThis.process?.env?.LITSX_DISABLE_DEPRECATION_WARNINGS !== "1") {
  globalThis.__litsxAuthoringDeprecationWarned = true;
  console.warn("[@litsx/jsx-authoring] This package name is deprecated. Use @litsx/authoring instead.");
}
export * from "@litsx/authoring";
