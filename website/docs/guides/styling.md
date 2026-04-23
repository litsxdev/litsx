# Styling

Lit<sup>sx</sup> does not introduce a separate styling language. You style components with normal CSS, using Lit-flavored bindings where they help and web-platform primitives where they already work well.

## Styling Model

When writing Lit<sup>sx</sup>, the styling model is intentionally simple:

- use `class` to attach CSS classes from JSX
- use attributes when styling depends on component state; `data-*` is a common convention, not a requirement
- use `style` for one-off inline values
- use CSS custom properties for dynamic theme values
- keep reusable styling in CSS files, tokens, and component-level selectors

The goal is to keep styling close to the platform instead of inventing a second framework API for presentation.

Lit<sup>sx</sup> also exposes one styling hook and participates in the general static-hoist model:

- `^styles(...)` for component-owned static CSS
- `useStyle(...)` for dynamic host-level style properties and CSS custom properties

They mirror the same split that shows up elsewhere in the framework:

- static declarations belong to the component type
- dynamic values belong to render and commit

## Classes and State Selectors

For most component styling, start with classes and attributes. `data-*` works well for generic state, but normal HTML attributes and component-defined attributes are equally valid when they better match the API you want to expose.

```jsx
export function StatusPill({ tone = "neutral", active = false, label }) {
  return (
    <span
      class="status-pill"
      data-tone={tone}
      ?data-active={active}
    >
      {label}
    </span>
  );
}
```

```css
.status-pill {
  display: inline-flex;
  align-items: center;
  border-radius: 999px;
  padding: 0.25rem 0.625rem;
}

.status-pill[data-tone="success"] {
  background: var(--color-success-surface);
  color: var(--color-success-text);
}

.status-pill[data-active] {
  box-shadow: 0 0 0 2px var(--color-focus-ring);
}
```

This tends to scale better than pushing lots of visual logic into inline styles.

## Inline Styles and CSS Variables

Use `style` for values that are truly local to a render path, especially when you need to set a CSS custom property that the stylesheet will consume.

```jsx
export function AccentPanel({ accent = "tomato", children }) {
  return (
    <section class="accent-panel" style={`--panel-accent: ${accent};`}>
      {children}
    </section>
  );
}
```

```css
.accent-panel {
  border-left: 4px solid var(--panel-accent);
  padding-inline-start: 1rem;
}
```

Prefer this pattern over building large inline style objects. Let CSS keep ownership of layout, spacing, and states.

## Native Styling Helpers

The split between static CSS and dynamic values is easiest to see in a live component. In this example:

- `^styles(...)` owns the layout, selectors, and component skin
- `useStyle(...)` pushes the changing accent into `--panel-accent`
- `?data-active` gives CSS a simple state selector without moving presentation logic into JavaScript

Switch to `Emitted` to inspect how static stylesheet ownership and runtime style updates are kept separate.

<script setup>
import {
  lightDomStylingExampleSource,
  stylingExampleSource,
} from "../.vitepress/theme/components/playground-example-source.js";
</script>

<ClientOnly>
  <litsx-playground
    exportname="AccentPanel"
    previewtagname="docs-styling-accent-panel-preview"
    filename="/playground/AccentPanel.tsx"
    panelmaxheight="32rem"
  >{{ stylingExampleSource }}</litsx-playground>
</ClientOnly>

## Light DOM Styling

`^lightDom()` is also a styling decision.

Use it when a component should stay in the page's normal styling flow instead of creating a shadow boundary. That is useful when you want:

- surrounding page variables to flow through naturally
- host-level layout and typography rules to keep applying
- a component to participate directly in document-level CSS without a shadow root

In the example below:

- the host is authored with `^lightDom()`
- the component still owns static CSS through `^styles(...)`
- the result stays visually close to the page instead of behaving like an isolated shadow subtree

<ClientOnly>
  <litsx-playground
    exportname="LightDomPalette"
    previewtagname="docs-styling-light-dom-preview"
    filename="/playground/LightDomPalette.tsx"
    panelmaxheight="34rem"
  >{{ lightDomStylingExampleSource }}</litsx-playground>
</ClientOnly>

Use `^styles(...)` when the component should own a stylesheet directly from authored Lit<sup>sx</sup> code.

```jsx
^styles(`
  :host {
    display: block;
  }

  .panel {
    border-radius: 1rem;
    background: var(--panel-surface);
  }
`);
```

`^styles(...)` is not a runtime DOM mutation API. Lit<sup>sx</sup> lowers it to a memoized static getter on the generated class, so the stylesheet is resolved once per component class and still describes CSS owned by the component type rather than values that vary by render.
Like any other hoist, it must appear as a top-level statement in the component body.

Interpolations are fine when they come from static module-level values:

```jsx
const radius = "12px";

^styles(`
  .panel {
    border-radius: ${radius};
  }
`);
```

In practice, `^styles(...)` accepts:

- imports
- module-level constants
- static compositions built from other module-level constants

That is the same mental model as any `^name(...)` hoist: authored code declares static component metadata, and the transform lowers it into a memoized static getter on the generated class shape.

What it does not accept is component-scope data, even when that data looks locally constant:

```jsx
export function Panel({ radius }) {
  const localRadius = `${radius}px`;

  ^styles(`
    .panel {
      border-radius: ${localRadius};
    }
  `);

  return <section class="panel">panel</section>;
}
```

That is rejected because `localRadius` still belongs to the component scope. If a value depends on props, state, or any render-time calculation, keep the rule in `^styles(...)` and move the changing part to `useStyle(...)` or a CSS custom property.

What should not go there is anything that depends on props, state, or other component-scope values. Move those cases to `useStyle(...)`, CSS custom properties, or normal JSX style bindings.

Use `useStyle(...)` when JavaScript should provide a dynamic value that CSS will consume.

```jsx
useStyle("--panel-accent", accent);
useStyle("--panel-width", `${width}px`);
useStyle("--panel-gap", () => `${gap}px`);
useStyle("--panel-gap", () => `${gap}px`, [gap]);
```

Together, these two helpers cover the common split:

- stylesheet structure and selectors stay in CSS
- dynamic values come from state through CSS custom properties

That keeps styling aligned with the rest of Lit<sup>sx</sup>: static declarations are compile-time, dynamic values stay in the authored runtime surface.

## Shared CSS and Design Tokens

For shared styling, use CSS files directly. The Lit<sup>sx</sup> scaffolds generated by `create-litsx-app` already follow this pattern:

- shared tokens live in `src/styles/tokens.css`
- app or design-system entrypoints import those tokens once
- components consume the tokens through classes and custom properties

This works well for:

- design systems
- multi-component libraries
- themeable applications

## Styling Async UI Primitives

`SuspenseBoundary` and `SuspenseList` are designed around light DOM coordination. That means surrounding layout and typography styles can continue to flow naturally through async UI.

In practice:

- keep page-level layout styles outside the boundary
- keep typography and spacing rules on the containing component
- use the boundary to control loading and reveal behavior, not to become a styling boundary

If a region needs special loading visuals, style the fallback content you pass into the boundary just like any other Lit<sup>sx</sup> subtree.

## Practical Guidance

- prefer classes, attributes, and CSS files for reusable styling
- prefer CSS custom properties for dynamic theming
- use `style` sparingly for one-off values
- keep styling decisions in CSS and state decisions in JavaScript
- use the scaffold token files as the baseline structure for larger systems

## Where To Look Next

- [JSX Authoring](./jsx-authoring.md)
- [Reference](../reference/)
- [Primitives](./primitives.md)
- [Examples](../examples/)
