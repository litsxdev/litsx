# @litsx/typescript-plugin

TypeScript language-service support for Litsx-authored JSX.

The plugin exists to make editor tooling tolerate Lit-flavoured JSX attributes such as:

- `@click={handle}`
- `.value={model.value}`
- `?disabled={busy}`

## Scope

The plugin virtualizes prefixed JSX attribute names into TypeScript-safe names for the language service and then remaps the results back to the authored Litsx syntax.

It provides:

- tolerance for `@event`, `.prop` and `?attr` in `.jsx`, `.tsx`, `.litsx`, and `.litsx.jsx`
- remapped diagnostics and quick info spans
- filtered completions that hide the internal `__litsx_*` names
- contextual completions for `@event`, `.prop` and `?attr`
- authored diagnostics for obviously invalid Lit bindings
- a `litsx-tsc` CLI path for virtualized type-checking when authored source uses Lit<sup>sx</sup>-specific syntax that plain `tsc` cannot parse directly

It does not provide:

- exhaustive DOM/custom-element semantics for every tag
- editor refactors or quick-fixes
- remapped rename/find-references flows

## Usage

```json
{
  "compilerOptions": {
    "jsx": "react-jsx",
    "jsxImportSource": "litsx",
    "plugins": [
      { "name": "@litsx/typescript-plugin" }
    ]
  }
}
```

For a workspace using the local package directly, the same shape works in `tsconfig.json`:

```json
{
  "compilerOptions": {
    "jsx": "react-jsx",
    "jsxImportSource": "litsx",
    "plugins": [
      {
        "name": "@litsx/typescript-plugin"
      }
    ]
  }
}
```

VS Code picks this up through the bundled TypeScript server when the workspace is using the project `tsconfig.json`.

## Exports

- `@litsx/typescript-plugin`
- `@litsx/typescript-plugin/virtual-source`
- `@litsx/typescript-plugin/typecheck`

The `virtual-source` entrypoint exposes the standalone source virtualization helper used internally by the plugin.

## CLI Typecheck

If a project wants CLI type-checking for authored syntax such as `@click`, `.value`, `?disabled`, or `^styles(...)`, use the virtualized wrapper instead of calling plain `tsc` directly:

```sh
litsx-tsc -p tsconfig.json --noEmit
```

This is a toolchain/CI concern, not a replacement for the editor plugin. The editor DX still comes from the tsserver plugin.
