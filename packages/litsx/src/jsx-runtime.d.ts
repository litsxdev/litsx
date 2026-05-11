import type {
  ErrorBoundary,
  ErrorBoundaryProps,
  LitsxComponent,
  LitsxElementProps,
  LitsxIntrinsicElements,
  LitsxJsxNode,
  LitsxRef,
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

  interface IntrinsicElements extends LitsxIntrinsicElements {}

  interface IntrinsicClassAttributes<T> {
    ref?: LitsxRef<T>;
  }

  type LitsxBoundaryElementProps<TElement, TProps> =
    LitsxElementProps<TElement> & TProps;

  type LibraryManagedAttributes<Component, Props> =
    Component extends typeof ErrorBoundary ? LitsxBoundaryElementProps<ErrorBoundary, ErrorBoundaryProps> :
    Component extends typeof SuspenseBoundary ? LitsxBoundaryElementProps<SuspenseBoundary, SuspenseBoundaryProps> :
    Component extends typeof SuspenseList ? LitsxBoundaryElementProps<SuspenseList, SuspenseListProps> :
    Component extends LitsxComponent<infer InferredProps> ? InferredProps :
    Props;
}

export type LitsxComponentProps<T> =
  T extends typeof ErrorBoundary ? JSX.LitsxBoundaryElementProps<ErrorBoundary, ErrorBoundaryProps> :
  T extends typeof SuspenseBoundary ? JSX.LitsxBoundaryElementProps<SuspenseBoundary, SuspenseBoundaryProps> :
  T extends typeof SuspenseList ? JSX.LitsxBoundaryElementProps<SuspenseList, SuspenseListProps> :
  Record<string, unknown>;
