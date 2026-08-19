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

  type LitsxComponentAuthoredAttributes<TProps, TEvents extends Record<string, unknown>> =
    LitsxBaseAttributes &
    LitsxDomAttributes<EventTarget> &
    (keyof TEvents extends never
      ? LitsxExplicitCustomEventAttributes
      : LitsxTypedCustomEventAttributes<TEvents>);

  type LitsxNormalizeManagedProps<TProps> = 0 extends (1 & TProps) ? {} : TProps;

  type LitsxComponentElementProps<TProps, TEvents extends Record<string, unknown> = {}> =
    LitsxNormalizeManagedProps<TProps> &
    LitsxComponentAuthoredAttributes<LitsxNormalizeManagedProps<TProps>, TEvents>;

  type LibraryManagedAttributes<Component, Props> =
    Component extends typeof ErrorBoundary ? LitsxErrorBoundaryElementProps :
    Component extends typeof SuspenseBoundary ? LitsxSuspenseBoundaryElementProps :
    Component extends typeof SuspenseList ? LitsxBoundaryElementProps<SuspenseList, SuspenseListProps> :
    LitsxComponentElementProps<Props, LitsxComponentEventMap<Component>>;
}

export type LitsxComponentProps<T> =
  T extends typeof ErrorBoundary ? LitsxErrorBoundaryElementProps :
  T extends typeof SuspenseBoundary ? LitsxSuspenseBoundaryElementProps :
  T extends typeof SuspenseList ? JSX.LitsxBoundaryElementProps<SuspenseList, SuspenseListProps> :
  Record<string, unknown>;
