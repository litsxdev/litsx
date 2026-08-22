import type { ReactiveControllerHost } from "lit";

/** @internal Compiler/runtime ABI; do not import from authored components. */
export declare const STRUCTURAL_HOOKS: unique symbol;

/** @internal Compiler/runtime ABI; do not call from authored components. */
export declare function readStructuralHook<TArgs extends unknown[], TResult>(
  hook: (...args: TArgs) => TResult,
  args?: TArgs,
): TResult;

/** @internal Compiler/runtime ABI; do not call from authored components. */
export declare function applyStructuralHooks<TBase extends abstract new (...args: any[]) => any>(
  Base: TBase,
  hooks?: unknown[],
): TBase;

/** @internal Test/runtime primitive used by the generated render boundary. */
export declare function runWithHookHost<T>(
  host: ReactiveControllerHost,
  run: () => T,
): T;

/** @internal Reset hook cursors for a manually managed render attempt. */
export declare function prepareEffects(host: ReactiveControllerHost): void;
