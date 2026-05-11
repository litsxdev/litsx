export interface LitsxSsrContext {
  idPrefix?: string;
}

export interface LitsxHydrationRoot {
  id: string;
  tagName: string;
  moduleId?: string;
}

export interface LitsxHydrationData {
  version: 1;
  roots: LitsxHydrationRoot[];
}

export interface LitsxSsrResult {
  html: string;
  clientImports: string[];
  hydrationData: LitsxHydrationData | null;
  renderClientImports(): string;
  renderClientImportsData(scriptId?: string): string;
  renderModulePreloads(): string;
  renderHydrationData(scriptId?: string): string;
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
