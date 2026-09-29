import type { LitsxVitePluginOptions } from "@litsx/vite-plugin";
import type { PluginOption } from "vite";
import type {
  LitsxTailwindContext,
  LitsxTailwindIntegrationOptions,
} from "./index.js";

export type LitsxTailwindOptions = {
  litsx?: LitsxVitePluginOptions;
  /** Options passed directly to the official `@tailwindcss/vite` plugin. */
  tailwind?: Record<string, unknown>;
  integration?: LitsxTailwindIntegrationOptions;
};

export declare function withTailwindViteCompiler(
  options?: LitsxVitePluginOptions,
  integration?: LitsxTailwindIntegrationOptions,
  context?: LitsxTailwindContext,
): LitsxVitePluginOptions;
export declare function createTailwindVitePlugins(
  tailwindOptions?: Record<string, unknown>,
  integration?: LitsxTailwindIntegrationOptions,
  context?: LitsxTailwindContext,
): PluginOption[];
export declare function createTailwindVirtualPlugin(
  context: LitsxTailwindContext,
): PluginOption;
export declare function createTailwindPropertyCleanupPlugin(): PluginOption;
export declare function litsxTailwind(
  options?: LitsxTailwindOptions,
): PluginOption[];
export default litsxTailwind;
