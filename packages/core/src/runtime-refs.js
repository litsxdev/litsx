export function assignRef(ref, value) {
  if (!ref) return;
  if (typeof ref === "function") {
    ref(value);
    return;
  }
  if (typeof ref === "object") {
    ref.value = value;
  }
}

export function cleanupRef(ref) {
  assignRef(ref, undefined);
}
