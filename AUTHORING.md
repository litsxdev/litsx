# LitSX authoring contract

This document is the canonical source contract for native LitSX. The website and
package documentation should describe the same surface.

## Source language

LitSX components are authored in ordinary `.jsx` or `.tsx` files. The source is
parsed as standard JSX/TSX and still requires the LitSX compiler.

```tsx
import { css, useRef, useState } from "@litsx/core";

type ToggleProps = {
  active?: boolean;
  label: string;
};

export function Toggle({ active = false, label }: ToggleProps) {
  const [pressed, setPressed] = useState(active);
  const button = useRef<HTMLButtonElement>();

  return (
    <button
      ref={button}
      class="toggle"
      aria-pressed={pressed}
      on:click={() => setPressed(!pressed)}
    >
      {label}
    </button>
  );
}

Toggle.styles = css`
  .toggle { cursor: pointer; }
`;
```

The authored language does not include Lit's `.property`, `?boolean`, or
`@event` binding prefixes. Those forms are compiler IR and generated-template
syntax. The removed `.litsx` extension and in-function `static ...` declarations
are not compatibility syntax. The former magic calls `staticProps(...)` and
`staticStyles(...)` are removed as well; use top-level component assignments.

## Components and metadata

Top-level PascalCase functions and function-valued declarations are component
candidates. Use normal JSX component names at callsites:

```tsx
<Toggle active={enabled} label="Details" />
```

A member expression imported through a namespace is also an element. For
example, `Controls.Toggle` and `Controls.OtherComponent` receive stable scoped
tags derived from the namespace and member names.

Attach component metadata with standard top-level JavaScript assignments:

```tsx
Toggle.styles = css`button { color: var(--accent); }`;
Toggle.properties = {
  active: { type: Boolean },
};
Toggle.shadowRootOptions = { mode: "open", delegatesFocus: true };
Toggle.lightDom = true;
```

Use the `css` export from `@litsx/core` for component styles. It is Lit's real
`css` tag, so editors can recognize and decorate the template and Lit receives a
`CSSResult`, not an untyped string.

Build integrations can route generated light-DOM styles with
`lightDomStyles: "scoped" | "global" | "none"`. The default `scoped` mode
creates a stable component boundary; `global` is intended for an
integration-owned document stylesheet, and `none` leaves only explicitly
authored styles. This is a compiler option, not additional authoring syntax.

## Props and bindings

Authors always write ordinary JSX names. The compiler chooses the Lit binding
from the destination API:

| Authored value or target contract | Generated Lit binding |
| --- | --- |
| declared `boolean` / `{ type: Boolean }` | boolean attribute part |
| declared `string`, `number`, bigint, or enum | attribute part |
| object, array, function, `unknown`, or `{ attribute: false }` | property part |
| `data-*`, `aria-*`, and ordinary HTML attributes | attribute part |
| native `value` on `input`, `textarea`, or `select` | property part |
| native HTML boolean attribute such as `disabled` | boolean attribute part |

Inference uses, in order, the local component declaration, TypeScript's imported
component or intrinsic-element type, and the target custom-element constructor
when runtime spread handling is required. A component prop without an available
type falls back to an attribute for a literal string and a property for an
expression. Published libraries should therefore expose their component props in
their declarations; consumers do not need private compiler metadata for the
ordinary typed case.

HTML keeps its own semantics:

- use `class`, not React's `className`, in native LitSX;
- use `for` on `<label>` and `<output>`;
- `value` and `defaultValue` on form controls update the live `value` property;
- presence booleans such as `disabled`, `checked`, and `selected` use boolean
  attribute parts;
- enumerated attributes such as `contenteditable`, `draggable`, and `spellcheck`
  serialize `"true"` or `"false"`; they are not presence booleans;
- exact lowercase native handler properties such as `onclick` remain property
  assignments on HTML and custom elements.

## Events

Native LitSX uses one explicit declarative listener channel on HTML and custom
elements:

```tsx
<button on:click={save} />
<ActionButton on:primary-action={handlePrimaryAction} />
```

Declarative event names must be lowercase kebab-case. Event names containing
additional separators, such as `menu:open` or `state.change`, use
`addEventListener()`.

An `onX` name on a component is an ordinary callback prop, not an event
convention:

```tsx
<Dialog onClose={closeDialog} />
```

React-style `onClick`, `onChange`, capture aliases, and custom-event name
conversion belong exclusively to the optional `react-compat` pipeline. Native
LitSX does not depend on that convention. The platform's exact lowercase IDL
properties, such as `onclick`, are still valid when property assignment is
intended.

Use a typed `useEmit<EventMap>()` or `Component.events` declaration to publish a
custom-element event contract. Consumers then receive typed `on:event` props,
and spread handling can use the same event metadata.

## Spreads

JSX spreads preserve source order and last-write-wins behavior:

```tsx
<ActionButton {...defaults} disabled={locked} {...overrides} />
```

In the browser, LitSX applies the merged result through an `ElementPart`, which
allows the runtime to inspect the destination element and constructor before
choosing attribute, boolean, property, event, style, or ref behavior. Object-rest
component props stay in one forwarding bag rather than expanding broad types
such as `React.ComponentProps<"button">` into hundreds of reactive host props.

SSR uses regular Lit parts and records a compact mapping that
`@litsx/ssr/client` reconciles during hydration. Applications that render
hydratable spreads must pair `render` from `@litsx/ssr` with `hydrate` from
`@litsx/ssr/client`.

`children` and React's `key` are not projected as DOM attributes by spread
handling.

## Refs

Native LitSX follows Lit's ref contract:

```tsx
const input = useRef<HTMLInputElement>();

useOnCommit(() => input.value?.focus(), []);
return <input ref={input} />;
```

- object refs expose `.value`;
- disconnection clears them with `undefined`;
- callback refs receive the node and later `undefined`;
- intrinsic refs lower to Lit's `ref()` element directive;
- component refs travel as a property until they reach the component host,
  forwarded target, or `useExpose` handle;
- SSR does not serialize a ref value; hydration attaches the client ref to the
  existing server-rendered node.

The React compatibility layer creates stable `.current`/`null` facades and
adapts object refs, callback refs, `createRef`, `forwardRef`,
`useImperativeHandle`, spreads, SSR, hydration, and React 19 callback cleanup.
React-authored source therefore keeps React's ref contract without changing the
native LitSX contract.

## Identity and collections

Native LitSX uses Lit directives for identity. Use `repeat()` for keyed
collections and `keyed()` when replacing one value should replace its DOM:

```tsx
import { repeat } from "lit/directives/repeat.js";

return <ul>{repeat(items, (item) => item.id, (item) => <Row item={item} />)}</ul>;
```

A native JSX `key` prop has no React reconciliation meaning. The optional
`react-compat` stage recognizes React-authored `key` and lowers supported cases
to `repeat()` or `keyed()`.

## React compatibility boundary

`@litsx/babel-preset-react-compat` is an optional source-migration layer. It owns
React-specific aliases and behavior such as `className`, `htmlFor`, `onClick`,
`key`, `.current`, `createRef`, `forwardRef`, context, wrappers, and supported
hooks. Native LitSX authoring should not adopt those forms merely because the
compatibility compiler can consume them.

React compatibility lowers migrated components to light DOM by default so React-style nesting and global CSS continue to work. Consumers can opt into shadow roots with `domMode: "shadow"`; see the [react-compat option reference](./packages/babel-preset-react-compat/README.md#options). This migration default does not change the native LitSX DOM-mode contract.

The final output of both pipelines is Lit: Lit elements, Lit templates, Lit
directives, and web-component lifecycle semantics.
