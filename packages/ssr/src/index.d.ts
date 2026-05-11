export interface LitsxSsrContext {
  idPrefix?: string;
}

export interface LitsxSsrResult {
  html: string;
  clientImports: string[];
}

export declare function renderToString(
  value: unknown,
  options?: {
    context?: LitsxSsrContext;
    assetResolver?: (moduleId: string) => string | null | undefined;
  },
): Promise<LitsxSsrResult>;
