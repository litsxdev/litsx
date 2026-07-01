export const LITSX_HOOK = Symbol.for("litsx.hook");

export function isLitsxHook(value) {
  return typeof value === "function" && value[LITSX_HOOK] === true;
}
