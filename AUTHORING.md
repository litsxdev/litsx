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

Inline JSX styles are separate from `Component.styles`. Literal CSS text stays
an ordinary inline attribute, while object values are applied through Lit's
`styleMap` directive:

```tsx
<div style="color: red" />
<div style={{ color: "red", width: "20px", "--accent": tone }} />
<div style={computedStyle} />
```

`computedStyle` may be CSS text, a style-property map, `null`, or `undefined`.
CamelCase names such as `backgroundColor`, already dashed names, and custom
properties are supported. LitSX follows Lit rather than React numeric style
semantics, so values that require units must include them explicitly. Use
`useStyle(...)` instead when the dynamic properties belong to the component
host rather than an element rendered by it.

Component styles extend the styles installed by structural mixins and other
base classes by default. Arrays remain ordinary Lit `CSSResultGroup` values:

```tsx
Card.styles = [sharedCardStyles, css`:host { display: block; }`];
```

The generated Lit class prepends `super.styles`. Use `replaceStyles()` when a
component deliberately needs an isolated stylesheet:

```tsx
import { css, replaceStyles } from "@litsx/core";

IsolatedCard.styles = replaceStyles(css`:host { all: initial; }`);
```

`replaceStyles()` is an identity outside compilation, so the same expression is
valid in a directly authored Lit class. A structural mixin that owns styles
must use ordinary cooperative Lit inheritance itself:

```ts
const FocusRingMixin = (Base) => class extends Base {
  static styles = [super.styles ?? [], focusRingStyles];
};
```

Reactive `properties` follow Lit's native class finalization: declarations from
the inheritance chain accumulate, and a derived declaration of the same name
replaces the inherited declaration. LitSX only combines inferred property
options with `Component.properties` options declared on the same component.
Scoped `elements` maps are combined with `super.elements`; local entries win on
tag-name collisions.

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
| component boolean prop or camelCase public prop | property part |
| lowercase scalar prop whose public attribute has the same name | attribute part |
| object, array, function, `unknown`, or `{ attribute: false }` | property part |
| explicit declared Boolean attribute alias such as `icon-only` | boolean attribute part |
| explicit declared non-Boolean attribute alias such as `aria-label` | attribute part |
| `data-*`, `aria-*`, and ordinary HTML attributes | attribute part |
| native `value` on `input`, `textarea`, or `select` | property part |
| native HTML boolean attribute such as `disabled` | boolean attribute part |

Standard host attributes are a common custom-element surface, not component
function props. For example, `class`, `id`, `style`, `slot`, `part`, global HTML
attributes, `aria-*`, and `data-*` written on `<QuartzIcon>` stay on the generated
`<quartz-icon>` host even when `QuartzIconProps` does not declare them. They are
not added to an object-rest props bag intended for an inner element. Declared
component props still take precedence when a component deliberately owns the
same name.

Inference uses, in order, the local component declaration, TypeScript's imported
component or intrinsic-element type, and the target custom-element constructor
when runtime spread handling is required. A component prop without an available
type falls back to an attribute for a literal string and a property for an
expression. Published libraries should therefore expose their component props in
their declarations; consumers do not need private compiler metadata for the
ordinary typed case.

Binding resolution follows one precedence order in browser and SSR output:

1. An ordinary component prop name addresses the JavaScript API. Boolean,
   camelCase, object-valued, function-valued, and opaque dynamic props use a
   property part, so `iconOnly` can never become the unrelated `icononly`
   attribute.
2. An explicitly authored hyphenated attribute name is matched in reverse
   against `Component.properties[*].attribute`. A Boolean declaration uses
   presence semantics (`icon-only=""` is present); other declarations use an
   attribute part (`aria-label="..."`). Spread keys use the same reverse lookup
   for every declared attribute alias, including lowercase HTML-style aliases.
3. `data-*`, `aria-*`, and standard HTML names retain their platform attribute
   semantics. Native live properties and HTML boolean/enumerated attributes use
   the rules below.
4. A spread applies the same resolver at runtime after the destination
   constructor has been finalized. Sources retain JSX order and the final value
   for a resolved binding wins.

This makes ordinary JSX precedence deterministic, including removal by an
`undefined` final value:

```tsx
<QuartzIcon class="first" {...attributes} class={open ? "open" : undefined} />
```

Lit's `.property`, `?boolean`, and `@event` prefixes can appear in generated
templates and take precedence there, but they are not authored LitSX syntax.

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
`@litsx/ssr/hydration` reconciles during hydration. The SSR compiler marks this
template path explicitly, so importing client hydration helpers in the same
process cannot make a server render fall back to an `ElementPart`. Deterministic
spread expressions are evaluated during both renders and do not need a separate
hydration payload; request-only state still uses the normal LitSX resource/root
payload mechanisms. Applications that render hydratable spreads must pair the
LitSX SSR render APIs with `hydratePage()`.

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

## Hooks and host capabilities

Hook signatures are ordinary authored JavaScript signatures. LitSX does not
prepend a hidden host parameter to hook definitions or callsites:

```tsx
export function useTranslatedLabel(key: string) {
  const host = useHost();
  const [locale] = useState(host.locale);
  return translate(locale, key);
}

export function SaveButton() {
  const label = useTranslatedLabel("save");
  return <button>{label}</button>;
}
```

`useHost()` is the only authored API for reading the current component host.
Hooks run synchronously inside the generated render boundary; the compiler owns
that boundary and its controller cursor. `renderWithHooks`,
`readStructuralHook`, and `applyStructuralHooks` are the public low-level ABI
used by generated modules; ordinary application components do not need to call
them. Hook cursor and host-context machinery stays private to the runtime.

An asynchronous continuation does not retain an implicit render host. Capture
the state setter, controller, or host synchronously and request an update when
the async result changes renderable state. This keeps request-local SSR context
and concurrent renders isolated.

Use a structural hook when a hook requires a capability on the generated class:

```tsx
const I18nMixin = (Base) => class extends Base {
  i18n = createI18nController(this);
};

export const useI18n = defineHook({
  mixin: I18nMixin,
  use() {
    return useHost().i18n;
  },
});
```

The compiler installs structural mixins in first-callsite order and deduplicates
them by mixin identity. Custom hooks propagate this requirement through
compiler-generated metadata; no structural metadata is authored manually.

When a mixin only contributes lifecycle or class behavior, omit the reader:

```tsx
const useFormAssociation = defineHook({ mixin: FormAssociationMixin });

export function FormControl() {
  useFormAssociation(); // void
  return <input />;
}
```

LitSX does not return the shared host or infer a snapshot from the mixin's
reactive properties. Add an explicit `use()` reader when a callsite needs a
value. This keeps capability surfaces intentional when several mixins compose
on the same generated class.

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

## Lazy custom elements

Native LitSX uses the same lean component syntax for lazy imports:

```tsx
import { lazy } from "@litsx/core";

const ResultsPanel = lazy(() => import("./results-panel.js"));

export function SearchCard() {
  return <ResultsPanel />;
}
```

The compiler lowers `lazy()` to a loader, emits the lowercase host tag, enables
the component's scoped registry, and generates `ensureLazyElement` internally.
`static elements` only receives resolved eager constructors; the lazy loader is
never exposed there. Once the dynamic import resolves, its default export is
defined in the host registry and an update is requested.

## React compatibility boundary

`@litsx/babel-preset-react-compat` is an optional source-migration layer. It owns
React-specific aliases and behavior such as `className`, `htmlFor`, `onClick`,
`key`, `.current`, `createRef`, `forwardRef`, context, wrappers, and supported
hooks. Native LitSX authoring should not adopt those forms merely because the
compatibility compiler can consume them.

React compatibility lowers migrated components to light DOM by default so React-style nesting and global CSS continue to work. Consumers can opt into shadow roots with `domMode: "shadow"`; see the [react-compat option reference](./packages/babel-preset-react-compat/README.md#options). This migration default does not change the native LitSX DOM-mode contract.

The final output of both pipelines is Lit: Lit elements, Lit templates, Lit
directives, and web-component lifecycle semantics.
