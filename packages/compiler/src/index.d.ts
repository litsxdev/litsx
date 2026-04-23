export type TransformLitsxOptions = {
  filename?: string;
  parserPlugins?: string[];
  sourceMaps?: boolean;
  jsxTemplate?: boolean;
  jsxTemplateOptions?: object;
  babelPlugins?: unknown[];
};

export type TransformLitsxResult = {
  code: string;
  map: object | null;
  metadata: Record<string, unknown>;
};

export function transformLitsx(
  source: string,
  options?: TransformLitsxOptions
): Promise<TransformLitsxResult>;

export function transformLitsxSync(
  source: string,
  options?: TransformLitsxOptions
): TransformLitsxResult;
