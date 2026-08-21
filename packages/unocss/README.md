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

The adapter compiles LitSX first and adds one UnoCSS Shadow DOM placeholder per
module for utilities found directly in that module. A project-level virtual
import exports the preflight as a second `CSSResult`, preventing every
production component module from embedding its own reset. Existing
`Component.styles` values are preserved between the preflight and generated
utilities.

The preflight is generated from UnoCSS's resolved project configuration and
token set. Production emits one shared stylesheet after the complete module
graph has been collected. Vite development gives each component module a
preflight snapshot after extracting that module, so a lazily imported module
can introduce token-dependent theme variables such as Wind4 colors without
retaining an already evaluated, stale virtual module. External `uno.config`
files are followed and the development snapshots are invalidated when tokens
or configuration change.

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

const compiled = await transformLitsx(source, withUnoCssCompiler(
  { filename: id },
  { preflightModule: UNO_CSS_PREFLIGHT_MODULE_ID },
));

const module = await unocss.materializeModule(compiled.code, id);
const preflightCss = await unocss.generatePreflight();
const preflightModule = unocss.createPreflightModuleSource(preflightCss);
```

`materializeModule()` performs the complete module-local operation: it
extracts ordinary utility candidates, resolves component-owned static guards,
generates utility-only CSS, replaces LitSX placeholders, and returns the files
that the build tool should watch. `invalidate(file)` returns the module ids
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

UnoCSS extracts every statically enumerable utility string that remains in a
component module. The string does not have to be written directly on a JSX
attribute: constants, lookup maps and ternary branches in that module are
supported. Wind4 arbitrary variants such as
`data-[size=lg]:h-12` are supported as well.

Runtime-generated names still need a finite static source, as in every UnoCSS
integration. A project `safelist` is included in generated component styles,
but it is project-wide and therefore appears in every shadow-root stylesheet.
To keep the output local, enumerate the possible names in the component module
instead:

```tsx
const sizes = {
  sm: "h-8 px-3",
  md: "h-10 px-4",
  lg: "h-12 px-6",
};

export function Button({ size = "md" }) {
  return <button class={sizes[size]}>Save</button>;
}
```

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

Utilities discovered normally from JSX remain module-granular because LitSX
emits one ordinary utility placeholder per source module. Explicit
`Component.styles` guards are materialized independently, so each component
receives only the selected export's reachable utility rules. A shared guard can
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

Light DOM components use the same generated `CSSResult`; `LightDomMixin`
installs it in the component host. The adapter intentionally does not expose
UnoCSS's `virtual:uno.css`, because the official integration cannot run global
and shadow-dom modes from the same instance. A project-wide light-DOM sheet is
therefore a separate integration concern; it is not required for LitSX light
DOM components themselves.
