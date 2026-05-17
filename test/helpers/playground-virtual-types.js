export const PLAYGROUND_TYPE_FILES = {
  "/__litsx_virtual__/dom.playground.d.ts": String.raw`
    interface EventTarget {}
    
    interface Element extends EventTarget {}
    
    interface CSSStyleDeclaration {
      [propertyName: string]: string;
    }
  `,
  "/__litsx_virtual__/lib.playground.d.ts": String.raw`
    type PropertyKey = string | number | symbol;
    
    interface Object {}
    interface Function {}
    interface CallableFunction extends Function {}
    interface NewableFunction extends Function {}
    
    interface IArguments {
      length: number;
      callee: Function;
      [index: number]: any;
    }
    
    interface String {}
    interface Number {}
    interface Boolean {}
    interface Symbol {}
    
    interface Array<T> {
      length: number;
      [n: number]: T;
    }
    
    interface ReadonlyArray<T> {
      readonly length: number;
      readonly [n: number]: T;
    }
    
    interface Date {}
    
    type Partial<T> = { [P in keyof T]?: T[P] };
    type Required<T> = { [P in keyof T]-?: T[P] };
    type Readonly<T> = { readonly [P in keyof T]: T[P] };
    type Pick<T, K extends keyof T> = { [P in K]: T[P] };
    type Exclude<T, U> = T extends U ? never : T;
    type Omit<T, K extends keyof any> = Pick<T, Exclude<keyof T, K>>;
    type Record<K extends keyof any, T> = { [P in K]: T };
  `,
  "/__litsx_virtual__/litsx.playground.d.ts": String.raw`
    declare module "@litsx/core" {
      export type LitsxRenderable =
        | string
        | number
        | boolean
        | null
        | undefined
        | Iterable<unknown>
        | Record<string, unknown>;
    
      export interface SuspenseBoundaryProps {
        children?: LitsxRenderable;
        fallback?: LitsxRenderable;
      }

      export interface ErrorBoundaryProps {
        children?: LitsxRenderable;
        fallback?: LitsxRenderable | ((error: unknown) => LitsxRenderable);
        onError?: (error: unknown) => void;
      }
    
      export interface SuspenseListProps {
        children?: LitsxRenderable;
        revealOrder?: "forwards" | "backwards" | "together";
        tail?: "collapsed" | "hidden";
      }
    
      export class SuspenseBoundary {
        pending: boolean;
        resolved: boolean;
        showing: string;
        phase: string;
      }

      export class ErrorBoundary {
        failed: boolean;
        error: unknown;
      }
    
      export class SuspenseList {
        revealOrder: "forwards" | "backwards" | "together";
        tail: "collapsed" | "hidden";
      }
    
      declare function __litsx_static_properties<T = unknown>(
        value: T
      ): void;

      declare function __litsx_static_styles<T = unknown>(
        value: T
      ): void;

      declare function __litsx_static_lightDom(value?: unknown): void;
    
      export function useAfterUpdate(
        callback: () => void | (() => void),
        deps?: unknown[]
      ): void;
    
      export function useOnCommit(
        callback: () => void | (() => void),
        deps?: unknown[]
      ): void;
    
      export function useOnConnect(
        callback: () => void | (() => void),
        deps?: unknown[]
      ): void;
    
      export function useMemoValue<T>(
        factory: () => T,
        deps?: unknown[]
      ): T;
    
      export function useStableCallback<T extends (...args: never[]) => unknown>(
        callback: T,
        deps?: unknown[]
      ): T;

      export function useEvent<T extends (...args: never[]) => unknown>(
        callback: T
      ): T;

      export function usePrevious<T>(
        value: T,
        initialValue?: T
      ): T | undefined;
    
      export function useReducedState<TState, TAction, TInitArg = TState>(
        reducer: (state: TState, action: TAction) => TState,
        initialArg: TInitArg,
        init?: (arg: TInitArg) => TState
      ): [TState, (action: TAction | ((value: TState) => TState)) => void];
    
      export function useState<T>(
        initial: T | (() => T)
      ): [T, (next: T | ((value: T) => T)) => void];

      export function useControlledState<T>(options: {
        value?: T;
        defaultValue?: T | (() => T);
        onChange?: (value: T) => void;
      }): [T | undefined, (next: T | ((value: T | undefined) => T)) => void];

      export function useAsyncState<TState, TArgs extends unknown[] = []>(
        initialState: TState | (() => TState),
        action: (state: TState, ...args: TArgs) => TState | Promise<TState>
      ): [
        TState,
        (...args: TArgs) => Promise<TState>,
        {
          pending: boolean;
          error: unknown | null;
          reset: () => void;
        }
      ];

      export function useOptimistic<TState>(
        state: TState
      ): [TState, (value: TState) => void, () => void];

      export function useOptimistic<TState, TInput>(
        state: TState,
        updateFn: (currentState: TState, optimisticValue: TInput) => TState
      ): [TState, (value: TInput) => void, () => void];
    
      export function useTransition(): [boolean, (callback: () => void) => void];
    
      export function useDeferredValue<T>(
        value: T,
        options?: { timeout?: number }
      ): T;
    
      export function useStyle(
        propertyName: string,
        value: string | number | null | undefined | false
      ): void;
    
      export function useStyle(
        propertyName: string,
        compute: () => string | number | null | undefined | false,
        deps?: unknown[]
      ): void;
    
      export function useRef<T>(initialValue?: T): { current: T | undefined };
    
      export function useExpose<T>(
        ref: { current: T | null } | ((value: T | null) => void),
        createHandle: () => T,
        deps?: unknown[]
      ): void;
    
      export function useExternalStore<T>(
        subscribe: (listener: () => void) => () => void,
        getSnapshot: () => T,
        getServerSnapshot?: () => T
      ): T;
    }
  `,
};
