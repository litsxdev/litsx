export type LitsxImportAnalysis = {
  source: string;
  kind: "value" | "type" | "mixed";
  specifiers: Array<{
    importedName: string | "default" | "*";
    localName: string;
    kind: "value" | "type";
  }>;
};

export type LitsxExportAnalysis = {
  exportName: string;
  localName: string | null;
  kind:
    | "default-object"
    | "named-object"
    | "function"
    | "class"
    | "variable"
    | "re-export"
    | "unknown";
};

export type LitsxDeclarationAnalysis = {
  localName: string;
  kind:
    | "function"
    | "class"
    | "const-object"
    | "const-function"
    | "const-arrow-function"
    | "variable"
    | "unknown";
};

export type LitsxJsxReferenceAnalysis = {
  localName: string;
  tagName: string | null;
  source:
    | "imported-authored-module"
    | "imported-js-module"
    | "local-declaration"
    | "unknown";
  importSource: string | null;
};

export type LitsxModuleAnalysis = {
  imports: LitsxImportAnalysis[];
  exports: LitsxExportAnalysis[];
  declarations: LitsxDeclarationAnalysis[];
  jsxReferences: LitsxJsxReferenceAnalysis[];
};

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
  moduleAnalysis: LitsxModuleAnalysis;
};
