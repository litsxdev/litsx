export interface LitsxSsrContext {
  idPrefix?: string;
}

export interface LitsxSsrResult {
  html: string;
  clientImports: string[];
  renderClientImports(): string;
  renderModulePreloads(): string;
}

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
