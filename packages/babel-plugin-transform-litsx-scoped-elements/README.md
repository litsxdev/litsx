# @litsx/babel-plugin-transform-litsx-scoped-elements

[![npm](https://img.shields.io/badge/npm-@litsx%2Fbabel--plugin--transform--litsx--scoped--elements-CB3837)](https://www.npmjs.com/package/@litsx/babel-plugin-transform-litsx-scoped-elements)
[![Release](https://img.shields.io/badge/release-public-2ea44f)](../../RELEASING.md)
[![Module](https://img.shields.io/badge/module-ESM%20%2B%20CJS-0366d6)](./package.json)
[![Provenance](https://img.shields.io/badge/npm_provenance-enabled-2ea44f)](../../RELEASING.md)

Automatically wires the Lit<sup>sx</sup> DOM mixins for LitElement classes so components can use locally registered custom elements through the shared `static elements` contract in shadow or light DOM.

## What it does

- Finds JSX tags that correspond to imported components and rewrites them to kebab-case custom elements.
- Injects a static `elements` map with the detected components.
- Wraps shadow DOM components in `ShadowDomMixin`, which resolves `elements` through native or shimmed scoped custom element registries.
- Wraps components declared with `Component.lightDom = true` in `LightDomMixin`; when they have `static elements`, the mixin creates a contextual light DOM registry.
- Emits an empty `static elements` map when a dynamic dependency such as `lazy()` needs a registry before its constructor is available.
- Adds the required `@litsx/core/elements` import only when a component needs a LitSX DOM mixin, keeping untouched classes minimal.
- Updates matching closing tags and leaves unrelated JSX nodes unchanged.
- Detects scoped usage inside `html` tagged template literals as well, ensuring templates converted by the JSX plugin still register components.
- Reads `Symbol.for("litsx.lightDom")` metadata from imported class components,
  including packages in `node_modules` and named/default or `export *` barrels.

## Install

```sh
npm install --save-dev @litsx/babel-plugin-transform-litsx-scoped-elements
# or
yarn add --dev @litsx/babel-plugin-transform-litsx-scoped-elements
```

## Usage

```json
{
  "plugins": ["@litsx/babel-plugin-transform-litsx-scoped-elements"]
}
```

## Example

**Input**

```js
import { LitElement, html } from "lit";
import FancyButton from "./FancyButton.js";

class MyElement extends LitElement {
  render() {
    return <FancyButton label="Click" />;
  }
}
```

**Output (simplified)**

```js
import { ShadowDomMixin } from "@litsx/core/elements";
import { LitElement, html } from "lit";
import FancyButton from "./FancyButton.js";

class MyElement extends ShadowDomMixin(LitElement) {
  static elements = {
    "fancy-button": FancyButton,
  };

  render() {
    return html`<fancy-button label="Click"></fancy-button>`;
  }
}
```

## Notes

- Imported and locally declared sibling components can both be collected into `static elements`.
- `Component.lightDom = true` remains a root-mode choice. Scoped children keep their ordinary tag names and are resolved against the nearest contextual host, so nested light hosts may map the same tag to different constructors.
- Published class components declare the equivalent build/runtime contract as
  `static [Symbol.for("litsx.lightDom")] = true`; consumers do not need a
  package-specific configuration or component-name allowlist.
- The light DOM registry shim is activated lazily only for hosts that actually declare or dynamically require `static elements`; plain light DOM components do not pay its global runtime cost.
- Classes that already wrap the superclass with another mixin still work; the plugin nests the Lit<sup>sx</sup> DOM mixin around the existing expression.
- The helper pairs nicely with other Lit<sup>SX</sup> transforms such as the JSX-to-template and function-to-class plugins.
