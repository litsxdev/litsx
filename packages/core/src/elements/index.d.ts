export type LitsxConstructor<TInstance = object> = abstract new (
  ...args: any[]
) => TInstance;

export declare const LITSX_SCOPED_TEMPLATE: unique symbol;
export declare const LITSX_MODULE_ID: unique symbol;
export declare const LITSX_SSR_CONTEXT: unique symbol;
export declare const LITSX_SERVER_COMPONENT: unique symbol;

export interface LitsxScopedTemplate<
  TTemplate = unknown,
  TElements extends Record<string, unknown> = Record<string, unknown>,
> {
  readonly [LITSX_SCOPED_TEMPLATE]: true;
  readonly template: TTemplate;
  readonly elements: TElements;
}

export declare function __litsxScopedTemplate<
  TTemplate,
  TElements extends Record<string, unknown> = Record<string, unknown>,
>(
  template: TTemplate,
  elements?: TElements | null | undefined,
): LitsxScopedTemplate<TTemplate, TElements>;

export declare function __isLitsxScopedTemplate(
  value: unknown
): value is LitsxScopedTemplate;

export interface LitsxStaticHoistsStatics {
  __litsxStatic<T>(cacheKey: PropertyKey, compute: () => T): T;
  __litsxResolveStaticValue<T>(value: T): T;
  __litsxMergeProperties<
    TBase extends Record<PropertyKey, unknown> | null | undefined,
    TOverride extends Record<PropertyKey, unknown> | null | undefined,
  >(base: TBase, override: TOverride): Record<PropertyKey, unknown> | TBase;
}

export type LitsxStaticHoistsHost<TBase extends LitsxConstructor> =
  TBase & LitsxStaticHoistsStatics;

export declare function LitsxStaticHoistsMixin<TBase extends LitsxConstructor>(
  Base: TBase
): LitsxStaticHoistsHost<TBase>;

export interface ShadowDomStatics {
  readonly scopedElements: Record<string, unknown>;
}

export interface DomMixinInstance {
  registry: CustomElementRegistry | null;
}

export type ShadowDomHost<TBase extends LitsxConstructor> =
  TBase & ShadowDomStatics;

export declare function ShadowDomMixin<TBase extends LitsxConstructor>(
  Base: TBase
): LitsxConstructor<InstanceType<TBase> & DomMixinInstance> &
  ShadowDomStatics;

export interface LightDomHost {
  createRenderRoot(): this;
  registry: Map<string, unknown> | null;
}

export declare function LightDomMixin<TBase extends LitsxConstructor>(
  Base: TBase
): LitsxConstructor<InstanceType<TBase> & LightDomHost>;
