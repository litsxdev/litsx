# `@litsx/unocss`

UnoCSS integration for LitSX components.

The package is build-tool neutral. `@litsx/unocss` contains the compiler
contribution and the stateful generation engine; `@litsx/unocss/vite` is a
thin adapter that maps that engine onto Vite modules and HMR.

```js
import { presetWind3 } from "unocss";
import { defineConfig } from "vite";
import { litsxUnoCss } from "@litsx/unocss/vite";

export default defineConfig({
  plugins: litsxUnoCss({
    unocss: {
      presets: [presetWind3()],
    },
  }),
});
```

The adapter compiles LitSX first and adds one UnoCSS marker per component for
utilities found in that component's `class`/`className` markup. A project-level
virtual import exports the preflight as a second `CSSResult`, preventing every
production component module from embedding its own reset. Existing
`Component.styles` values are preserved between the preflight and generated
utilities.

UnoCSS participates in LitSX's normal inheritance order: inherited/mixin
styles and authored component styles precede the generated utility sheet.
`replaceStyles(...)` removes inherited styles but still allows the component's
UnoCSS utilities (and the shared preflight, when configured) to be appended.

The preflight is generated from UnoCSS's resolved project configuration and
token set. Production emits one shared stylesheet after the complete module
graph has been collected. Vite development gives each component module a
preflight snapshot after extracting that module, so a lazily imported module
can introduce token-dependent theme variables such as Wind4 colors without
retaining an already evaluated, stale virtual module. External `uno.config`
files are followed and the development snapshots are invalidated when tokens
or configuration change.

## Light DOM routing

LitSX exposes one generic compiler option for generated light-DOM styles:

```js
litsxUnoCss({
  litsx: {
    lightDomStyles: "scoped", // "scoped" | "global" | "none"
  },
});
```

- `scoped` is the default. Each light-DOM component receives a stable
  short opaque `data-litsx-style-scope` identity and its utility rules are
  emitted in a CSS `@scope` with a nested-component boundary. The full
  component host identity remains available as runtime metadata without being
  repeated in HTML and CSS. Parent utilities therefore do not select matching
  classes inside nested light-DOM components.
- `global` omits component-local generated utility sheets. Import
  `virtual:uno.css` once from the browser entry to apply the shared project
  utilities and preflight.
- `none` omits automatic UnoCSS sheets for light-DOM components. An explicit
  `virtual:uno.css` import remains an explicit request for global UnoCSS and is
  independent of this automatic component route.

Authored `Component.styles` values are preserved in every mode. Shadow-DOM
components always keep component-local utility sheets because document CSS
cannot cross a shadow boundary.

The React compatibility pipeline always selects `global`: migrated React trees
expect document-level CSS rather than per-component selector boundaries. Add
`import "virtual:uno.css"` to the browser entry when using react-compat with
UnoCSS.

Projects that also use utilities in ordinary document light DOM can import the
global sheet once from their browser entry:

```js
import "virtual:uno.css";
```

That module uses the same resolved UnoCSS configuration, extractor, token
store, safelist and preflight generator as the component styles. It does not
create a second UnoCSS instance. Production finalizes the CSS after collecting
the complete module graph; Vite development invalidates the sheet when later
modules or configuration introduce new tokens.

## Build-tool-neutral integration

Custom Rollup, webpack, esbuild and framework adapters can use the root API
without importing Vite:

```js
import { transformLitsx } from "@litsx/compiler";
import {
  createUnoCssIntegration,
  UNO_CSS_PREFLIGHT_MODULE_ID,
  withUnoCssCompiler,
} from "@litsx/unocss";
import { presetWind4 } from "unocss";

const unocss = await createUnoCssIntegration({
  presets: [presetWind4()],
});

const compiled = await transformLitsx(
  source,
  withUnoCssCompiler(
    { filename: id },
    { preflightModule: UNO_CSS_PREFLIGHT_MODULE_ID },
  ),
);

const module = await unocss.materializeModule(compiled.code, id);
const preflightCss = await unocss.generatePreflight();
const preflightModule = unocss.createPreflightModuleSource(preflightCss);
```

`materializeModule()` performs the complete module-local operation: it
materializes component-owned markup candidates, resolves component-owned
static guards, generates utility-only CSS, replaces LitSX markers, and returns
the files that the build tool should watch. `invalidate(file)` returns the module ids
affected by a changed static dependency.

The adapter owns only build lifecycle policy. Production adapters typically
collect and materialize every module before calling `generatePreflight()`;
development adapters can create per-module snapshots and invalidate their
virtual modules when the token set changes. Passing a config directly to
`createUnoCssIntegration()` does not search the filesystem for an
`uno.config`; config-file discovery belongs to the build adapter. The Vite
adapter uses UnoCSS's official config resolution and preserves that behavior.

Vite and `@litsx/vite-plugin` are optional peers. They are required only when
importing `@litsx/unocss/vite`.

## Component-owned static guards

An imported static utility map can be assigned to `Component.styles` to make
its ownership explicit:

```tsx
// button.styles.ts
export const BUTTON_SIZE_CLASSES = {
  sm: "h-8 px-3 text-sm",
  md: "h-10 px-4 text-base",
  lg: "h-12 px-6 text-lg",
} as const;

// button.tsx
import { css } from "@litsx/core";
import { BUTTON_SIZE_CLASSES } from "./button.styles";

export function Button({ size = "md" }) {
  return <button class={BUTTON_SIZE_CLASSES[size]}>Save</button>;
}

Button.styles = [
  BUTTON_SIZE_CLASSES,
  css`
    :host {
      display: inline-block;
    }
  `,
];
```

`BUTTON_SIZE_CLASSES` is an authoring guard, not a runtime Lit style. The
adapter resolves that exact export and its statically reachable dependencies,
generates a component-owned `CSSResult`, and removes the object from the
runtime `styles` value. Other exports in `button.styles.ts` are not included.

Markup and guard markers carry the component owner. If the same utility is
present in both sources, it is emitted once for that component. A guard shared
by two components is still materialized once for each owner, because each
shadow root needs its own stylesheet.

Supported sources include static strings, objects, arrays and tuples, nested
structures, static template literals, enumerable conditional branches,
constant composition, finite map indexing, named/aliased imports, reexports
and barrels. Resolution is AST-only: user modules are never executed. A cycle,
function call, or other non-finite expression produces a compile-time error.

The type augmentation is activated automatically by importing
`@litsx/unocss/vite` in the Vite configuration. Tools that typecheck component
sources separately can load it explicitly with a type-only import:

```ts
import type {} from "@litsx/unocss";
```

This widens only LitSX's authoring type. Generated classes and Lit itself still
receive `CSSResultGroup` values exclusively. Without the UnoCSS authoring
integration, a definite plain string/object guard is rejected rather than
leaking an invalid style into the browser.

## Static and dynamic utility names

UnoCSS automatically extracts complete utility strings written in a
component's `class`/`className` markup, including finite literal branches such
as ternaries. Wind4 arbitrary variants such as `data-[size=lg]:h-12` are
supported as well. It does not scan every string in the source module: doing
so would leak unrelated values and sibling-component utilities into each
shadow root.

Runtime-selected maps and runtime-generated names need an explicit finite
source, as in every UnoCSS integration. Declare that source in
`Component.styles` so ownership is unambiguous:

```tsx
const sizes = {
  sm: "h-8 px-3",
  md: "h-10 px-4",
  lg: "h-12 px-6",
};

export function Button({ size = "md" }) {
  return <button class={sizes[size]}>Save</button>;
}

Button.styles = [sizes];
```

A project `safelist` belongs to the optional global `virtual:uno.css` sheet and
the shared token/preflight calculation. For a non-finite component binding,
LitSX also projects only matching safelist entries into that component. For
example, `bg-${color}-600` selects `bg-red-600` but not `text-white` from the
same safelist. A fully opaque `class={value}` has no safe static shape to match;
enumerate its finite values through `Component.styles` instead.

Strings in imported helpers are intentionally not discovered merely because
render code imports them. Add the exact helper export to `Component.styles` to
establish ownership. This avoids treating unrelated content, configuration or
other exports from the same module as utility sources.

This package uses the compiler's generic `authoringPlugins` and
`outputPlugins` hooks. There is no UnoCSS-specific behavior in
`@litsx/compiler` or the JSX syntax.

Storybook can use the same compiler contribution and place the UnoCSS plugins
in its generic post-LitSX phase:

```js
import { createLitsxStorybookConfig } from "@litsx/storybook";
import {
  createUnoCssVitePlugins,
  withUnoCssViteCompiler,
} from "@litsx/unocss/vite";
import { presetWind3 } from "unocss";

export default createLitsxStorybookConfig({
  compiler: withUnoCssViteCompiler(),
  vitePlugins: {
    afterLitsx: createUnoCssVitePlugins({ presets: [presetWind3()] }),
  },
});
```

## Granularity and SSR

Utilities discovered from JSX and explicit `Component.styles` guards are
component-granular. Two components in one source module receive independent
utility sheets, and unrelated module strings are ignored. A shared guard can
be owned by multiple components without making sibling exports part of either
stylesheet.

During Vite development the adapter tracks
`component -> guard -> export -> static dependencies`. Editing a consumed
helper invalidates its component modules and regenerates their guard
stylesheets; obsolete utility rules are removed. Changes to unconsumed exports
may currently cause a broader module invalidation, but never broaden the set of
generated rules.

In a production browser build, importing the virtual preflight module gives
every component the same constructible stylesheet. Vite serve uses the
per-module snapshots described above. During SSR the preflight must still be
serialized inside every declarative shadow root; a document-level stylesheet
cannot cross a shadow boundary.

In `scoped` mode, `LightDomMixin` installs the generated `CSSResult` in the
component host. SSR serializes the stable scope attribute so hydration uses the
same boundary without replacing the host. A document-level stylesheet is
still required when utility styling must be visible before a client-only
light-DOM component has initialized. The optional `virtual:uno.css` import also
covers page shells, third-party light DOM and other markup outside LitSX hosts.

The global sheet is a normal Vite CSS asset in production. SSR frameworks
should link the CSS emitted for the browser entry in the document head, just
as they would for any other imported stylesheet. Shadow roots continue to
receive their shared preflight `CSSResult`, because a document stylesheet
cannot cross a shadow boundary.
