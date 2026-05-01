# `@litsx/eslint-plugin`

[![npm](https://img.shields.io/badge/npm-@litsx%2Feslint--plugin-CB3837)](https://www.npmjs.com/package/@litsx/eslint-plugin)
[![Release](https://img.shields.io/badge/release-public-2ea44f)](../../RELEASING.md)
[![Module](https://img.shields.io/badge/module-ESM%20%2B%20CJS-0366d6)](./package.json)
[![Provenance](https://img.shields.io/badge/npm_provenance-enabled-2ea44f)](../../RELEASING.md)

Official ESLint support for LitSX-authored syntax.

This v1 is **processor-first**:

- LitSX-authored source is virtualized before ESLint parses it
- ESLint findings are remapped back to original authored positions
- LitSX-specific semantic rules run with normal ESLint `ruleId`s

It does **not** ship a dedicated LitSX parser.

## Installation

```sh
npm install -D eslint @litsx/eslint-plugin
```

## Flat Config

```js
import litsx from "@litsx/eslint-plugin";

export default [
  litsx.configs["recommended-flat"],
];
```

Other shipped flat presets:

- `litsx.configs["recommended-lint-flat"]`
- `litsx.configs["recommended-react-migration-flat"]`
- `litsx.configs["strict-flat"]`

## Legacy Config

```json
{
  "extends": ["plugin:@litsx/recommended"]
}
```

Other shipped legacy presets:

- `plugin:@litsx/recommended-lint`
- `plugin:@litsx/recommended-react-migration`
- `plugin:@litsx/strict`

`recommended` is the editor-friendly baseline:

- LitSX source is processed correctly
- it avoids duplicating inline feedback that `@litsx/typescript-plugin` already shows in editors
- it disables the processor's baseline authored diagnostics too

Use `recommended-lint` when you want ESLint itself to enforce the LitSX semantic rules in CI or editor linting.

## Included Rules

Shipped in `recommended-lint`:

- `@litsx/no-native-classname`
- `@litsx/no-invalid-binding-value`
- `@litsx/no-unknown-binding`
- `@litsx/static-hoists-top-level`
- `@litsx/no-duplicate-static-hoist`
- `@litsx/no-react-memo`
- `@litsx/no-react-compat-surface`
- `@litsx/prefer-destructured-props`
- `@litsx/no-opaque-prop-metadata-inference`
- `@litsx/require-top-level-hoists-first`
- `@litsx/no-unknown-static-hoist`

## Autofix

The v1 plugin only autofixes safe, unambiguous cases.

Today that means:

- `className` -> `class` on native LitSX intrinsic elements

## Notes

- The plugin is designed to work with LitSX-authored forms such as `@click`, `.value`, `?disabled`, and `^styles(...)`.
- Processor mode means lint messages are reported on the original source even though ESLint parses a virtualized version internally.
- Prettier support is still a separate gap; this package only covers linting.
