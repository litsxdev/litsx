export const UNO_CSS_PLACEHOLDER = "@unocss-placeholder";
export const UNO_CSS_PREFLIGHT_MODULE_ID = "virtual:@litsx/unocss/preflight";
export const UNO_CSS_PREFLIGHT_EXPORT = "unoPreflightStyles";
export const UNO_CSS_PREFLIGHT_BUILD_PLACEHOLDER =
  "__LITSX_UNOCSS_PREFLIGHT_BUILD_PLACEHOLDER__";

const GUARD_MARKER_PREFIX = "__LITSX_UNOCSS_GUARD_";

export const UNO_CSS_GUARD_PATTERN = new RegExp(
  `/\\*${GUARD_MARKER_PREFIX}([A-Za-z0-9_-]+)__\\*/`,
  "g",
);

export function encodeUnoCssGuardPayload(payload) {
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

export function decodeUnoCssGuardPayload(value) {
  return JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
}

export function createUnoCssGuardMarker(payload) {
  return `/*${GUARD_MARKER_PREFIX}${encodeUnoCssGuardPayload(payload)}__*/`;
}

export function escapeUnoCssTemplateCss(cssText) {
  return cssText
    .replace(/\\/g, "\\\\")
    .replace(/`/g, "\\`")
    .replace(/\$\{/g, "\\${");
}

export function createUnoCssPreflightModuleSource(cssText) {
  return [
    'import { css } from "@litsx/core";',
    `export const ${UNO_CSS_PREFLIGHT_EXPORT} = css\`${escapeUnoCssTemplateCss(cssText)}\`;`,
  ].join("\n");
}
