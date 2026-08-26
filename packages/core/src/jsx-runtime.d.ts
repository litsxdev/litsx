import type {
  ErrorBoundary,
  LitsxBaseAttributes,
  LitsxComponent,
  LitsxDomAttributes,
  LitsxElementProps,
  LitsxErrorBoundaryElementProps,
  LitsxEventDeclaration,
  LitsxExplicitCustomEventAttributes,
  LitsxIntrinsicElements,
  LitsxJsxNode,
  LitsxRenderable,
  LitsxRef,
  LitsxTypedCustomEventAttributes,
  LitsxSuspenseBoundaryElementProps,
  SuspenseBoundary,
  SuspenseBoundaryProps,
  SuspenseList,
  SuspenseListProps,
} from "./index.js";
import type { LitElement } from "lit";

export declare const Fragment: unique symbol;
export declare const LITSX_JSX_TYPE: unique symbol;

/**
 * JSX factory for single-child LitSX nodes.
 */
export declare function jsx(
  type: unknown,
  props: Record<string, unknown> | null,
  key?: string
): LitsxJsxNode;

/**
 * JSX factory for multi-child LitSX nodes.
 */
export declare function jsxs(
  type: unknown,
  props: Record<string, unknown> | null,
  key?: string
): LitsxJsxNode;

export namespace JSX {
  interface Element extends LitsxJsxNode {}

  interface ElementClass {}

  interface ElementChildrenAttribute {
    children: {};
  }

  interface IntrinsicAttributes {
    key?: string | number;
  }

  type IntrinsicElements = LitsxIntrinsicElements;

  interface IntrinsicClassAttributes<T> {
    ref?: LitsxRef<T>;
  }

  type LitsxBoundaryElementProps<TElement, TProps> =
    LitsxElementProps<TElement> & TProps;

  type LitsxComponentEventMap<Component> =
    Component extends { readonly events: LitsxEventDeclaration<infer Events, infer Complete> }
      ? Complete extends true ? Events : {}
      : {};

  type LitsxComponentAuthoredAttributes<
    TProps,
    TEvents extends Record<string, unknown>,
    TBaseAttributes = LitsxBaseAttributes,
  > =
    TBaseAttributes &
    (keyof TEvents extends never
      ? LitsxExplicitCustomEventAttributes
      : Omit<LitsxDomAttributes<EventTarget>, `on:${Extract<keyof TEvents, string>}`> &
        LitsxTypedCustomEventAttributes<TEvents>);

  type LitsxNormalizeManagedProps<TProps> = 0 extends (1 & TProps) ? {} : TProps;

  type LitsxExactStaticPropertyKeys<Component> =
    Component extends { readonly properties: infer Declarations }
      ? string extends keyof Declarations ? never : Extract<keyof Declarations, string>
      : never;

  type LitsxOwnDataPropertyKeys<Instance> = {
    [Key in Exclude<Extract<keyof Instance, string>, keyof LitElement>]:
      Instance[Key] extends (...args: any[]) => unknown ? never : Key;
  }[Exclude<Extract<keyof Instance, string>, keyof LitElement>];

  type LitsxPureLitElementProps<Component> =
    Component extends abstract new (...args: any[]) => infer Instance
      ? Instance extends LitElement
        ? Partial<Pick<
            Instance,
            Extract<
              LitsxExactStaticPropertyKeys<Component> | LitsxOwnDataPropertyKeys<Instance>,
              keyof Instance
            >
          >>
        : {}
      : {};

  type LitsxManagedComponentProps<Component, Props> =
    LitsxNormalizeManagedProps<Props> & LitsxPureLitElementProps<Component>;

  type LitsxManagedBaseAttributes<Component> =
    Component extends abstract new (...args: any[]) => LitElement
      ? Omit<LitsxBaseAttributes, "ref">
      : LitsxBaseAttributes;

  type LitsxPureLitRefAttributes<Component> =
    Component extends abstract new (...args: any[]) => infer Instance
      ? { ref?: LitsxRef<Instance> }
      : {};

  type LitsxComponentElementProps<
    TProps,
    TEvents extends Record<string, unknown> = {},
    TBaseAttributes = LitsxBaseAttributes,
  > =
    LitsxNormalizeManagedProps<TProps> &
    LitsxComponentAuthoredAttributes<
      LitsxNormalizeManagedProps<TProps>,
      TEvents,
      TBaseAttributes
    >;

  type LibraryManagedAttributes<Component, Props> =
    Component extends typeof ErrorBoundary ? LitsxErrorBoundaryElementProps :
    Component extends typeof SuspenseBoundary ? LitsxSuspenseBoundaryElementProps :
    Component extends typeof SuspenseList ? LitsxBoundaryElementProps<SuspenseList, SuspenseListProps> :
    LitsxComponentElementProps<
      LitsxManagedComponentProps<Component, Props>,
      LitsxComponentEventMap<Component>,
      LitsxManagedBaseAttributes<Component>
    >;
}

export type LitsxComponentProps<T> =
  T extends typeof ErrorBoundary ? LitsxErrorBoundaryElementProps :
  T extends typeof SuspenseBoundary ? LitsxSuspenseBoundaryElementProps :
  T extends typeof SuspenseList ? JSX.LitsxBoundaryElementProps<SuspenseList, SuspenseListProps> :
  T extends abstract new (...args: any[]) => LitElement
    ? JSX.LitsxComponentElementProps<
        JSX.LitsxPureLitElementProps<T>,
        JSX.LitsxComponentEventMap<T>,
        Omit<LitsxBaseAttributes, "ref"> & JSX.LitsxPureLitRefAttributes<T>
      >
    : Record<string, unknown>;
