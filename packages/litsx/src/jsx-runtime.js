const LITSX_JSX_TYPE = Symbol.for("litsx.jsx");

export const Fragment = Symbol.for("litsx.fragment");

function createJsxNode(type, props, key, metadata = undefined) {
  return {
    $$typeof: LITSX_JSX_TYPE,
    type,
    key: key ?? null,
    props: props ?? {},
    ...(metadata ? { __source: metadata.source, __self: metadata.self } : {}),
  };
}

export function jsx(type, props, key) {
  return createJsxNode(type, props, key);
}

export function jsxs(type, props, key) {
  return createJsxNode(type, props, key);
}

export { LITSX_JSX_TYPE };
