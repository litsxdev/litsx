# @litsx/playground

Playground package for Lit<sup>sx</sup> examples, docs, and embeddable demos.

It bundles the playground custom element, the preview runtime used inside the iframe, and the compilation worker used by the editor.

## What It Exports

- `@litsx/playground`
  Browser entry for the `<litsx-playground>` custom element.
- `@litsx/playground/playground-runtime`
  Preview runtime entry consumed by the iframe import map.
- `@litsx/playground/worker`
  Module worker entry used to compile authored playground source.

## Installation

```bash
yarn add @litsx/playground litsx lit
```

`lit` and `litsx` are kept external by the package build and must be available in the host app.

## Usage

```js
import "@litsx/playground";
```

```html
<litsx-playground
  exportName="CounterExample"
  previewTagName="docs-counter-example-preview"
  filename="counter-example.tsx"
  height="320"
  source="
    import { LitElement } from 'lit';

    export class CounterExample extends LitElement {
      render() {
        return <div>Hello playground</div>;
      }
    }
  "
></litsx-playground>
```

You can also provide the source through light DOM content instead of the `source` attribute.

## Build

```bash
yarn playground:build
```

This generates:

- `dist/index.js`
- `dist/playground-runtime.js`
- `dist/litsx-playground.worker.js`

## Notes

- The playground preview runs in an iframe and resolves its runtime through `@litsx/playground/playground-runtime`.
- The worker is part of this package because the compiler has no standalone use case outside the playground.
- The worker loads `@babel/standalone` and `typescript` from the pinned `esm.sh` CDN URLs at runtime instead of bundling them into the local worker artifact.
- The package is the implementation behind the Lit<sup>sx</sup> docs playgrounds.
