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

export interface ShadowDomStatics {
  readonly scopedElements: Record<string, unknown>;
}

export interface LitsxScopedRegistryLike {
  define(tagName: string, elementClass: CustomElementConstructor): unknown;
  get(tagName: string): CustomElementConstructor | null | undefined;
}

export interface ShadowDomHostInstance {
  /**
   * Active scoped registry for this shadow host.
   * LitSX may provide either a native CustomElementRegistry or an internal shim
   * with the same define/get surface when native scoped registries are not
   * available.
   */
  registry: LitsxScopedRegistryLike | null;
}

export type ShadowDomHost<TBase extends LitsxConstructor> =
  TBase & ShadowDomStatics;

export declare function ShadowDomMixin<TBase extends LitsxConstructor>(
  Base: TBase
): LitsxConstructor<InstanceType<TBase> & ShadowDomHostInstance> &
  ShadowDomStatics;

export interface LightDomHost {
  /**
   * LightDomMixin keeps Lit rendering in light DOM.
   * Scoped elements are not supported in this mode.
   */
  createRenderRoot(): this;
  registry: null;
}

export declare function LightDomMixin<TBase extends LitsxConstructor>(
  Base: TBase
): LitsxConstructor<InstanceType<TBase> & LightDomHost>;
