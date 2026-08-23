# UnoCSS integration design validation

Date: 2026-08-21
UnoCSS: 66.8.1

## Result

LitSX does not need an UnoCSS-specific compiler phase. The existing generic
`authoringPlugins` hook consumes component-owned static guards before native
lowering, while `outputPlugins` attaches a component utility `CSSResult`. The
build-tool-neutral engine materializes component utilities and
imports one project-level virtual `CSSResult` containing the resolved
preflight. The Vite adapter maps this engine onto the official UnoCSS context,
virtual modules and HMR.

The integration verifies:

- existing `Component.styles` composition
- components without authored styles
- multiple components per module with isolated CSS literals
- native and react-compat compilation
- Shadow DOM and light DOM classes
- client and SSR Vite builds
- real Lit SSR rendering with the generated CSS
- sourcemaps
- composition and idempotence with other output plugins
- modules without LitSX components
- generic pre/post-LitSX plugin ordering in Storybook
- one preflight module shared by independently compiled component modules
- SSR serialization of the shared preflight inside each declarative shadow root
- token-dependent Wind4 theme variables
- external `uno.config` resolution
- development snapshots and invalidation when new tokens appear
- shared output across multiple build entrypoints
- computed styles after SSR hydration in real Chromium for Shadow and Light DOM
- nested light-DOM utility isolation with stable compiler-generated scopes
- the standard `virtual:uno.css` global sheet from the same context used for
  component Shadow DOM styles
- initial and lazy-module global light-DOM utilities in real Chromium
- exact-export static guards, including aliases, barrels and transitive values
- removal of authoring guards from runtime `CSSResultGroup` values
- per-guard utility generation and helper dependency invalidation in HMR

## Granularity

The output plugin inspects each generated component independently and encodes
only complete utility candidates from that component's `class`/`className`
template bindings. The build engine replaces each marker with a stylesheet
owned by that component. It never uses a whole-module extraction result as a
shadow-root stylesheet.

An explicit static value in `Component.styles` follows a more precise path.
The authoring plugin resolves only that symbol/export, replaces it with an
internal CSSResult marker, and records its candidates and source descriptor.
The build engine refreshes the exact export, generates utility-only CSS for
that marker, and replaces it in the same materialization pass. Each guard
therefore remains owned by the component whose styles declaration names it; no
module-wide export scanning or user-code execution is involved.

Markup and explicit guard markers share an owner identity. The build engine
deduplicates their candidate union per owner, so a utility declared through
both routes is emitted once without affecting sibling components.

Non-finite class bindings retain their static shape as an internal pattern.
The engine matches the configured safelist against that shape and adds only
matching entries to the owning component. It does not copy the complete
safelist into every shadow root.

Shadow components keep one CSS copy per component in the JavaScript module.
Scoped light-DOM components receive a component-owned marker whose rules are wrapped in CSS
`@scope`; the nearest nested LitSX scope is the end boundary. Components in the
same file receive separate candidate sets. Unrelated strings, unowned maps and
the candidates of sibling components are not injected.

## Size measurement

For the fixture utilities:

```text
px-4 bg-red-500 text-white p-8 shadow-lg
```

`presetWind3` generated:

| Output                       |     Raw |  Gzip |
| ---------------------------- | ------: | ----: |
| Shared preflight             | 2,158 B | 409 B |
| Utilities without preflights |   520 B | 259 B |
| Utilities with preflights    | 2,679 B | 585 B |

The virtual module keeps the 2,158-byte preflight shared. Each component then
contains only its utility subset. Utility rules may intentionally exist in two
different component sheets when both shadow roots use them; they cannot be
shared through document CSS. They are never duplicated twice inside the same
component sheet.

The adapter collects the token set through UnoCSS's own resolved context and
attaches a generated preflight `CSSResult` alongside each module's utility-only
sheet. Build output is materialized once after module transformation, when all
entrypoint tokens are known, so production shares one project-level virtual
module. During Vite serve, each importing component module resolves a distinct
preflight snapshot after its own tokens have been extracted. This avoids an
early ESM evaluation retaining a stale `CSSResult` when a lazy module later
introduces a Wind4 theme variable. Development invalidates those snapshots when
UnoCSS sees new tokens or reloads configuration. Preset preflights are removed
from the independently generated shadow utility styles only after UnoCSS has
resolved the complete preset configuration; merely passing `preflights: []`
is insufficient because UnoCSS merges preset entries.

When an application imports `virtual:uno.css`, the adapter composes UnoCSS's
official global build and development plugins onto that same resolved context.
The global sheet and LitSX component sheets therefore share configuration,
tokens, safelist and preflight resolution without running two UnoCSS instances.
The official development hash handshake also closes the startup race where the
global CSS module can load before a later static or dynamic module contributes
its tokens.

SSR must still serialize styles into each declarative shadow root. Repeated
preflight compresses well over the wire, but it still affects generated HTML
and parsing cost. A follow-up can measure large repeated SSR trees before
choosing whether to keep the full Wind preflight or generate a smaller
design-system preflight.

## Generic LitSX surface

The generic compiler surface now also defines the light-DOM routing policy:

- `lightDomStyles: "scoped"` emits a stable scope identity and is the default.
- `lightDomStyles: "global"` routes integration output to a document sheet.
- `lightDomStyles: "none"` suppresses automatic light-DOM integration output.

The remaining generic hooks were sufficient:

- `authoringPlugins` consumes extension-owned values before native lowering.
- `outputPlugins` augments generated component classes.
- compiler options already flow through client and SSR Vite transforms.
- result metadata records the applied style integration.

Storybook did need generic ordering for build-tool plugins. Its configuration
now accepts `vitePlugins.beforeLitsx` and `vitePlugins.afterLitsx`. These phases
are useful to any source analyzer or generated-output processor and contain no
UnoCSS-specific behavior.

## Build-tool boundary

`createUnoCssBuildEngine()` owns the behavior that must be identical in every
tool:

- candidate extraction and per-component token ownership
- component marker materialization
- exact-export guard resolution and dependency tracking
- utility-only CSS generation
- resolved preflight generation
- complete global CSS generation for non-Vite adapters
- virtual preflight module source and final placeholder replacement
- dependency invalidation lookup

`@litsx/unocss/vite` owns only Vite policy: official config/context discovery,
plugin ordering, virtual-id allocation, `moduleGraph` invalidation and HMR
messages. Rollup, webpack or esbuild adapters can map their lifecycle directly
onto the same engine without importing `vite` or `@litsx/vite-plugin`.
