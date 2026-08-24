import type { TransformLitsxOptions } from "@litsx/compiler";

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

export interface LitsxTailwindContext {
  readonly options: LitsxTailwindIntegrationOptions;
  readonly root: string;
  readonly entry: string;
  readonly sources: readonly string[];
  readonly safelist: readonly string[];
  configure(config: { root: string }): void;
  register(filename: string, owner: string | null, payload: unknown): string;
  get(key: string): any;
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
export declare const TAILWIND_COMPONENT_MODULE_PREFIX: "virtual:@litsx/tailwind/component/";
export declare const TAILWIND_PREFLIGHT_MODULE_ID: "virtual:@litsx/tailwind/preflight.css";
export declare const TAILWIND_INFRASTRUCTURE_MODULE_ID: "virtual:@litsx/tailwind/infrastructure.css";
