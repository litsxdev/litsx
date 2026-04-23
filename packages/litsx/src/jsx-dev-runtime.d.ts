export { Fragment, jsx, jsxs, type JSX, type LitsxComponentProps } from "./jsx-runtime.js";

export declare function jsxDEV(
  type: unknown,
  props: Record<string, unknown> | null,
  key: string | undefined,
  isStaticChildren: boolean,
  source: unknown,
  self: unknown
): import("./index.js").LitsxJsxNode;
