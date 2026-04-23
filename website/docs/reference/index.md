# Reference

This section is the native API reference for Lit<sup>sx</sup>.

It covers the APIs you author directly in Lit<sup>sx</sup> code:

- primitives such as `SuspenseBoundary` and `SuspenseList`
- hooks for state, effects, transitions, refs, and external stores
- static hoists such as `^name(...)`, documented in the authoring guides rather than exposed as runtime imports
- styling helpers for dynamic host style values
- the authored surface of the framework, not the lower-level runtime helpers behind compilation

If you are learning the framework, read this section the same way you would read the reference docs of any other UI framework: as the place to understand what each API is for, when to use it, and what mental model to apply.

## What This Section Is For

Use this reference when you already know the feature you need and want the native Lit<sup>sx</sup> API for it.

- state and derived values
- async rendering and recoverable errors
- events and lifecycle hooks
- refs and imperative escape hatches
- host-level dynamic styling

If you are still learning the authoring model itself, start with the guides first and then come back here as the API map.

## What Is Not Here

This section is intentionally not the place for:

- Babel transform internals
- React compatibility lowering details
- generated transform contracts
- implementation-level runtime helpers that exist only to support compilation

Those live elsewhere:

- [Transform Recipes](../transforms/)
- [Migrating from React](../guides/migrating-from-react.md)
- [Framework Reference](../framework/generated/)

## Start Here

- [Detailed Reference Pages](./generated/)
- [Primitives](../guides/primitives.md)
- [Events](../guides/events.md)
- [Refs](../guides/refs.md)
- [JSX Authoring](../guides/jsx-authoring.md)

## Most Used APIs

If you want the shortest path through the native surface, start here:

- [useState](./generated/usestate.md) for local component state
- [useAsyncState](./generated/useasyncstate.md) for authoritative async mutations and pending/error state
- [useRef](./generated/useref.md) for mutable refs and imperative coordination
- [useEvent](./generated/useevent.md) for stable event handlers tied to component lifecycle
- [useEmit](./generated/useemit.md) for custom DOM events as part of the public component API
- [SuspenseBoundary](./generated/suspenseboundary.md) for async subtrees
- [ErrorBoundary](./generated/errorboundary.md) for recoverable rendering failures
- [useStyle](./generated/usestyle.md) for dynamic host style values

## Compile-Time Authoring

Some Lit<sup>sx</sup> features are authored natively but are not runtime imports.

The most important examples are static hoists such as `^styles(...)`, `^properties(...)`, and other `^name(...)` forms. They are part of the authoring model, but they belong in the guides because they are compile-time syntax, not ordinary importable APIs.

Start here for that layer:

- [JSX Authoring](../guides/jsx-authoring.md)
- [Static Hoists](../guides/static-hoists.md)
- [Property Inference](../guides/property-inference.md)

## Primitives

Primitives shape asynchronous UI directly in authored JSX.

- [SuspenseBoundary](./generated/suspenseboundary.md)
- [SuspenseList](./generated/suspenselist.md)
- [ErrorBoundary](./generated/errorboundary.md)

Start with these if you are learning how Lit<sup>sx</sup> models async rendering and recoverable subtree failures.

## Hooks

Hooks are the main authored API for state, effects, transitions, and imperative escape hatches.

The rough mental model is:

- state hooks own local and derived state
- lifecycle hooks connect authored code to rendering and DOM timing
- ref hooks own imperative access and public handles
- integration hooks bridge to external stores or environment state

### State And Derived Values

- [useState](./generated/usestate.md)
- [useReducedState](./generated/usereducedstate.md)
- [useControlledState](./generated/usecontrolledstate.md)
- [useAsyncState](./generated/useasyncstate.md)
- [useMemoValue](./generated/usememovalue.md)
- [useOptimistic](./generated/useoptimistic.md)
- [useDeferredValue](./generated/usedeferredvalue.md)
- [useTransition](./generated/usetransition.md)

### Effects And Lifecycle Work

- [useOnConnect](./generated/useonconnect.md)
- [useEvent](./generated/useevent.md)
- [useEmit](./generated/useemit.md)
- [useAfterUpdate](./generated/useafterupdate.md)
- [useOnCommit](./generated/useoncommit.md)

### Refs And Imperative APIs

- [Refs Guide](../guides/refs.md)
- [useRef](./generated/useref.md)
- [useCallbackRef](./generated/usecallbackref.md)
- [useExpose](./generated/useexpose.md)
- [useHost](./generated/usehost.md)
- [useHostContent](./generated/usehostcontent.md)
- [usePrevious](./generated/useprevious.md)
- [useSlot](./generated/useslot.md)
- [useStableCallback](./generated/usestablecallback.md)
- [useTextContent](./generated/usetextcontent.md)

### External State

- [useExternalStore](./generated/useexternalstore.md)

## Styling

Styling helpers let authored Lit<sup>sx</sup> code drive dynamic host-level style values.

- [useStyle](./generated/usestyle.md)

## Suggested Reading Paths

If you are new to Lit<sup>sx</sup>:

1. Read [JSX Authoring](../guides/jsx-authoring.md).
2. Read [useState](./generated/usestate.md), [useAsyncState](./generated/useasyncstate.md), [useOptimistic](./generated/useoptimistic.md), [useOnConnect](./generated/useonconnect.md), [useEvent](./generated/useevent.md), [useEmit](./generated/useemit.md), [useAfterUpdate](./generated/useafterupdate.md), and [useOnCommit](./generated/useoncommit.md).
3. Then move to [ErrorBoundary](./generated/errorboundary.md), [SuspenseBoundary](./generated/suspenseboundary.md), and [SuspenseList](./generated/suspenselist.md).

If you are building more interactive components:

1. Start with [useState](./generated/usestate.md) and [useReducedState](./generated/usereducedstate.md).
2. Add [useMemoValue](./generated/usememovalue.md), [useDeferredValue](./generated/usedeferredvalue.md), [useTransition](./generated/usetransition.md), and [useOptimistic](./generated/useoptimistic.md) when derived work or async interactions become more expensive.
3. Use [useRef](./generated/useref.md), [useHost](./generated/usehost.md), [useHostContent](./generated/usehostcontent.md), [useTextContent](./generated/usetextcontent.md), [useSlot](./generated/useslot.md), and [useExpose](./generated/useexpose.md) only when the component needs DOM or imperative coordination.
