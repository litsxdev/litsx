import {
  createUseRefTransform,
  createUseStateTransform,
} from "@litsx/babel-plugin-shared-hooks";

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
