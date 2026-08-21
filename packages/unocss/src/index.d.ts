import type { TransformLitsxOptions } from "@litsx/compiler";

export type LitsxUnoCssOptions = {
  placeholder?: string;
  preflightModule?: string;
};

export declare const UNO_CSS_PLACEHOLDER: "@unocss-placeholder";
export declare const UNO_CSS_PREFLIGHT_MODULE_ID: "virtual:@litsx/unocss/preflight";
export declare const UNO_CSS_PREFLIGHT_EXPORT: "unoPreflightStyles";

export declare function createUnoCssOutputPlugin(
  options?: LitsxUnoCssOptions,
): unknown;

export declare function withUnoCssCompiler(
  options?: TransformLitsxOptions,
  integrationOptions?: LitsxUnoCssOptions,
): TransformLitsxOptions;
