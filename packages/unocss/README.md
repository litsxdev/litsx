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
token set. By default, LitSX routes the `theme` layer to the document sheet and
omits it from component shadow styles. Other preflight layers remain available
inside shadow roots. This lets custom properties such as Wind4 colors inherit
through nested shadow roots instead of being reset by a repeated `:host`
declaration. Production emits the document sheet after the complete module
graph has been collected. Vite development invalidates both destinations when
tokens or configuration change. External `uno.config` files are followed.

The Vite compiler contribution imports the global sheet for generated
components, so the normal `litsxUnoCss()` setup emits it once without an
additional authored import. Set `integration.globalCssModule: false` only when
the framework owns document CSS generation itself.

Layer ownership can be overridden without inspecting or rewriting generated
CSS:

```js
litsxUnoCss({
  integration: {
    preflightLayers: {
      component: ({ layer }) => layer !== "tokens",
      global: ["tokens"],
    },
  },
});
```

Selectors receive `{ layer, destination, layers }`. Both outputs reuse the
same resolved UnoCSS context, token store and invalidation lifecycle.

The default policy is equivalent to:

```js
{
  component: ({ layer }) => layer !== "theme",
  global: () => true,
}
```

`theme` is an UnoCSS layer name, not a Wind-specific CSS inspection rule. A
different preset can route its own layer names with the same API.

## Vite API

### `litsxUnoCss(options?)`

This is the recommended entrypoint. It keeps compiler and Vite integration
options synchronized:

```js
litsxUnoCss({
  litsx: {
    lightDomStyles: "scoped",
  },
  unocss: {
    presets: [presetWind4()],
  },
  integration: {
    globalCssModule: "virtual:uno.css",
    preflightLayers: {
      component: ({ layer }) => layer !== "theme",
      global: () => true,
    },
  },
});
```

`integration` accepts:

- `preflightLayers.component`: layer-name array or predicate for component and
  shadow-root preflight output.
- `preflightLayers.global`: layer-name array or predicate for document output.
- `globalCssModule`: module imported as the document stylesheet. Vite defaults
  this to `virtual:uno.css`; `false` delegates document CSS ownership to the
  surrounding framework.
- `preflightModule`: virtual JavaScript module that exports the component
  preflight `CSSResult`. The Vite default is managed internally.
- `lightDomStyles`: integration-level fallback for `scoped`, `global` or
  `none`; the top-level LitSX compiler option takes precedence.

### `withUnoCssViteCompiler()` and `createUnoCssVitePlugins()`

Use the split API when another tool, such as Storybook, owns plugin ordering.
Pass the same integration object to both functions:

```js
const integration = {
  preflightLayers: {
    component: ({ layer }) => layer !== "theme",
    global: () => true,
  },
};

const compiler = withUnoCssViteCompiler({}, integration);
const vitePlugins = createUnoCssVitePlugins(
  { presets: [presetWind4()] },
  integration,
);
```

Calling `withUnoCssCompiler()` directly remains build-tool neutral and does
not inject a Vite global CSS module unless `globalCssModule` is provided.

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
- `global` omits component-local generated utility sheets and routes the
  project utilities through the shared document sheet.
- `none` omits automatic component-local UnoCSS sheets for light-DOM
  components. Set `integration.globalCssModule: false` as well when the Vite
  compiler must not add the shared document sheet.

Authored `Component.styles` values are preserved in every mode. Shadow-DOM
components always keep component-local utility sheets because document CSS
cannot cross a shadow boundary.

The React compatibility pipeline always selects `global`: migrated React trees
expect document-level CSS rather than per-component selector boundaries.

Projects can still import the standard global sheet explicitly from ordinary
browser modules that are not compiled as LitSX components:

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

const integration = {
  preflightLayers: {
    component: ({ layer }) => layer !== "theme",
    global: () => true,
  },
};

const unocss = await createUnoCssIntegration(
  { presets: [presetWind4()] },
  integration,
);

const compiled = await transformLitsx(
  source,
  withUnoCssCompiler(
    { filename: id },
    { ...integration, preflightModule: UNO_CSS_PREFLIGHT_MODULE_ID },
  ),
);

const module = await unocss.materializeModule(compiled.code, id);
const preflightCss = await unocss.generatePreflight();
const preflightModule = unocss.createPreflightModuleSource(preflightCss);
const documentCss = await unocss.generateGlobalCss();
```

`generatePreflight()` returns the component/shadow destination.
`generatePreflightFor("global")` returns only globally routed preflight layers,
and `generateGlobalCss()` combines those layers with global utilities.
The engine exposes two token views: `tokens` contains all candidates used to
resolve token-dependent preflights, while `globalTokens` contains only utility
candidates whose rules belong in document CSS. `collect()` contributes to both
views. Adapters can call `scan(code, id, { global: false })` for component-only
sources so their utility rules are not duplicated globally.

`materializeModule()` performs the complete module-local operation: it
materializes component-owned markup candidates, resolves component-owned
static guards, generates utility-only CSS, replaces LitSX markers, and returns
the files that the build tool should watch. `invalidate(file)` returns the module ids
affected by a changed static dependency.

The adapter owns only build lifecycle policy. Production adapters typically
collect and materialize every module before generating the component preflight
module and document CSS. Development adapters can create per-module component
snapshots and invalidate both component and global virtual modules when their
token views change. Passing a config directly to `createUnoCssIntegration()`
does not search the filesystem for an `uno.config`; config-file discovery
belongs to the build adapter. The Vite adapter uses UnoCSS's official config
resolution and preserves that behavior.

Vite and `@litsx/vite-plugin` are optional peers. They are required only when
importing `@litsx/unocss/vite`.

## Static class expressions and explicit guards

Finite bindings referenced by a component's `class` or `className` markup are
resolved automatically. The reference itself establishes component ownership;
the integration does not scan unrelated strings or sibling components:

```tsx
const BASE_CLASSES = "inline-flex items-center";
const SIZE_CLASSES = {
  sm: "h-8 px-3",
  lg: "h-12 px-6",
};

export function Button({ size = "sm" }) {
  return <button class={`${BASE_CLASSES} ${SIZE_CLASSES[size]}`}>Save</button>;
}
```

Local constants, finite maps, constant composition and exact resolvable imports
are supported. Imported dependencies are watched and refreshed without pulling
other exports into the component sheet. Repeating these bindings in
`Component.styles` is unnecessary; if both routes contain the same candidate,
it is emitted once.

This is the recommended authoring form for a finite set of variants. Keep the
runtime lookup and the utility inventory in one map and reference that map from
`class`/`className`; do not repeat it in `Component.styles`:

```tsx
const APPEARANCE_CLASSES = {
  default: "bg-slate-100 text-slate-900",
  primary: "bg-blue-600 text-white",
  danger: "bg-red-600 text-white",
} as const;

export function Button({ appearance = "default" }) {
  return <button class={APPEARANCE_CLASSES[appearance]}>Save</button>;
}
```

Reserve `Component.styles` for authored Lit CSS and for explicit guards when
the class expression is opaque or cannot be finitely resolved. This keeps
component ownership explicit without maintaining the same utility inventory
twice.

### Explicit guards

An imported static utility map can be assigned to `Component.styles` to make
utilities available when their runtime class expression cannot be enumerated:

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

export function Button({ className }) {
  return <button class={className}>Save</button>;
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

`BUTTON_SIZE_CLASSES` is an explicit authoring guard, not a runtime Lit style. The
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

UnoCSS automatically extracts complete utility strings reachable from a
component's `class`/`className` markup, including local constants, finite maps,
exact imports and literal branches such as ternaries. Wind4 arbitrary variants
such as `data-[size=lg]:h-12` are supported as well. It does not scan every
string in the source module: doing so would leak unrelated values and
sibling-component utilities into each shadow root.

Runtime-generated names and opaque values need an explicit finite source, as in
every UnoCSS integration. Declare that source in `Component.styles`:

```tsx
const colors = ["bg-red-600", "bg-blue-600"];

export function Button({ color }) {
  return <button class={`bg-${color}-600`}>Save</button>;
}

Button.styles = [colors];
```

A module may contain both compiled LitSX components and free light-DOM
templates, including Storybook `render` functions. The compiler records the
free-template candidates as a separate global contribution: utilities used by
the story reach `virtual:uno.css`, while utilities owned only by a shadow
component remain in that component's `CSSResult`.

A project `safelist` belongs to the shared token/preflight calculation and the
global `virtual:uno.css` sheet when document output is enabled. For a
non-finite component binding, LitSX also projects only matching safelist
entries into that component. For example, `bg-${color}-600` selects
`bg-red-600` but not `text-white` from the same safelist. A fully opaque
`class={value}` has no safe static shape to match; enumerate its finite values
through `Component.styles` instead.

Strings in imported helpers are not discovered merely because render code
imports them. Only an exact binding referenced by the class expression is
followed. Add an otherwise opaque helper export to `Component.styles` when its
values cannot be reached statically from that expression.

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

const integration = {
  preflightLayers: {
    component: ({ layer }) => layer !== "theme",
    global: () => true,
  },
};

export default createLitsxStorybookConfig({
  compiler: withUnoCssViteCompiler({}, integration),
  vitePlugins: {
    afterLitsx: createUnoCssVitePlugins(
      { presets: [presetWind3()] },
      integration,
    ),
  },
});
```

The same `integration` object must reach both halves of the split API. Omit it
from both calls when the defaults are sufficient.

`virtual:uno.css` is a side-effect CSS entry. Keep it as a bare import in the
preview or application entry; LitSX preserves that import through compilation,
so Vite links the emitted stylesheet in production and retains it across dev
updates. Ordinary CSS imports beside it remain independently owned by Vite.
Utilities in dynamically imported story components stay in the corresponding
component output, while the linked global sheet supplies document utilities and
theme variables.

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
every component the same constructible stylesheet. Vite serve uses
per-module snapshots. During SSR, component-routed reset/property layers are
serialized inside declarative shadow roots, while globally routed theme layers
belong to the document stylesheet and inherit across those roots.

In `scoped` mode, `LightDomMixin` installs the generated `CSSResult` in the
component host. SSR serializes the stable scope attribute so hydration uses the
same boundary without replacing the host. A document-level stylesheet is
still required when utility styling must be visible before a client-only
light-DOM component has initialized. The shared `virtual:uno.css` sheet also
covers page shells, third-party light DOM and other markup outside LitSX hosts.

The global sheet is a normal Vite CSS asset in production. SSR frameworks
should link the CSS emitted for the browser entry in the document head, just
as they would for any other imported stylesheet. Shadow roots receive only the
preflight layers routed to `component`; globally routed custom properties can
inherit through those roots. A framework using `globalCssModule: false` must
call `generateGlobalCss()` (or provide an equivalent adapter hook) and emit or
link that result once at document level.
