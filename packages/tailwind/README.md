# `@litsx/tailwind`

Tailwind CSS v4 utilities for LitSX shadow DOM and light DOM components. The
root export is a build-tool-neutral LitSX integration. A separate `/vite`
entrypoint keeps the existing adapter based on the official Vite plugin.

## Installation

For Evolit or another neutral LitSX host:

```bash
npm install @litsx/tailwind
```

For Vite, install the optional peer tooling too:

```bash
npm install -D @litsx/tailwind @litsx/vite-plugin \
  @tailwindcss/vite tailwindcss vite
```

The Vite adapter supports Tailwind CSS 4.3+, Vite 7.3 or 8, and LitSX 1.0.
Consumers of the neutral root entrypoint do not need Vite,
`@tailwindcss/vite`, or an application-owned PostCSS pipeline.

## Evolit quick start

```js
// evolit.config.js
import { litsxTailwind } from "@litsx/tailwind";
import { defineEvolitConfig } from "evolit/litsx";

export default defineEvolitConfig({
  litsx: {
    compiler: { sourceMaps: true },
    integrations: [
      litsxTailwind({
        integration: { entry: "./src/tailwind.css" },
      }),
    ],
  },
});
```

```css
/* src/tailwind.css */
@import "tailwindcss" source(none);

@theme {
  --color-brand: oklch(62% 0.18 255);
}
```

This single declaration contributes the native LitSX compiler plugins,
materializes component and preflight virtual modules, watches the Tailwind
entry and its imports, removes stale candidates, and declares the final
document stylesheet. Evolit runs the same instance lifecycle for development,
SSR, hydration, production and standalone execution.

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

The main `@litsx/tailwind` entrypoint is build-tool-neutral and uses Tailwind's
public Node compilation API. It does not import Evolit, Vite, or
`@tailwindcss/vite`. The `/vite` entrypoint remains available and composes the
same compiler protocol with Tailwind's official Vite plugin.

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

- `litsxTailwind(options?)`, the complete single-declaration integration for
  Evolit and other hosts implementing the LitSX build lifecycle;
- `createTailwindBuildEngine(context)` for lower-level neutral hosts;

- `createTailwindContext(options?)` for the shared project-level candidate and
  virtual-module registry;
- `createTailwindAuthoringPlugin(options?)` for authored class analysis;
- `createTailwindOutputPlugin(context, options?)` for compiler-output routing;
- `withTailwindCompiler(options, context, integration?)` to add both compiler
  contributions to an existing `TransformLitsxOptions` object.

Ordinary Evolit applications should use `litsxTailwind()`. Lower-level hosts
must create one integration instance per server, build, or runtime. Candidate
registries and compiler state are instance-owned, so concurrent projects and
requests do not share mutable state.

The neutral integration declares two final outputs:

- `preflight.js`, a virtual JavaScript module containing Shadow Root preflight;
- `global.css`, one document stylesheet containing theme/custom properties,
  document preflight, Tailwind property registrations, and global utilities.

Component utilities remain in their individual virtual modules. Theme rules
are removed from the Shadow Root preflight so variables are emitted once in
the document and inherited across the shadow boundary. `@property` rules are
likewise hoisted once to the document output. Authored `Component.styles`
remain between preflight and generated utilities.

On invalidation the host can rebuild the affected virtual modules immediately;
`forget` removes candidates for graph modules that disappeared, and `dispose`
clears all instance state. Errors thrown by Tailwind retain the host's
integration/hook/module context.

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

The root `litsxTailwind()` accepts `integration`, `preflightOutput`, and
`globalCssOutput`. `integration` contains `entry`, `sources`, and `safelist`.
The `/vite` function additionally accepts `litsx` and `tailwind` options for
its two Vite plugins.

With `/vite`, `sources` feeds the shared infrastructure so lazy modules have
the required Tailwind property registrations before they are imported. A
neutral graph host such as Evolit discovers those registrations from all LitSX
modules before `finalize`, so no extra source scan is needed. `sources` is not
a fallback global utility scanner. Exact component utilities come exclusively
from that component's markup, finite guards and matching safelist entries;
utilities in free light-DOM JSX are routed separately to the global sheet.
