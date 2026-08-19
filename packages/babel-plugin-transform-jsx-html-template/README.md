# @litsx/babel-plugin-transform-jsx-html-template

[![npm](https://img.shields.io/badge/npm-@litsx%2Fbabel--plugin--transform--jsx--html--template-CB3837)](https://www.npmjs.com/package/@litsx/babel-plugin-transform-jsx-html-template)
[![Release](https://img.shields.io/badge/release-public-2ea44f)](../../RELEASING.md)
[![Module](https://img.shields.io/badge/module-ESM%20%2B%20CJS-0366d6)](./package.json)
[![Provenance](https://img.shields.io/badge/npm_provenance-enabled-2ea44f)](../../RELEASING.md)

The Lit<sup>SX</sup> JSX-to-template bridge: turn standard JSX trees into `lit-html` template literals while preserving the binding decisions made by the LitSX preset.

## What it does

- Converts JSX expressions into tagged template literals (default tag `html`) understood by the `lit` runtime.
- Converts standard `on:event` JSX names into Lit `@event` listeners.
- Consumes compiler-generated `.prop`, `?attr`, and `@event` bindings during the internal template pass.
- Can rewrite React-style listeners when invoked by the optional react-compat pipeline.
- Supports component factories by turning capitalised tags into function calls and passing props/children explicitly.
- Lowers JSX spread attributes through `jsxSpreadElement`, preserving source-order precedence around explicit props and inspecting the destination component API when available to select property, boolean, event, or attribute semantics.
- Injects (or augments) the `lit` import so the generated tag (`html` by default) is always available.
- Handles fragments and nested expression trees (e.g. `items.map(() => <span/>)`) so iterated JSX turns into nested `html` calls.

## Install

```sh
npm install --save-dev @litsx/babel-plugin-transform-jsx-html-template
# or
yarn add --dev @litsx/babel-plugin-transform-jsx-html-template
```

## Usage

```json
{
  "plugins": ["@litsx/babel-plugin-transform-jsx-html-template"]
}
```

## Example

**Input**

```js
const view = (
  <button title={text} on:click={handleClick}>
    {text}
  </button>
);
```

**Output**

```js
import { html } from "lit";

const view = html`<button title=${text} @click=${handleClick}>
  ${text}
</button>`;
```

## Options

- `tag` (string): customise the template tag name (defaults to `html`).
- `lowercaseEventNames` (boolean, default `true`): emit lowercase listener names when converting React-style `onClick`/`onChange` attributes.

## Notes

- Whitespace is trimmed to match Lit expectations—leading/trailing newlines are removed while intentional spacing stays intact.
- Authored standard JSX/TSX needs no parser adapter. Generated binding prefixes are an internal compiler protocol.
- Listener options use the object-listener form (`{ handleEvent, capture, once, passive }`) understood by Lit.
- Keeps source maps aligned with Babel defaults so editor tooling continues to work after the transform.
- Spread lowering creates ordinary Lit attribute, property, boolean, and event parts, so the same output works in browser rendering and Lit SSR.
