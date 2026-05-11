import type { Plugin } from "vite";
import type { TransformLitsxOptions } from "@litsx/compiler";

export type LitsxVitePluginOptions = Omit<TransformLitsxOptions, "filename"> & {
  include?: RegExp | ((id: string) => boolean);
};

export interface LitsxViteManifestEntry {
  file?: string;
}

export declare function createLitsxViteAssetResolver(options?: {
  root?: string;
  manifest?: Record<string, LitsxViteManifestEntry> | null;
  base?: string;
}): (moduleId: string) => string | null;

export function litsx(options?: LitsxVitePluginOptions): Plugin;

export default litsx;
