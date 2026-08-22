# `@litsx/eslint-plugin`

Official ESLint rules for standard LitSX JSX and TSX.

The plugin uses Babel's normal JSX/TypeScript parser support. It does not virtualize source or ship a custom syntax processor.

## Installation

```sh
npm install -D eslint @litsx/eslint-plugin
```

ESLint 9 and ESLint 10 are supported. LitSX uses ESLint's flat configuration API.

## Flat config

```js
import litsx from "@litsx/eslint-plugin";

export default [litsx.configs["recommended-flat"]];
```

The recommended preset enables:

- `@litsx/no-native-classname`
- `@litsx/no-react-memo`
- `@litsx/valid-component-name`
- `@litsx/rules-of-hooks`

`valid-component-name` requires every component identifier to map directly to a
valid custom-element name. LitSX does not invent prefixes for short names, so
`Switch` and `App` are errors; use an explicit name such as `ToggleSwitch` or a
namespace member such as `Controls.Switch`.

`rules-of-hooks` uses the same analyzer as the compiler and Babel transforms. It
rejects hooks in conditions, after early returns, loops, try/catch, async render scopes, handlers and
deferred `useAsyncState` actions, as well as nested custom-hook declarations.
Diagnostics include a stable `LITSX_*` code so editor integrations can dedupe
the same finding across tools.

`no-native-classname` safely autofixes `className` to `class` on native elements.
Formatting remains the responsibility of standard Prettier JSX/TSX support or
another formatter.
