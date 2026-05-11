export type LitsxConstructor<TInstance = object> = abstract new (
  ...args: any[]
) => TInstance;

export declare const LITSX_COMPONENT: unique symbol;
export declare const LITSX_HOST_TYPE_ID: unique symbol;
export declare const LITSX_SCOPED_TEMPLATE: unique symbol;
export declare const LITSX_MODULE_ID: unique symbol;
export declare const LITSX_SSR_CONTEXT: unique symbol;
export declare const LITSX_SERVER_COMPONENT: unique symbol;
export declare const LITSX_SERVER_COMPONENT_CALL: unique symbol;

export interface LitsxComponentStatic {
  readonly [LITSX_COMPONENT]: true;
}

export interface LitsxHostTypeIdStatic extends LitsxComponentStatic {
  readonly [LITSX_HOST_TYPE_ID]: string;
}

export declare function isLitsxComponentClass(
  value: unknown
): value is LitsxComponentStatic;

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

export interface LitsxServerComponentCall<
  TComponent = unknown,
  TProps extends Record<string, unknown> = Record<string, unknown>,
> {
  readonly [LITSX_SERVER_COMPONENT_CALL]: true;
  readonly component: TComponent;
  readonly props: TProps;
}

export declare function __litsxServerComponentCall<
  TComponent,
  TProps extends Record<string, unknown> = Record<string, unknown>,
>(
  component: TComponent,
  props?: TProps | null | undefined,
): LitsxServerComponentCall<TComponent, TProps>;

export declare function __isLitsxServerComponentCall(
  value: unknown
): value is LitsxServerComponentCall;

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
