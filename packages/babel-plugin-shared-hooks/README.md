# `@litsx/babel-plugin-shared-hooks`

[![npm](https://img.shields.io/badge/npm-@litsx%2Fbabel--plugin--shared--hooks-CB3837)](https://www.npmjs.com/package/@litsx/babel-plugin-shared-hooks)
[![Release](https://img.shields.io/badge/release-public-2ea44f)](../../RELEASING.md)
[![Module](https://img.shields.io/badge/module-ESM%20%2B%20CJS-0366d6)](./package.json)
[![Provenance](https://img.shields.io/badge/npm_provenance-enabled-2ea44f)](../../RELEASING.md)

Shared hook-transform utilities for the LitSX Babel plugin family.

## Purpose

This package centralizes hook-transform logic used by the public Babel plugins that target:

- native LitSX hooks
- React compatibility hooks
- shared LitElement host analysis

## What It Exports

This package includes internal helpers such as:

- `createUseStateTransform`
- `createUseRefTransform`
- `createRuntimeHooksTransform`
- `createEffectHooksTransform`
- host-resolution and runtime-import helpers used by transform packages

## Intended Audience

This package is for:

- LitSX maintainers
- advanced plugin authors extending the same internal transform model

It is not the recommended first entrypoint for application Babel configs.

## Use the Public Packages Instead

If you are configuring Babel for an app or integration, use the public transform packages rather than this internal utility package.
