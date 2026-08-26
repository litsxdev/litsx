import type { LitsxSsrAuthoredDocumentOptions } from "@litsx/ssr";
import type { InlineConfig, LogLevel, Plugin, ServerOptions, ViteDevServer } from "vite";
import type { LitsxVitePluginOptions } from "./index.js";

export interface LitsxSsrDevServerOptions extends LitsxSsrAuthoredDocumentOptions {
  host?: string;
  port?: number;
  strictPort?: boolean;
  logLevel?: LogLevel;
  server?: ServerOptions;
  vite?: InlineConfig;
  litsx?: LitsxVitePluginOptions;
  plugins?: Plugin[];
}

/**
 * Create a Vite-backed development server for authored LitSX SSR entrypoints.
 * Importing this subpath requires the optional `@litsx/ssr` peer.
 */
export declare function createSsrDevServer(
  options?: LitsxSsrDevServerOptions,
): Promise<ViteDevServer>;
