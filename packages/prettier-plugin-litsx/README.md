# `prettier-plugin-litsx`

[![npm](https://img.shields.io/badge/npm-prettier--plugin--litsx-CB3837)](https://www.npmjs.com/package/prettier-plugin-litsx)
[![Release](https://img.shields.io/badge/release-public-2ea44f)](../../RELEASING.md)
[![Module](https://img.shields.io/badge/module-ESM%20%2B%20CJS-0366d6)](./package.json)
[![Provenance](https://img.shields.io/badge/npm_provenance-enabled-2ea44f)](../../RELEASING.md)

Official Prettier support for LitSX-authored source.

## Status

This plugin intentionally covers the official authored formats only:

- `*.litsx`
- `*.litsx.jsx`

It does **not** claim plain `*.tsx` or `*.jsx` formatting.

The plugin preserves LitSX-authored syntax directly:

- `@event`
- `.prop`
- `?attr`
- `^styles(...)`
- `^properties(...)`

Static `^styles(\`...\`)` templates are formatted as real CSS when they do not
contain `${...}` interpolations.

## Install

```sh
npm install -D prettier prettier-plugin-litsx
```

## Usage

Recommended configuration:

```json
{
  "overrides": [
    {
      "files": "*.litsx",
      "options": {
        "parser": "litsx"
      }
    },
    {
      "files": "*.litsx.jsx",
      "options": {
        "parser": "litsx-jsx"
      }
    }
  ]
}
```

## Notes

- `^styles(\`...\`)` is formatted with Prettier's CSS parser only when the
  template is fully static.
- Templates with `${...}` expressions are preserved without CSS reflow.
- `*.tsx` and `*.jsx` compatibility formatting is intentionally out of scope
  for this package.
