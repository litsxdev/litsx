# `@litsx/jsx-authoring`

[![npm](https://img.shields.io/badge/npm-@litsx%2Fjsx--authoring-CB3837)](https://www.npmjs.com/package/@litsx/jsx-authoring)
[![Release](https://img.shields.io/badge/release-public-2ea44f)](../../RELEASING.md)
[![Module](https://img.shields.io/badge/module-ESM%20%2B%20CJS-0366d6)](./package.json)
[![Provenance](https://img.shields.io/badge/npm_provenance-enabled-2ea44f)](../../RELEASING.md)

Shared authored-JSX language utilities for LitSX.

This package is the source of truth for the authored syntax layer reused across:

- parser adapters
- Babel transforms
- TypeScript tooling
- editor-facing utilities

## What It Owns

`@litsx/jsx-authoring` is where LitSX-specific authored syntax gets normalized or virtualized before downstream tools consume it.

That includes:

- virtual attribute handling for `.prop`, `@event`, and `?attr`
- authored-source remapping metadata
- helper utilities shared by the parser and transform toolchain

## Why It Exists

LitSX authored JSX is not plain JSX. The toolchain needs a shared definition of:

- which authored forms are valid
- how those forms are virtualized for parsing
- how source positions are mapped back to the original authored input

Without a shared package, parser, compiler, and tooling layers would drift.

## Intended Audience

This is primarily an infrastructure package for:

- LitSX maintainers
- tooling authors extending the LitSX compilation stack

It is not the recommended entrypoint for application builds.

For public compilation surfaces, prefer:

- [`@litsx/compiler`](../compiler/README.md)
- [`@litsx/vite-plugin`](../vite-plugin/README.md)

## Package Role in the Toolchain

Typical flow:

1. `@litsx/jsx-authoring` virtualizes authored syntax and records remapping metadata
2. a parser adapter or internal tool calls `@babel/parser` over that virtual source
3. the compiler/plugin layer restores authored positions and performs Babel transforms

That separation keeps authored-syntax knowledge centralized while build integration stays in the public facade packages.
