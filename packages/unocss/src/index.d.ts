import type { TransformLitsxOptions, TransformLitsxResult } from "@litsx/compiler";
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
  /** Vite document stylesheet module. Defaults to `virtual:uno.css`; false delegates ownership. */
  globalCssModule?: string | false;
  /** JavaScript module exporting component preflight; false disables that module. */
  preflightModule?: string | false;
  /** Fallback light-DOM output policy; the compiler's explicit option wins. */
  lightDomStyles?: TransformLitsxOptions["lightDomStyles"];
  /** Select which resolved UnoCSS preflight layers belong in each destination. */
  preflightLayers?: Partial<
    Record<"component" | "global", UnoCssPreflightLayerSelector>
  >;
};

export type LitsxUnoCssNeutralOptions = {
  /** Inline UnoCSS config or a config path. Omit to discover uno.config from the host project root. */
  config?: string | UserConfig;
  /** Compiler/preflight routing options shared with the existing engine. */
  integration?: LitsxUnoCssOptions;
  /** Integration-owned module output id. */
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
> & {
  reactCompat?: false;
};

export type LitsxBuildIntegrationContribution = Partial<TransformLitsxResult> & {
  dependencies?: string[];
  outputs?: LitsxBuildIntegrationOutput[];
};

export type LitsxBuildIntegration = {
  readonly name: string;
  create(context: Readonly<{
    projectRoot: string;
    mode: "development" | "production";
    identity: Readonly<{ id: string }>;
  }>): Promise<{
    compiler: LitsxBuildCompilerOptions;
    resolveModule(context: Readonly<{
      specifier: string;
      importer: string;
      target: "server" | "client";
      ssr: boolean;
      sourceMaps: boolean;
      generation: number;
      mode: "development" | "production";
    }>): Promise<null | {
      code: string;
      dependencies?: string[];
    }>;
    processModule(context: Readonly<{
      result: TransformLitsxResult;
      sourcePath: string;
      source: string;
      target: "server" | "client";
      ssr: boolean;
      sourceMaps: boolean;
      generation: number;
    }>): Promise<LitsxBuildIntegrationContribution>;
    finalize(): Promise<LitsxBuildIntegrationContribution>;
    invalidate(context: Readonly<{
      paths: string[] | null;
      affected: boolean;
      generation: number;
      mode: "development" | "production";
    }>): Promise<void>;
    forget(context: Readonly<{ moduleId: string }>): void;
    dispose(): void;
  }>;
};

export type UnoCssPreflightDestination = "component" | "global";
export type UnoCssPreflightLayerContext = {
  /** Current resolved UnoCSS layer name. */
  layer: string;
  /** Output currently being generated. */
  destination: UnoCssPreflightDestination;
  /** All resolved layer names available to the selector. */
  layers: readonly string[];
};
export type UnoCssPreflightLayerSelector =
  readonly string[] | ((context: UnoCssPreflightLayerContext) => boolean);

export declare const UNO_CSS_PREFLIGHT_MODULE_ID: "virtual:@litsx/unocss/preflight";
export declare const UNO_CSS_PREFLIGHT_EXPORT: "unoPreflightStyles";
/** @internal Build-tool bridge for component-owned guard materialization. */
export declare const UNO_CSS_GUARD_PATTERN: RegExp;
/** @internal Build-tool bridge for component-owned guard materialization. */
export declare function decodeUnoCssGuardPayload(value: string): {
  candidates?: string[];
  dynamicPatterns?: string[];
  descriptor?: {
    file: string;
    exportName?: string;
    localName?: string;
  } | null;
  dependencies?: string[];
  staticSources?: Array<{
    file: string;
    expression?: string;
    node?: unknown;
  }>;
  owner?: string | null;
  emit?: "component" | "global" | "none";
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
  /** All candidates, including component-only tokens needed by preflight/theme generation. */
  tokens?: Set<string> | (() => Set<string>);
  /** Candidates whose utility rules belong in document CSS. */
  globalTokens?: Set<string> | (() => Set<string>);
  ready?: Promise<unknown> | (() => unknown | Promise<unknown>);
  flushTasks?: () => unknown | Promise<unknown>;
  filter?: (code: string, id: string) => boolean;
  extract?: (
    code: string,
    id: string,
    tokens: Set<string>,
  ) => unknown | Promise<unknown>;
  preflightLayers?: LitsxUnoCssOptions["preflightLayers"];
};

export type UnoCssModuleResult = {
  code: string;
  map: null;
  dependencies: string[];
};

export interface UnoCssBuildEngine {
  /** All candidates used for token-dependent preflight generation. */
  readonly tokens: Set<string>;
  /** Candidates whose utility rules belong in document CSS. */
  readonly globalTokens: Set<string>;
  /** Extract candidates and contribute them to both token views. */
  collect(code: string, id?: string): Promise<Set<string>>;
  /** Extract candidates; `global: false` keeps their utility rules component-local. */
  scan(
    code: string,
    id?: string,
    options?: { global?: boolean },
  ): Promise<Set<string>>;
  materializeModule(
    code: string,
    id: string,
  ): Promise<UnoCssModuleResult | null>;
  captureResolvedConfig(
    config: Record<string, any>,
    options?: { detachPreflights?: boolean },
  ): void;
  /** Generate the component/shadow-routed preflight. */
  generatePreflight(): Promise<string>;
  /** Generate only the preflight layers routed to a destination. */
  generatePreflightFor(
    destination: UnoCssPreflightDestination,
  ): Promise<string>;
  /** Generate global-routed preflight plus document-owned utility rules. */
  generateGlobalCss(): Promise<string>;
  routeGeneratedResult(
    result: Awaited<ReturnType<UnoGenerator["generate"]>>,
    destination?: UnoCssPreflightDestination,
  ): Promise<Awaited<ReturnType<UnoGenerator["generate"]>>>;
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
  integrationOptions?: Pick<LitsxUnoCssOptions, "preflightLayers">,
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

/**
 * Single-declaration, build-tool-neutral LitSX integration.
 * It does not import Evolit, Vite, or any other host framework.
 */
export declare function litsxUnoCss(
  options?: LitsxUnoCssNeutralOptions,
): LitsxBuildIntegration;
