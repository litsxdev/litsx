export type LitsxConstructor<TInstance = object> = abstract new (
  ...args: any[]
) => TInstance;

export declare const LITSX_COMPONENT: unique symbol;
export declare const LITSX_EVENTS: unique symbol;
export declare const LITSX_HOST_TYPE_ID: unique symbol;
export declare const LITSX_LIGHT_DOM_STYLE_SCOPE: unique symbol;
export declare const LITSX_HYDRATABLE_TAG: unique symbol;
export declare const LITSX_SCOPED_TEMPLATE: unique symbol;
export declare const LITSX_MODULE_ID: unique symbol;
export declare const LITSX_SSR_CONTEXT: unique symbol;
export declare const LITSX_SERVER_COMPONENT: unique symbol;
export declare const LITSX_SERVER_COMPONENT_CALL: unique symbol;

export interface LitsxEventMetadata {
  readonly events: readonly string[];
  readonly complete: boolean;
}
export interface LitsxEventDeclaration<
  Events extends Record<string, unknown>,
  Complete extends boolean = boolean,
> extends LitsxEventMetadata {
  readonly complete: Complete;
  readonly __types?: Events;
}

export interface LitsxComponentStatic<Events extends Record<string, unknown> = Record<string, unknown>> {
  readonly [LITSX_COMPONENT]: true;
  readonly [LITSX_EVENTS]?: LitsxEventDeclaration<Events, boolean>;
  readonly events?: LitsxEventDeclaration<Events, boolean>;
}

export interface LitsxHydratableComponentStatic extends LitsxComponentStatic {
  readonly [LITSX_HYDRATABLE_TAG]: string;
}

export interface LitsxHydratableCustomElementStatic {
  readonly [LITSX_HYDRATABLE_TAG]: string;
  readonly [LITSX_MODULE_ID]?: string;
}

export interface LitsxHostTypeIdStatic extends LitsxComponentStatic {
  readonly [LITSX_HOST_TYPE_ID]: string;
  readonly [LITSX_LIGHT_DOM_STYLE_SCOPE]?: string;
}

export declare function isLitsxComponentClass(
  value: unknown
): value is LitsxComponentStatic;
export declare function isCustomElementClass(
  value: unknown
): value is CustomElementConstructor;
export declare function isHydratableCustomElementClass(
  value: unknown
): value is LitsxHydratableCustomElementStatic & CustomElementConstructor;
export declare function annotateHydratableCustomElement<
  T extends CustomElementConstructor,
>(
  ctor: T,
  metadata?: {
    tagName?: string | null | undefined;
    moduleId?: string | null | undefined;
  },
): T & LitsxHydratableCustomElementStatic;

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

/**
 * Internal SSR transport marker for a client ref forwarded through a
 * server-component composition boundary.
 */
export declare const LITSX_FORWARDED_REF: unique symbol;

export interface LitsxForwardedRef {
  readonly [LITSX_FORWARDED_REF]: string;
  current: null;
}

export declare function __litsxForwardedRef(id: string): LitsxForwardedRef;
export declare function __isLitsxForwardedRef(value: unknown): value is LitsxForwardedRef;
export declare function __getLitsxForwardedRefId(value: unknown): string | null;

export declare function mergePropertyDeclarations(
  base: Record<PropertyKey, unknown> | null | undefined,
  override: Record<PropertyKey, unknown> | null | undefined,
): Record<PropertyKey, unknown>;

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

export declare function HydrationSuspenseMixin<TBase extends LitsxConstructor>(
  Base: TBase
): TBase;

export interface LightDomHost {
  /**
   * LightDomMixin keeps Lit rendering in light DOM and resolves component-local
   * element definitions through a contextual registry when needed.
   */
  createRenderRoot(): this;
  registry: LitsxScopedRegistryLike | null;
}

export declare function LightDomMixin<TBase extends LitsxConstructor>(
  Base: TBase
): LitsxConstructor<InstanceType<TBase> & LightDomHost>;
