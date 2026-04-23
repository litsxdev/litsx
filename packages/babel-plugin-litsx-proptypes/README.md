# @litsx/babel-plugin-litsx-proptypes

React `propTypes` compatibility for Lit<sup>SX</sup>.

This plugin is no longer part of native LitSX authoring. Its job is to take React-style `Component.propTypes = { ... }` assignments and lower them into native LitSX `^properties(...)` hoists so the rest of the LitSX pipeline can handle them normally.

## What it does

- Finds `Component.propTypes = { ... }` assignments on React-authored function components.
- Rewrites them to internal `__litsx_static_properties({...})` hoists, which are the lowered form of native `^properties(...)`.
- Preserves explicit authored `^properties(...)` as the stronger override layer when both are present.
- Imports compat runtime helpers from `@litsx/prop-types/runtime` for React forms such as `oneOf`, `shape`, `exact`, `arrayOf`, `oneOfType`, and `isRequired`.
- Removes the original `propTypes` assignment and prunes unused `prop-types` imports.

## Install

```sh
npm install --save-dev @litsx/babel-plugin-litsx-proptypes
# or
yarn add --dev @litsx/babel-plugin-litsx-proptypes
```

## Usage

```json
{
  "plugins": ["@litsx/babel-plugin-litsx-proptypes"]
}
```

In practice this plugin is mainly useful through `@litsx/babel-preset-react-compat`, which places it before the native LitSX component/property lowering stages.

## Example

**Input**

```js
import PropTypes from "prop-types";

export const FancyButton = ({ label, status }) => {
  return <button>{label}</button>;
};

FancyButton.propTypes = {
  label: PropTypes.string.isRequired,
  status: PropTypes.oneOf(["idle", "busy"]),
};
```

**Lowered shape (simplified)**

```js
import {
  required as _litsxPropTypeRequired,
  oneOf as _litsxPropTypeOneOf,
} from "@litsx/prop-types/runtime";

export const FancyButton = ({ label, status }) => {
  __litsx_static_properties({
    label: {
      type: String,
      ..._litsxPropTypeRequired(),
    },
    status: {
      type: String,
      ..._litsxPropTypeOneOf(["idle", "busy"]),
    },
  });

  return <button>{label}</button>;
};
```

After that, the native LitSX transform pipeline turns the hoist into the final static `properties` contract for the lowered component.

## Scope

- Canonical input is the React `prop-types` package.
- Canonical output is native LitSX `^properties(...)` semantics.
- This plugin belongs in migration/compat flows, not in native LitSX authoring guidance.
