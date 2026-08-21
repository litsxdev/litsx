import type { TransformLitsxOptions } from "@litsx/compiler";
import type { UnoGenerator, UserConfig } from "unocss";

export type UnoCssStaticStyleSource =
  | string
  | readonly UnoCssStaticStyleSource[]
  | { readonly [key: string]: UnoCssStaticStyleSource };

declare module "@litsx/core" {
  interface LitsxStyleSourceRegistry {
    unocss: UnoCssStaticStyleSource;
  }
}

export type LitsxUnoCssOptions = {
  placeholder?: string;
  preflightModule?: string;
  lightDomStyles?: TransformLitsxOptions["lightDomStyles"];
};

export declare const UNO_CSS_PLACEHOLDER: "@unocss-placeholder";
export declare const UNO_CSS_PREFLIGHT_MODULE_ID: "virtual:@litsx/unocss/preflight";
export declare const UNO_CSS_PREFLIGHT_EXPORT: "unoPreflightStyles";
/** @internal Build-tool bridge for component-owned guard materialization. */
export declare const UNO_CSS_GUARD_PATTERN: RegExp;
/** @internal Build-tool bridge for component-owned guard materialization. */
export declare function decodeUnoCssGuardPayload(value: string): {
  candidates?: string[];
  descriptor?: {
    file: string;
    exportName?: string;
    localName?: string;
  } | null;
  dependencies?: string[];
  emit?: "component" | "global" | "none";
  moduleCandidates?: boolean;
  scope?: string;
};

export type UnoCssBuildEngineOptions = {
  generator:
    | UnoGenerator
    | Promise<UnoGenerator>
    | (() => UnoGenerator | Promise<UnoGenerator>);
  preflightGenerator?:
    | UnoGenerator
    | Promise<UnoGenerator>
    | (() => UnoGenerator | Promise<UnoGenerator>);
  tokens?: Set<string> | (() => Set<string>);
  ready?: Promise<unknown> | (() => unknown | Promise<unknown>);
  flushTasks?: () => unknown | Promise<unknown>;
  filter?: (code: string, id: string) => boolean;
  extract?: (
    code: string,
    id: string,
    tokens: Set<string>,
  ) => unknown | Promise<unknown>;
};

export type UnoCssModuleResult = {
  code: string;
  map: null;
  dependencies: string[];
};

export interface UnoCssBuildEngine {
  readonly tokens: Set<string>;
  collect(code: string, id?: string): Promise<Set<string>>;
  scan(code: string, id?: string): Promise<Set<string>>;
  materializeModule(
    code: string,
    id: string,
  ): Promise<UnoCssModuleResult | null>;
  captureResolvedConfig(
    config: Record<string, any>,
    options?: { detachPreflights?: boolean },
  ): void;
  generatePreflight(): Promise<string>;
  generateGlobalCss(): Promise<string>;
  createPreflightModuleSource(cssText: string): string;
  finalizePreflight(code: string, placeholder?: string): Promise<string>;
  finalizeGlobalCss(code: string, placeholder?: string): Promise<string>;
  getImporters(file: string): string[];
  invalidate(file: string): string[];
  forgetModule(id: string): void;
  setGenerator(generator: UnoCssBuildEngineOptions["generator"]): void;
  setPreflightGenerator(
    generator: NonNullable<UnoCssBuildEngineOptions["preflightGenerator"]>,
  ): void;
}

/** Create a build-tool-neutral engine around a resolved UnoCSS generator. */
export declare function createUnoCssBuildEngine(
  options: UnoCssBuildEngineOptions,
): UnoCssBuildEngine;

/** Create a standalone engine directly from an ordinary UnoCSS config. */
export declare function createUnoCssIntegration(
  config?: UserConfig,
): Promise<UnoCssBuildEngine>;

export declare function createUnoCssOutputPlugin(
  options?: LitsxUnoCssOptions,
): unknown;

export declare function createUnoCssAuthoringPlugin(
  options?: LitsxUnoCssOptions,
): unknown;

export declare function withUnoCssCompiler(
  options?: TransformLitsxOptions,
  integrationOptions?: LitsxUnoCssOptions,
): TransformLitsxOptions;
