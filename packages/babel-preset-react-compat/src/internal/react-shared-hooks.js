import {
  createUseRefTransform,
  createUseStateTransform,
} from "../../../babel-plugin-shared-hooks/src/index.js";

export const reactUseState = createUseStateTransform({
  importSource: "react",
  hookName: "useState",
  pluginName: "transform-react-usestate",
  allowEventAttributeOptionKey: "allowReactAttributes",
});

export const reactUseRef = createUseRefTransform({
  importSource: "react",
  hookName: "useRef",
  pluginName: "transform-react-useref",
  pendingPropertyKey: "_litsxPendingRefs",
});
