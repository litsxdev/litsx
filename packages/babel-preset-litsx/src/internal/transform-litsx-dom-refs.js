import { createUseRefTransform } from "@litsx/babel-plugin-shared-hooks";

export default createUseRefTransform({
  importSource: "@litsx/core",
  hookNames: ["useRef"],
  pluginName: "transform-litsx-dom-refs",
  pendingPropertyKey: "_litsxPendingElements",
  onlyManagedDomRefs: true,
});
