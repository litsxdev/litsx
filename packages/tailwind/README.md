# `@litsx/tailwind`

Tailwind CSS v4 utilities for LitSX shadow DOM and light DOM components. The
adapter uses the official `@tailwindcss/vite` plugin; it does not depend on
Tailwind's private programmatic compiler APIs.

## Installation

For the supported Vite integration, install the adapter and its optional peer
tooling together:

```bash
npm install -D @litsx/tailwind @litsx/vite-plugin \
  @tailwindcss/vite tailwindcss vite
```

The Vite adapter supports Tailwind CSS 4.3+, Vite 7.3 or 8, and LitSX 1.0.
Consumers of the bundler-neutral root entrypoint do not need Vite or
`@tailwindcss/vite` at runtime.

## Vite quick start

```js
// vite.config.js
import { defineConfig } from "vite";
import { litsxTailwind } from "@litsx/tailwind/vite";

export default defineConfig({
  plugins: litsxTailwind({
    integration: {
      entry: "./src/tailwind.css",
    },
  }),
});
```

```css
/* src/tailwind.css */
@import "tailwindcss" source(none);

@theme {
  --color-brand: oklch(62% 0.18 255);
}
```

The main `@litsx/tailwind` entrypoint is bundler-neutral. It exposes the
compiler contribution and integration context without importing Vite,
`@tailwindcss/vite`, PostCSS, or Tailwind itself. The `/vite` entrypoint is the
supported CSS materializer and composes the core protocol with Tailwind's
official Vite plugin.

`source(none)` is recommended because LitSX owns candidate routing. The entry
still owns theme, preflight, plugins and custom CSS.

## Public API

### `@litsx/tailwind/vite`

`litsxTailwind(options?)` is the supported high-level Vite entrypoint and returns
the complete ordered plugin array. Pass it directly inside `plugins`, as shown
above. Its options are:

- `litsx`: options forwarded to `@litsx/vite-plugin`;
- `tailwind`: options forwarded to the official `@tailwindcss/vite` plugin;
- `integration`: LitSX candidate-routing options documented below.

Advanced Vite integrations can compose the lower-level
`withTailwindViteCompiler()` and `createTailwindVitePlugins()` helpers. Pass a
shared context to both when another framework owns the LitSX plugin ordering,
as Storybook does. Ordinary applications should use `litsxTailwind()`.

### `@litsx/tailwind`

The bundler-neutral entrypoint exposes:

- `createTailwindContext(options?)` for the shared project-level candidate and
  virtual-module registry;
- `createTailwindAuthoringPlugin(options?)` for authored class analysis;
- `createTailwindOutputPlugin(context, options?)` for compiler-output routing;
- `withTailwindCompiler(options, context, integration?)` to add both compiler
  contributions to an existing `TransformLitsxOptions` object.

Framework adapters should create one context per project, configure it with the
resolved project root, and reuse it across client, SSR, and watch transforms.

## Component ownership

Literal and statically enumerable classes referenced by a component belong to
that component. This includes constants, maps, ternaries and imported finite
values:

```tsx
const SIZE = {
  sm: "h-8 px-3",
  lg: "h-12 px-6",
};

export function UiButton({ size = "sm" }) {
  return <button class={SIZE[size]}>Save</button>;
}
```

For a shadow component, only these utilities are attached to its static Lit
styles. A second component in the same source file does not receive them.

Free JSX outside a LitSX component class belongs to the document instead. This
includes Storybook `render` functions and other light-DOM templates. In a mixed
module, LitSX emits those utilities globally while keeping component-owned
utilities in the component's own shadow or light-DOM destination:

```tsx
export function UiCard() {
  return <article class="bg-brand p-4">Component</article>;
}

export const CardStory = {
  render: () => <section class="grid gap-3">Story</section>,
};
```

Here `bg-brand` and `p-4` remain owned by `UiCard`; `grid` and `gap-3` are
generated in the global stylesheet. A class used by both destinations is
generated in both because each destination must be independently usable.

Non-finite class construction needs a finite integration safelist:

```tsx
function Swatch({ color }) {
  return <span class={`bg-${color}-600`} />;
}
```

```js
litsxTailwind({
  integration: {
    safelist: ["bg-red-600", "bg-green-600"],
  },
});
```

Only entries matching this component's `bg-*-600` pattern are included in its
CSS. Unrelated safelist entries are not copied into the shadow root.

`Component.styles` remains an explicit local guard for utilities that cannot
be reached from markup. Finite strings, arrays, objects and imported constants
are consumed at build time; they are not emitted as CSS twice:

```tsx
DynamicBox.styles = [baseStyles, { red: "bg-red-600", green: "bg-green-600" }];
```

## Shadow and light DOM

Shadow components receive:

- one shared preflight CSSResult;
- one exact per-component utility CSSResult;
- inherited `Component.styles` in their normal Lit order.

The document receives preflight/theme once and an inert infrastructure sheet.
The latter lets Tailwind register global `@property` definitions needed by
utilities such as `shadow-*`, `ring-*` and `translate-*`, including components
loaded lazily. Its utility selectors are nested under an inert id and cannot
style application markup.

Light DOM uses the compiler's normal policy:

- `global` emits ordinary global utilities;
- `scoped` emits utilities inside `@scope (...) to (...)`, stopping at nested
  LitSX component roots;
- React compatibility forces `global`, consistently with its light-DOM model.

Scoped light DOM requires native CSS `@scope` support (Chrome/Edge 118+,
Safari/iOS 17.4+, Firefox 146+). Use `global` when targeting older browsers,
including Firefox ESR 140.

## Options

```ts
litsxTailwind({
  litsx: {}, // @litsx/vite-plugin options
  tailwind: {}, // official @tailwindcss/vite options
  integration: {
    entry: "./src/tailwind.css",
    sources: ["./src/**/*.{html,js,jsx,ts,tsx}"],
    safelist: [],
  },
});
```

`sources` feeds only the inert shared infrastructure so lazy modules have the
required Tailwind property registrations before they are imported. It is not a
fallback global utility scanner. Exact component utilities come exclusively
from that component's markup, finite guards and matching safelist entries;
utilities in free light-DOM JSX are routed separately to the global sheet.
