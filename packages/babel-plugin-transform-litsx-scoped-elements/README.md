# @litsx/babel-plugin-transform-litsx-scoped-elements

[![npm](https://img.shields.io/badge/npm-@litsx%2Fbabel--plugin--transform--litsx--scoped--elements-CB3837)](https://www.npmjs.com/package/@litsx/babel-plugin-transform-litsx-scoped-elements)
[![Release](https://img.shields.io/badge/release-public-2ea44f)](../../RELEASING.md)
[![Module](https://img.shields.io/badge/module-ESM%20%2B%20CJS-0366d6)](./package.json)
[![Provenance](https://img.shields.io/badge/npm_provenance-enabled-2ea44f)](../../RELEASING.md)

Automatically wires the Lit<sup>sx</sup> element mixins for LitElement classes so components can use locally registered custom elements through a shared `static elements` contract in both shadow DOM and light DOM paths.

## What it does

- Finds JSX tags that correspond to imported components and rewrites them to kebab-case custom elements.
- Injects a static `elements` map with the detected components.
- Wraps shadow DOM components in `ShadowDomElementsMixin`, which resolves `elements` through native or polyfilled scoped custom element registries.
- Wraps `^lightDom()` components in `LightDomElementsMixin`, which uses the light DOM registry runtime.
- Adds the required runtime-infrastructure import only when at least one element dependency is discovered, keeping untouched classes minimal.
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
import { ShadowDomElementsMixin } from "@litsx/litsx/runtime-infrastructure";
import { LitElement, html } from "lit";
import FancyButton from "./FancyButton.js";

class MyElement extends ShadowDomElementsMixin(LitElement) {
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
- Classes that already wrap the superclass with another mixin still work; the plugin nests the Lit<sup>sx</sup> elements mixin around the existing expression.
- The helper pairs nicely with other Lit<sup>SX</sup> transforms such as the JSX-to-template and function-to-class plugins.
