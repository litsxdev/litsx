import type { Plugin } from "vite";
import type { TransformLitsxOptions } from "@litsx/compiler";

export type LitsxVitePluginOptions = Omit<TransformLitsxOptions, "filename"> & {
  include?: RegExp | ((id: string) => boolean);
};

export function litsx(options?: LitsxVitePluginOptions): Plugin;

export default litsx;
