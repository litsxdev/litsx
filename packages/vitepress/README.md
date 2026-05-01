# `@litsx/vitepress`

[![Workspace](https://img.shields.io/badge/workspace-internal-6e7781)](../../README.md)
[![Release](https://img.shields.io/badge/release-private-6e7781)](../../RELEASING.md)
[![Audience](https://img.shields.io/badge/audience-website-8250df)](../../README.md)

Internal VitePress integration for the LitSX website.

This package owns the website-specific VitePress setup:

- LitSX-authored docs component compilation
- client-side `lit` module resolution for the docs site
- LitSX-aware syntax highlighting for static `tsx` / `jsx` code fences
- version selector and older-version banner UI
- the shared VitePress theme wrapper used by `website/docs`

It is internal to LitSX and is not intended to be the general-purpose Vite integration surface. For normal Vite projects, use [`@litsx/vite-plugin`](../vite-plugin/README.md).

This package is deliberately:

- private to the workspace
- coupled to the `website/docs` VitePress structure
- free to optimize for the LitSX docs site instead of third-party reuse
