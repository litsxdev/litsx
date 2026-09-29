export const TAILWIND_COMPONENT_MODULE_PREFIX =
  "virtual:@litsx/tailwind/component/";
export const TAILWIND_PREFLIGHT_MODULE_ID =
  "virtual:@litsx/tailwind/preflight.css";
export const TAILWIND_INFRASTRUCTURE_MODULE_ID =
  "virtual:@litsx/tailwind/infrastructure.css";
export const TAILWIND_GUARD_PATTERN =
  /__LITSX_TAILWIND_GUARD_([A-Za-z0-9_-]+)__/gu;

function encode(value) {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

export function createTailwindGuardMarker(payload) {
  return `__LITSX_TAILWIND_GUARD_${encode(payload)}__`;
}

export function decodeTailwindGuardPayload(value) {
  return JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
}
