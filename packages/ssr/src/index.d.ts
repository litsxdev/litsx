export * from "@lit-labs/ssr";
export declare function createDigestRewriter(mappings?: ReadonlyMap<string, string>): {
  write(chunk: string): string;
  end(): string;
};
export declare function render(
  value: unknown,
  renderInfo?: Parameters<typeof import("@lit-labs/ssr").render>[1]
): import("@lit-labs/ssr").RenderResult;
export declare function rewriteRenderResult(
  result: import("@lit-labs/ssr").RenderResult
): import("@lit-labs/ssr").RenderResult;
