export function ensureLitsxParserPlugins(
  filename?: string,
  parserPlugins?: string[],
  options?: { requireJsx?: boolean }
): string[];

export function prepareLitsxAuthoredInput(
  source: string,
  options?: {
    filename?: string;
    parserPlugins?: string[];
    sourceMaps?: boolean;
    authoringPlugins?: unknown[];
    requireJsx?: boolean;
  },
  runtime?: {
    parse: (...args: unknown[]) => object;
    transformFromAstSync?: (...args: unknown[]) => { ast?: object } | null | undefined;
  }
): {
  filename?: string;
  virtualization: {
    code?: string;
    map?: object | null;
  } | null;
  inputAst: object;
  authoredWarnings: unknown[];
};
