# @litsx/scoped-registry-shim

[![npm](https://img.shields.io/badge/npm-@litsx%2Fscoped--registry--shim-CB3837)](https://www.npmjs.com/package/@litsx/scoped-registry-shim)
[![Release](https://img.shields.io/badge/release-public-2ea44f)](../../RELEASING.md)
[![Module](https://img.shields.io/badge/module-ESM%20%2B%20CJS-0366d6)](./package.json)
[![Provenance](https://img.shields.io/badge/npm_provenance-enabled-2ea44f)](../../RELEASING.md)

Internal shimmed scoped-registry runtime for LitSX.

## Status

This package is published for LitSX runtime internals. Application code normally reaches it through `LightDomMixin`, not through direct calls.

Current contract:

- `LightDomMixin` activates a contextual registry when its component declares `static elements`
- the nearest light host wins, including when light and shadow hosts are nested
- the same tag can resolve to different constructors in independent contexts
- plain light DOM components without `static elements` do not activate the shim
- shadow roots remain independent scope boundaries and never inherit a surrounding light DOM registry
- shadow hosts delegate to the scoped-registry provider exposed by the platform, including a polyfill loaded before the application

## What It Is Used For Now

LitSX runtime code uses this package to provide a registry-like fallback with `define(...)` / `get(...)` semantics when:

- a shadow host needs scoped elements and the environment exposes no constructible scoped-registry provider
- a light host declares static or dynamically populated scoped elements
- a projected renderer mount is rendered into a shadow root and needs local scoped element resolution
- tests or browser fixtures need to exercise the shimmed path explicitly

The package also exposes helpers that LitSX internals and targeted tests use to:

- create shimmed registries
- upgrade existing trees against a registry
- establish temporary creation context while building DOM fragments

## Public Surface

The current exports are still available:

- `createLightDomRegistry(...)`
- `connectLightDomRegistry(...)`
- `disconnectLightDomRegistry(...)`
- `ensureLightDomProxy(...)`
- `upgradeScopedRegistryTree(...)`
- `withLightDomCreationContext(...)`

They should be treated as low-level runtime plumbing, not as the preferred authoring API for new components. Author `static elements` (or ordinary JSX component references) and let the compiler and DOM mixins manage the registry lifecycle.

Custom-element polyfills must be loaded before LitSX application modules, as is
normal for platform polyfills. Loading one after components have already
captured `HTMLElement` replaces their base platform constructor and is not a
supported initialization order.

## Attribution

[`src/index.js`](./src/index.js) includes code adapted from The Polymer Project's custom elements work. The original BSD-style attribution notice is preserved in the source file and in this package's [`NOTICE`](./NOTICE).
