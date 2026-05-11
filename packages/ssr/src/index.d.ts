export interface LitsxSsrContext {
  idPrefix?: string;
}

export interface LitsxSsrResult {
  html: string;
}

export declare function renderToString(
  value: unknown,
  options?: {
    context?: LitsxSsrContext;
  },
): Promise<LitsxSsrResult>;
