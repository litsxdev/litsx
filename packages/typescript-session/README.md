# `@litsx/typescript-session`

[![npm](https://img.shields.io/badge/npm-@litsx%2Ftypescript--session-CB3837)](https://www.npmjs.com/package/@litsx/typescript-session)
[![Release](https://img.shields.io/badge/release-public-2ea44f)](../../RELEASING.md)
[![Module](https://img.shields.io/badge/module-ESM%20%2B%20CJS-0366d6)](./package.json)
[![Provenance](https://img.shields.io/badge/npm_provenance-enabled-2ea44f)](../../RELEASING.md)

Shared TypeScript session utilities used across the LitSX toolchain.

## Purpose

This package centralizes the project and standalone TypeScript session logic
used by:

- `@litsx/compiler`
- `@litsx/babel-preset-litsx`
- `@litsx/typescript-plugin`
- editor-facing LitSX tooling

It exists so those packages do not each reimplement:

- extra file extension registration for `.litsx` and `.litsx.jsx`
- session caching
- overlay file support
- disk-backed and in-memory source-file loading
- `ScriptKind` inference for LitSX-authored files

## Intended Audience

This is a tooling infrastructure package.

It is primarily useful for:

- LitSX maintainers
- advanced tooling authors integrating with the same TypeScript session model

Application authors should normally use the higher-level public surfaces instead:

- `@litsx/compiler`
- `@litsx/typescript-plugin`
- `litsx-tsc`

## Stability

The package is public because other public LitSX packages depend on it, but it
still represents low-level tooling infrastructure rather than a primary
day-to-day application API.
