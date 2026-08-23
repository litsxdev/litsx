export const UNO_CSS_PLACEHOLDER = "@unocss-placeholder";
export const UNO_CSS_COMPONENT_MODULE_MARKER =
  "__LITSX_UNOCSS_COMPONENT_MODULE__";
export const UNO_CSS_DYNAMIC_WILDCARD = "\u0000";
export const UNO_CSS_PREFLIGHT_MODULE_ID = "virtual:@litsx/unocss/preflight";
export const UNO_CSS_PREFLIGHT_EXPORT = "unoPreflightStyles";
export const UNO_CSS_PREFLIGHT_BUILD_PLACEHOLDER =
  "__LITSX_UNOCSS_PREFLIGHT_BUILD_PLACEHOLDER__";

const UNO_CSS_GUARD_PREFIX = "__LITSX_UNOCSS_GUARD_";

export const UNO_CSS_GUARD_PATTERN = new RegExp(
  `/\\*${UNO_CSS_GUARD_PREFIX}([A-Za-z0-9_-]+)__\\*/`,
  "g",
);

export function encodeUnoCssGuardPayload(payload) {
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

export function decodeUnoCssGuardPayload(value) {
  return JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
}

export function createUnoCssGuardMarker(payload) {
  return `/*${UNO_CSS_GUARD_PREFIX}${encodeUnoCssGuardPayload(payload)}__*/`;
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
