# @litsx/prop-types

Compatibility support for lowering React `prop-types` into Lit<sup>SX</sup>.

This package has two surfaces:

- `@litsx/prop-types/runtime` for the runtime helper layer used by React compat transforms
- `@litsx/prop-types` for descriptor builders that return Lit property option objects

For native LitSX authoring, prefer TypeScript prop inference and `^properties(...)` directly.

## Runtime Helpers

Import runtime helpers from `@litsx/prop-types/runtime` when you need the same validation/options layer that the React compat transform emits:

```js
import {
  required,
  oneOf,
  oneOfType,
  arrayOf,
  objectOf,
  shape,
  exact,
  instanceOf,
} from "@litsx/prop-types/runtime";

^properties({
  title: {
    type: String,
    ...required(),
  },
  status: {
    type: String,
    ...oneOf(["idle", "busy"]),
  },
  meta: {
    type: Object,
    attribute: false,
    ...shape({
      count: Number,
      active: Boolean,
    }),
  },
});
```

These helpers return partial Lit property options:

- `converter`
- `hasChanged`
- `attribute: false` where structured values should not round-trip through attributes

Validation is strict and throws on invalid values.

## Descriptor Builders

The package root exports descriptor builders that produce Lit property option objects:

```js
import PropTypes from "@litsx/prop-types";

class FancyCounter extends LitElement {
  static properties = {
    label: PropTypes.string.attribute("aria-label").reflect(),
    count: PropTypes.number.withConverter(PropTypes.number, {
      converter: {
        fromAttribute: (value) => Number(value ?? 0),
        toAttribute: (value) => String(value ?? 0),
      },
    }),
  };
}
```

That surface is available when you want descriptor composition in plain JavaScript, but it is not the recommended primary style for native LitSX authoring.

## Recommended Native LitSX Authoring

Prefer:

- TypeScript prop inference
- `^properties(...)`

Use `@litsx/babel-preset-react-compat` when you want React `propTypes` migration support; that preset lowers `propTypes` through `@litsx/babel-plugin-litsx-proptypes` and these runtime helpers.
