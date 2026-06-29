# @litsx/scoped-registry-shim

[![npm](https://img.shields.io/badge/npm-@litsx%2Fscoped--registry--shim-CB3837)](https://www.npmjs.com/package/@litsx/scoped-registry-shim)
[![Release](https://img.shields.io/badge/release-public-2ea44f)](../../RELEASING.md)
[![Module](https://img.shields.io/badge/module-ESM%20%2B%20CJS-0366d6)](./package.json)
[![Provenance](https://img.shields.io/badge/npm_provenance-enabled-2ea44f)](../../RELEASING.md)

Internal shimmed scoped-registry runtime for LitSX.

## Status

This package is still published and still used by LitSX internals, but it is no longer the public model for authoring scoped elements in `static lightDom = true` components.

Current direction:

- `static elements` belongs to shadow-based component semantics
- `LightDomMixin` is for light DOM rendering only
- when native scoped registries are unavailable, LitSX may use this package as an internal shim for shadow hosts and projected renderer mounts

If a component needs `static elements`, do not combine that with `static lightDom = true`.

## What It Is Used For Now

LitSX runtime code uses this package to provide a registry-like fallback with `define(...)` / `get(...)` semantics when:

- a shadow host needs scoped elements but the environment does not support native scoped registries
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

But they should be treated as low-level runtime plumbing, not as the preferred authoring API for new components.

## Attribution

[`src/index.js`](./src/index.js) includes code adapted from The Polymer Project's custom elements work. The original BSD-style attribution notice is preserved in the source file and in this package's [`NOTICE`](./NOTICE).
