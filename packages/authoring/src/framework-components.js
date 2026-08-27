const LITSX_CORE_FRAMEWORK_COMPONENTS = new Map([
  ["ErrorBoundary", { lightDom: true }],
  ["SuspenseBoundary", { lightDom: true }],
  ["SuspenseList", { lightDom: true }],
]);

export function isLitsxCoreFrameworkComponentExport(sourceSpecifier, exportName) {
  return (
    sourceSpecifier === "@litsx/core" &&
    LITSX_CORE_FRAMEWORK_COMPONENTS.has(exportName)
  );
}

export function isLitsxCoreLightDomComponentExport(sourceSpecifier, exportName) {
  return (
    sourceSpecifier === "@litsx/core" &&
    LITSX_CORE_FRAMEWORK_COMPONENTS.get(exportName)?.lightDom === true
  );
}
