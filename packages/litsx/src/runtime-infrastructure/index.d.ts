export type LitsxConstructor<TInstance = object> = abstract new (
  ...args: any[]
) => TInstance;

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

export interface ShadowDomScopedElementsStatics {
  readonly scopedElements: Record<string, unknown>;
}

export type ShadowDomElementsHost<TBase extends LitsxConstructor> =
  TBase & ShadowDomScopedElementsStatics;

export declare function ShadowDomElementsMixin<TBase extends LitsxConstructor>(
  Base: TBase
): ShadowDomElementsHost<TBase>;

export interface LightDomHost {
  createRenderRoot(): this;
}

export declare function LightDomMixin<TBase extends LitsxConstructor>(
  Base: TBase
): LitsxConstructor<InstanceType<TBase> & LightDomHost>;

export interface LightDomElementsHost {
  registry: Map<string, unknown> | null;
}

export declare function LightDomElementsMixin<TBase extends LitsxConstructor>(
  Base: TBase
): LitsxConstructor<InstanceType<TBase> & LightDomHost & LightDomElementsHost>;
