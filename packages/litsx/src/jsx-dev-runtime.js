import { Fragment, LITSX_JSX_TYPE, jsx, jsxs } from "./jsx-runtime.js";

export { Fragment, LITSX_JSX_TYPE, jsx, jsxs };

export function jsxDEV(type, props, key, _isStaticChildren, source, self) {
  return {
    $$typeof: LITSX_JSX_TYPE,
    type,
    key: key ?? null,
    props: props ?? {},
    __source: source,
    __self: self,
  };
}
