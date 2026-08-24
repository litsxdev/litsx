# UnoCSS integration design validation

Date: 2026-08-24
UnoCSS: 66.8.1

## Result

LitSX does not need an UnoCSS-specific compiler phase. The generic
`authoringPlugins` hook consumes component-owned static guards before native
lowering, while `outputPlugins` attaches component utility `CSSResult` values.
The build-tool-neutral engine owns extraction, per-component materialization,
preflight routing and document CSS generation. The Vite adapter maps that
engine onto Vite modules and HMR while reusing one resolved UnoCSS context and
generator lifecycle.

The integration has two deliberate destinations:

- `component` produces the preflight layers and utilities that must live in a
  component stylesheet, including styles inside shadow roots.
- `global` produces one document stylesheet containing its routed preflight
  layers and document-owned utilities.

The default routes every preflight layer except `theme` to `component` and all
layers to `global`. Wind4 theme custom properties are therefore declared once
at document level and inherit through nested shadow roots instead of being
reset by each component. Reset and property layers that must cross a shadow
boundary remain in the component output.

The integration verifies:

- existing `Component.styles` composition and components without authored
  styles
- multiple components per module with isolated utility literals
- native and react-compat compilation
- Shadow DOM and scoped/global/disabled light-DOM routing
- client and SSR Vite builds, hydration and sourcemaps
- real Lit SSR rendering with generated component styles
- one component preflight module shared by compiled modules in production
- destination-aware preflight defaults and custom layer selectors
- Wind4 theme variables inherited through two nested shadow roots
- one document sheet generated from the same context as component styles
- independent all-token and global-utility token views
- no duplication of shadow-owned utilities into document CSS
- initial and lazy-module global utilities in Vite development and production
- external `uno.config` resolution and configuration invalidation
- exact-export static guards, aliases, barrels and transitive values
- finite local and imported class expressions without duplicated style guards
- component-local safelist projection for non-finite class patterns
- removal of authoring guards from runtime `CSSResultGroup` values
- preservation of authored strings, templates, regular expressions and
  comments that happen to contain the former `@unocss-placeholder` text
- generic pre/post-LitSX plugin ordering in Storybook

## Granularity and ownership

The output plugin inspects each generated component independently and encodes
only complete utility candidates from that component's `class`/`className`
bindings. The build engine replaces each opaque internal marker with a
stylesheet owned by that component. It never uses a whole-module extraction
result as a shadow-root stylesheet.

An explicit static value in `Component.styles` follows a more precise path.
The authoring plugin resolves only that symbol or export, replaces it with an
internal `CSSResult` marker, and records its candidates and source descriptor.
The build engine refreshes the exact export, generates utility-only CSS for
that marker and replaces it in the same materialization pass. No module-wide
export scanning or user-code execution is involved.

Markup and guard markers share an owner identity. Their candidate union is
deduplicated per owner, so a utility declared through both routes is emitted
once without affecting sibling components. A guard shared by two components
is materialized once for each owner because each shadow root needs its own
stylesheet.

Finite values referenced directly by a class binding follow the same ownership
rule without requiring a duplicate `Component.styles` entry. The output marker
records only the exact expression and its dependencies. The engine refreshes
that expression when an imported dependency changes; it never scans the whole
module or includes sibling bindings.

This callsite-driven form is the primary authoring contract. A finite utility
map referenced by markup should not also be listed in `Component.styles`.
`Component.styles` remains the escape hatch for opaque or non-finite bindings
and the normal home for authored Lit CSS.

Non-finite class bindings retain their static shape as an internal pattern.
The engine matches the configured safelist against that shape and adds only
matching entries to the owning component. It does not copy the complete
safelist into every shadow root.

The engine maintains two token views:

- `tokens` contains every candidate. Token-dependent preflight generation uses
  this complete view, including component-only colors needed by Wind4 theme
  variables.
- `globalTokens` contains candidates whose utility rules belong in document
  CSS. Component-owned shadow utilities do not enter this set merely because
  the engine had to inspect them.

This distinction prevents global extraction from leaking utilities between
two components in the same file while still giving preflight generation all
the information it needs.

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

Utility rules may intentionally exist in two component sheets when both
shadow roots use them; document CSS cannot style through those boundaries.
They are never duplicated twice within one owner. Destination routing removes
the global `theme` layer from each component sheet, reducing repeated SSR HTML
and avoiding local custom-property resets.

## Vite lifecycle

Production materializes component modules after the complete module graph is
known. The component virtual module receives component-routed preflight; the
LitSX-owned `virtual:uno.css` module receives global-routed preflight plus
document-owned utilities. A controlled internal build sentinel allows final
CSS generation after collection without replacing arbitrary authored source.

Vite serve creates component snapshots after each importing module has been
extracted and invalidates affected component and global modules when tokens,
guards or configuration change. The global virtual module is materialized by
the LitSX adapter rather than delegated to a second UnoCSS plugin instance.
This closes the startup ordering problem where a virtual sheet could be
evaluated before later modules contributed token-dependent Wind4 colors.

Both destinations use UnoCSS's official config resolution, extraction and
generator APIs. LitSX owns destination routing and lifecycle finalization; it
does not parse or rewrite generated CSS to infer ownership.

The combined `litsxUnoCss()` API passes one integration configuration to the
compiler and Vite halves. Split integrations such as Storybook must pass the
same options to `withUnoCssViteCompiler()` and `createUnoCssVitePlugins()`.

## SSR and hydration

SSR serializes component-routed reset/property layers and utilities into each
declarative shadow root. Globally routed theme variables belong in the
document stylesheet and inherit into nested shadow trees. Hydration reuses the
server nodes and their scoped metadata; it does not need to recreate hosts to
apply either destination.

In normal Vite builds, the compiler contribution imports the global sheet so
the browser entry emits it once. An SSR framework links that generated CSS
asset in the document head like any other Vite stylesheet. Framework adapters
that set `globalCssModule: false` take ownership of calling
`generateGlobalCss()` and emitting or linking its result once.

## Generic LitSX surface

The generic compiler surface defines light-DOM routing only:

- `lightDomStyles: "scoped"` emits a stable scope identity and is the default.
- `lightDomStyles: "global"` routes integration output to a document sheet.
- `lightDomStyles: "none"` suppresses automatic light-DOM integration output.

Preflight layer selection and document-module ownership remain UnoCSS adapter
concerns. The generic hooks otherwise remain sufficient:

- `authoringPlugins` consumes extension-owned values before native lowering.
- `outputPlugins` augments generated component classes.
- compiler options flow through client and SSR Vite transforms.
- result metadata records the applied style integration.

Storybook exposes generic `vitePlugins.beforeLitsx` and
`vitePlugins.afterLitsx` phases. These phases are useful to any source analyzer
or generated-output processor and contain no UnoCSS-specific behavior.

## Build-tool boundary

`createUnoCssBuildEngine()` owns behavior that must be identical in every
tool:

- candidate extraction and per-component token ownership
- separate all-token and global-utility token views
- component marker materialization
- exact-export guard resolution and dependency tracking
- utility-only CSS generation and component-local safelist matching
- destination-aware preflight generation
- complete document CSS generation
- component preflight module generation and controlled build finalization
- dependency invalidation lookup

`@litsx/unocss/vite` owns Vite policy: official config/context discovery,
plugin ordering, virtual-id allocation, module-graph invalidation and HMR.
Rollup, webpack or esbuild adapters can map their lifecycle onto the same
engine without importing Vite or relying on an author-visible placeholder.
