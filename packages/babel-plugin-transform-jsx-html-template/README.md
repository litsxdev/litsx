# @litsx/babel-plugin-transform-jsx-html-template

The Lit<sup>SX</sup> JSX-to-template bridge: turn JSX trees into `lit-html` template literals while keeping Lit-specific attribute prefixes and listener semantics intact.

## What it does

- Converts JSX expressions into tagged template literals (default tag `html`) understood by the `lit` runtime.
- Preserves `.prop`, `?attr` and `@event` prefixes as part of the resulting template syntax.
- Rewrites React-style listeners (`onClick`, `onPointerDownCapture`, …) into Lit listeners, automatically lowercasing DOM event names and enabling capture mode when necessary.
- Supports component factories by turning capitalised tags into function calls and passing props/children explicitly.
- Declares clear error messages for unsupported constructs like spread attributes, helping you migrate incrementally.
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
  <button .label={text} ?disabled={disabled} @click={handleClick}>
    {text}
  </button>
);
```

**Output**

```js
import { html } from "lit";

const view = html`<button .label=${text} ?disabled=${disabled} @click=${handleClick}>
  ${text}
</button>`;
```

## Options

- `tag` (string): customise the template tag name (defaults to `html`).
- `lowercaseEventNames` (boolean, default `true`): emit lowercase listener names when converting React-style `onClick`/`onChange` attributes.

## Notes

- Whitespace is trimmed to match Lit expectations—leading/trailing newlines are removed while intentional spacing stays intact.
- Works best in tandem with the Lit<sup>SX</sup> parser fork so JSX attribute prefixes are available in the AST.
- `...Capture` listeners are translated into the object-listener form (`{ handleEvent, capture: true }`) that Lit expects for capture semantics.
- Keeps source maps aligned with Babel defaults so editor tooling continues to work after the transform.
