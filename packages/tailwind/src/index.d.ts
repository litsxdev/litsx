import type {
  TransformLitsxOptions,
  TransformLitsxResult,
} from "@litsx/compiler";

export type TailwindStaticStyleSource =
  | string
  | readonly TailwindStaticStyleSource[]
  | { readonly [key: string]: TailwindStaticStyleSource };

declare module "@litsx/core" {
  interface LitsxStyleSourceRegistry {
    tailwind: TailwindStaticStyleSource;
  }
}

export type LitsxTailwindIntegrationOptions = {
  /** Tailwind CSS entry containing the project's theme/config. Defaults to `tailwindcss`. */
  entry?: string;
  /** Files scanned only for shared global Tailwind infrastructure, including lazy modules. */
  sources?: readonly string[];
  /** Finite candidates allowed to satisfy non-finite component class patterns. */
  safelist?: readonly string[];
};

export type LitsxTailwindNeutralOptions = {
  /** Candidate routing and Tailwind CSS entry shared by every host target. */
  integration?: LitsxTailwindIntegrationOptions;
  /** Integration-owned component preflight module output id. */
  preflightOutput?: string;
  /** Integration-owned document stylesheet output id. */
  globalCssOutput?: string;
};

export type LitsxBuildIntegrationOutput = {
  id: string;
  kind: "module" | "style" | "asset";
  content: string | Uint8Array;
  specifier?: string;
  document?: boolean;
};

export type LitsxBuildCompilerOptions = Omit<
  TransformLitsxOptions,
  "filename" | "ssr" | "reactCompat"
> & { reactCompat?: false };

export type LitsxBuildIntegrationContribution =
  Partial<TransformLitsxResult> & {
    dependencies?: string[];
    outputs?: LitsxBuildIntegrationOutput[];
  };

export type LitsxBuildIntegration = {
  readonly name: string;
  create(
    context: Readonly<{
      projectRoot: string;
      mode: "development" | "production";
      identity: Readonly<{ id: string }>;
    }>,
  ): Promise<{
    compiler: LitsxBuildCompilerOptions;
    resolveModule(
      context: Readonly<{
        specifier: string;
        importer: string;
        target: "server" | "client";
        ssr: boolean;
        sourceMaps: boolean;
        generation: number;
        mode: "development" | "production";
      }>,
    ): Promise<null | { code: string; dependencies?: string[] }>;
    processModule(
      context: Readonly<{
        result: TransformLitsxResult;
        sourcePath: string;
        source: string;
        target: "server" | "client";
        ssr: boolean;
        sourceMaps: boolean;
        generation: number;
      }>,
    ): Promise<LitsxBuildIntegrationContribution>;
    finalize(): Promise<LitsxBuildIntegrationContribution>;
    invalidate(
      context: Readonly<{
        paths: string[] | null;
        affected: boolean;
        generation: number;
        mode: "development" | "production";
      }>,
    ): Promise<void>;
    forget(context: Readonly<{ moduleId: string }>): void;
    dispose(): void;
  }>;
};

export interface LitsxTailwindContext {
  readonly options: LitsxTailwindIntegrationOptions;
  readonly root: string;
  readonly entry: string;
  readonly sources: readonly string[];
  readonly safelist: readonly string[];
  configure(config: { root: string }): void;
  register(filename: string, owner: string | null, payload: unknown): string;
  get(key: string): any;
  entries(): Array<[string, any]>;
  keys(filename: string): string[];
  retain(filename: string, retainedKeys: readonly string[]): void;
  forget(filename: string): void;
  clear(): void;
  onChange(listener: (key: string) => void): () => void;
}

export declare function createTailwindContext(
  options?: LitsxTailwindIntegrationOptions,
): LitsxTailwindContext;
export declare function createTailwindAuthoringPlugin(
  options?: LitsxTailwindIntegrationOptions,
): unknown;
export declare function createTailwindOutputPlugin(
  context: LitsxTailwindContext,
  options?: LitsxTailwindIntegrationOptions,
): unknown;
export declare function withTailwindCompiler(
  options: TransformLitsxOptions,
  context: LitsxTailwindContext,
  integration?: LitsxTailwindIntegrationOptions,
): TransformLitsxOptions;
export interface TailwindBuildEngine {
  generatePreflight(): Promise<{ css: string; dependencies: string[] }>;
  generateComponent(
    payload: any,
  ): Promise<{ css: string; dependencies: string[] }>;
  generateGlobal(): Promise<{ css: string; dependencies: string[] }>;
  invalidate(): void;
  dispose(): void;
}
export declare function createTailwindBuildEngine(
  context: LitsxTailwindContext,
): TailwindBuildEngine;
/** Single-declaration, build-tool-neutral LitSX integration. */
export declare function litsxTailwind(
  options?: LitsxTailwindNeutralOptions,
): LitsxBuildIntegration;
export declare const TAILWIND_COMPONENT_MODULE_PREFIX: "virtual:@litsx/tailwind/component/";
export declare const TAILWIND_PREFLIGHT_MODULE_ID: "virtual:@litsx/tailwind/preflight.css";
export declare const TAILWIND_INFRASTRUCTURE_MODULE_ID: "virtual:@litsx/tailwind/infrastructure.css";
export default litsxTailwind;
