# @litsx/typescript-plugin

Deprecated compatibility wrapper for `@litsx/typescript`.

New projects should configure TypeScript with the canonical package name:

```json
{
  "compilerOptions": {
    "jsx": "react-jsx",
    "jsxImportSource": "@litsx/core",
    "plugins": [{ "name": "@litsx/typescript" }]
  }
}
```

The old plugin name, subpath exports, and `litsx-tsc` binary remain available for compatibility. Tooling entrypoints emit a deprecation warning once unless `LITSX_DISABLE_DEPRECATION_WARNINGS=1` is set.
