export interface LitsxSsrContext {
  idPrefix?: string;
}

export interface LitsxHydrationRoot {
  id: string;
  tagName: string;
  moduleId?: string;
}

export interface LitsxHydrationPayload {
  roots: Record<string, unknown>;
  instances: Record<string, {
    rootId: string;
    instanceId: string;
    state: unknown[];
  }>;
}

export interface LitsxHydrationData {
  version: 1;
  roots: LitsxHydrationRoot[];
  payload: LitsxHydrationPayload;
  clientImports?: string[];
}

export interface LitsxSsrMetadata {
  clientImports: string[];
  hydrationData: LitsxHydrationData | null;
  renderClientImports(): string;
  renderClientImportsData(scriptId?: string): string;
  renderModulePreloads(): string;
  renderHydrationData(scriptId?: string): string;
}

export interface LitsxSsrResult extends LitsxSsrMetadata {
  html: string;
}

export interface LitsxSsrStreamResult {
  stream: ReadableStream<string>;
  allReady: Promise<LitsxSsrMetadata>;
}

export declare const LITSX_CLIENT_IMPORTS_SCRIPT_ID: "__LITSX_CLIENT_IMPORTS__";
export declare const LITSX_HYDRATION_DATA_SCRIPT_ID: "__LITSX_HYDRATION__";

/**
 * Render a Lit or LitSX value to HTML using the scoped LitSX SSR runtime.
 */
export declare function renderToString(
  value: unknown,
  options?: {
    context?: LitsxSsrContext;
    assetResolver?: (moduleId: string) => string | null | undefined;
  },
): Promise<LitsxSsrResult>;

/**
 * Render a Lit or LitSX value to a Web Stream using the scoped LitSX SSR runtime.
 */
export declare function renderToStream(
  value: unknown,
  options?: {
    context?: LitsxSsrContext;
    assetResolver?: (moduleId: string) => string | null | undefined;
  },
): Promise<LitsxSsrStreamResult>;
