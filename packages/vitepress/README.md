# `@litsx/vitepress`

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
