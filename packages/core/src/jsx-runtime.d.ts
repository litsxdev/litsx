import type {
  ErrorBoundary,
  LitsxBaseAttributes,
  LitsxComponent,
  LitsxDomAttributes,
  LitsxElementProps,
  LitsxErrorBoundaryElementProps,
  LitsxIntrinsicElements,
  LitsxJsxNode,
  LitsxRenderable,
  LitsxRef,
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

  type LitsxComponentAuthoredAttributes =
    LitsxBaseAttributes & LitsxDomAttributes<EventTarget>;

  type LitsxComponentElementProps<TProps> =
    TProps & LitsxComponentAuthoredAttributes;

  type LibraryManagedAttributes<Component, Props> =
    Component extends typeof ErrorBoundary ? LitsxErrorBoundaryElementProps :
    Component extends typeof SuspenseBoundary ? LitsxSuspenseBoundaryElementProps :
    Component extends typeof SuspenseList ? LitsxBoundaryElementProps<SuspenseList, SuspenseListProps> :
    Component extends LitsxComponent<infer InferredProps> ? LitsxComponentElementProps<InferredProps> :
    LitsxComponentElementProps<Props>;
}

export type LitsxComponentProps<T> =
  T extends typeof ErrorBoundary ? LitsxErrorBoundaryElementProps :
  T extends typeof SuspenseBoundary ? LitsxSuspenseBoundaryElementProps :
  T extends typeof SuspenseList ? JSX.LitsxBoundaryElementProps<SuspenseList, SuspenseListProps> :
  Record<string, unknown>;
