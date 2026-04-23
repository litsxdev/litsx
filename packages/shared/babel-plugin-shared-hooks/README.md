# `@litsx/babel-plugin-shared-hooks`

Internal shared utilities for the LitSX Babel plugin family.

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

It is not meant to be added directly to application Babel configs.

## Use the Public Packages Instead

If you are configuring Babel for an app or integration, use the public transform packages rather than this internal utility package.
