import type { LitsxVitePluginOptions } from "@litsx/vite-plugin";
import type { VitePluginConfig } from "unocss/vite";
import type { PluginOption } from "vite";
import type { LitsxUnoCssOptions } from "./index.js";

export type LitsxUnoCssViteOptions = {
  litsx?: LitsxVitePluginOptions;
  unocss?: VitePluginConfig;
  integration?: LitsxUnoCssOptions;
};

/** Vite-side UnoCSS plugins. Share integrationOptions with the compiler helper. */
export declare function createUnoCssVitePlugins(
  options?: VitePluginConfig,
  integrationOptions?: LitsxUnoCssOptions,
): PluginOption[];

/** Compiler contribution for split Vite/Storybook setups. */
export declare function withUnoCssViteCompiler(
  options?: LitsxVitePluginOptions,
  integrationOptions?: LitsxUnoCssOptions,
): LitsxVitePluginOptions;

/** Recommended Vite entrypoint; keeps compiler and generator options synchronized. */
export declare function litsxUnoCss(
  options?: LitsxUnoCssViteOptions,
): PluginOption[];

export default litsxUnoCss;
