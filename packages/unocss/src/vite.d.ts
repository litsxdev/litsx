import type { LitsxVitePluginOptions } from "@litsx/vite-plugin";
import type { VitePluginConfig } from "unocss/vite";
import type { PluginOption } from "vite";
import type { LitsxUnoCssOptions } from "./index.js";

export type LitsxUnoCssViteOptions = {
  litsx?: LitsxVitePluginOptions;
  unocss?: VitePluginConfig;
  integration?: LitsxUnoCssOptions;
};

export declare function createUnoCssVitePlugins(
  options?: VitePluginConfig,
): PluginOption[];

export declare function withUnoCssViteCompiler(
  options?: LitsxVitePluginOptions,
  integrationOptions?: LitsxUnoCssOptions,
): LitsxVitePluginOptions;

export declare function litsxUnoCss(
  options?: LitsxUnoCssViteOptions,
): PluginOption[];

export default litsxUnoCss;
