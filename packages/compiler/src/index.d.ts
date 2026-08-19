export type {
  LitsxDeclarationAnalysis,
  LitsxExportAnalysis,
  LitsxImportAnalysis,
  LitsxJsxReferenceAnalysis,
  LitsxModuleAnalysis,
} from "./authored-input.js";

export type TransformLitsxOptions = {
  filename?: string;
  ssr?: boolean;
  parserPlugins?: string[];
  sourceMaps?: boolean;
  jsxTemplate?: boolean;
  jsxTemplateOptions?: object;
  authoringPlugins?: unknown[];
  outputPlugins?: unknown[];
  requireJsx?: boolean;
  reactCompat?: boolean | {
    transformDependencies?: string[];
    reactKeys?: boolean;
    domMode?: "shadow" | "light";
  };
};

export type LitsxCompilationSession = {
  transform(source: string, options?: TransformLitsxOptions): Promise<TransformLitsxResult>;
  transformSync(source: string, options?: TransformLitsxOptions): TransformLitsxResult;
  invalidate(files?: string[] | null): void;
  dispose(): void;
};

export type TransformLitsxResult = {
  code: string;
  map: object | null;
  metadata: Record<string, unknown>;
};

export type PreparedLitsxAuthoredInput = {
  filename?: string;
  inputAst: object;
  authoredWarnings: unknown[];
  moduleAnalysis: import("./authored-input.js").LitsxModuleAnalysis;
};

export function ensureLitsxParserPlugins(
  filename?: string,
  parserPlugins?: string[],
  options?: { requireJsx?: boolean }
): string[];

export function prepareLitsxAuthoredInput(
  source: string,
  options?: TransformLitsxOptions,
  runtime?: {
    parse: (...args: unknown[]) => object;
    transformFromAstSync: (...args: unknown[]) => { ast?: object } | null | undefined;
  }
): PreparedLitsxAuthoredInput;

export function transformLitsx(
  source: string,
  options?: TransformLitsxOptions
): Promise<TransformLitsxResult>;

export function transformLitsxSync(
  source: string,
  options?: TransformLitsxOptions
): TransformLitsxResult;

export function createLitsxCompilationSession(options?: {
  projectPath?: string;
  transformOptions?: TransformLitsxOptions;
}): LitsxCompilationSession;
