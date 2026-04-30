# `prettier-plugin-litsx`

Official Prettier support for LitSX-authored source.

## Status

v1 intentionally covers the official authored formats only:

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
- Templates with `${...}` expressions are preserved without CSS reflow in v1.
- `*.tsx` and `*.jsx` compatibility formatting is intentionally out of scope
  for this first release.
