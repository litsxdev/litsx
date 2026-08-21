# `@litsx/eslint-plugin`

Official ESLint rules for standard LitSX JSX and TSX.

The plugin uses Babel's normal JSX/TypeScript parser support. It does not virtualize source or ship a custom syntax processor.

## Installation

```sh
npm install -D eslint @litsx/eslint-plugin
```

## Flat config

```js
import litsx from "@litsx/eslint-plugin";

export default [litsx.configs["recommended-flat"]];
```

The recommended preset enables:

- `@litsx/no-native-classname`
- `@litsx/no-react-memo`

The first rule safely autofixes `className` to `class` on native elements. Formatting remains the responsibility of standard Prettier JSX/TSX support or another formatter.
