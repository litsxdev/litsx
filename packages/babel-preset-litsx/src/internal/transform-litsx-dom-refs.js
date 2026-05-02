import { createUseRefTransform } from "@litsx/babel-plugin-shared-hooks";

export default createUseRefTransform({
  importSource: "litsx",
  hookNames: ["useRef"],
  pluginName: "transform-litsx-dom-refs",
  pendingPropertyKey: "_litsxPendingElements",
  onlyManagedDomRefs: true,
});
