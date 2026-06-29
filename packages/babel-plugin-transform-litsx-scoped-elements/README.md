# @litsx/babel-plugin-transform-litsx-scoped-elements

[![npm](https://img.shields.io/badge/npm-@litsx%2Fbabel--plugin--transform--litsx--scoped--elements-CB3837)](https://www.npmjs.com/package/@litsx/babel-plugin-transform-litsx-scoped-elements)
[![Release](https://img.shields.io/badge/release-public-2ea44f)](../../RELEASING.md)
[![Module](https://img.shields.io/badge/module-ESM%20%2B%20CJS-0366d6)](./package.json)
[![Provenance](https://img.shields.io/badge/npm_provenance-enabled-2ea44f)](../../RELEASING.md)

Automatically wires the Lit<sup>sx</sup> DOM mixins for LitElement classes so components can use locally registered custom elements through the shared `static elements` contract in shadow DOM.

## What it does

- Finds JSX tags that correspond to imported components and rewrites them to kebab-case custom elements.
- Injects a static `elements` map with the detected components.
- Wraps shadow DOM components in `ShadowDomMixin`, which resolves `elements` through native or shimmed scoped custom element registries.
- Wraps `static lightDom = true` components in `LightDomMixin` only when they do not require scoped elements.
- Throws when a component combines light DOM authoring with `static elements` requirements.
- Adds the required `@litsx/core/elements` import only when a component needs a LitSX DOM mixin, keeping untouched classes minimal.
- Updates matching closing tags and leaves unrelated JSX nodes unchanged.
- Detects scoped usage inside `html` tagged template literals as well, ensuring templates converted by the JSX plugin still register components.

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
- `static lightDom = true` is a root-mode choice, not a scoped-elements transport. If JSX analysis or authored `static elements` would require scoped element resolution, the transform fails with a diagnostic.
- Classes that already wrap the superclass with another mixin still work; the plugin nests the Lit<sup>sx</sup> DOM mixin around the existing expression.
- The helper pairs nicely with other Lit<sup>SX</sup> transforms such as the JSX-to-template and function-to-class plugins.
