export type LitsxStorybookCompilerOptions = {
  projectPath?: string;
  parserPlugins?: string[];
  jsxTemplateOptions?: object;
  authoringPlugins?: unknown[];
  outputPlugins?: unknown[];
  requireJsx?: boolean;
};

export type LitsxStorybookConfigOptions = {
  stories?: string[];
  addons?: string[];
  storybook?: {
    experimental_indexers?: (existingIndexers: unknown[]) => Promise<unknown[]> | unknown[];
    viteFinal?: (config: Record<string, unknown>) => Promise<Record<string, unknown>> | Record<string, unknown>;
    [key: string]: unknown;
  };
  compiler?: LitsxStorybookCompilerOptions;
};

export declare const litsxStoriesIndexer: {
  test: RegExp;
  createIndex(
    fileName: string,
    context: { makeTitle: (...args: unknown[]) => unknown }
  ): Promise<unknown>;
};

export declare function litsxStoryRegistrationPlugin(
  options?: LitsxStorybookCompilerOptions
): {
  name: string;
  enforce: "pre";
  transform(source: string, id: string): { code: string; map: null } | null;
};

export declare function withLitsxStorybookViteConfig(
  config?: Record<string, unknown>,
  options?: LitsxStorybookCompilerOptions
): Record<string, unknown>;

export declare function createLitsxStorybookConfig(
  options?: LitsxStorybookConfigOptions
): Record<string, unknown>;
