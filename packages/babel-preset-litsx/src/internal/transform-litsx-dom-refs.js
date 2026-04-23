import { createUseRefTransform } from "../../../shared/babel-plugin-shared-hooks/src/index.js";

export default createUseRefTransform({
  importSource: "litsx",
  hookNames: ["useRef"],
  pluginName: "transform-litsx-dom-refs",
  pendingPropertyKey: "_litsxPendingElements",
  onlyManagedDomRefs: true,
});
