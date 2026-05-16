# @litsx/typescript

## 0.6.1

### Patch Changes

- 887ecb2: Normalize escaped newlines in hover documentation and add a preformatted `markdown` field to `editor-session` hover results for editor integrations.

## 0.6.0

### Minor Changes

- 191fc0d: Introduce canonical package names for the LitSX runtime, TypeScript integration, and authored JSX tooling.

  `@litsx/core`, `@litsx/typescript`, and `@litsx/authoring` are now the recommended packages. The previous `@litsx/litsx`, `@litsx/typescript-plugin`, and `@litsx/jsx-authoring` packages remain available as compatibility wrappers.

  Generated scaffolds, compiler output, presets, and tooling defaults now target the canonical package names while preserving compatibility with projects that still use the previous names. The canonical element/scoped-registry helpers now live at `@litsx/core/elements`; `@litsx/litsx/runtime-infrastructure` remains available as the legacy compatibility subpath. Rendering helpers now live at `@litsx/core/rendering`, and TypeScript source virtualization helpers now live at `@litsx/typescript/virtualization`.

## 0.5.0

### Minor Changes

- be88410: Release every public package that is currently ahead of its latest published tag.

  This includes the LitSX TypeScript editor-session and completion improvements, refreshed scaffolded VS Code defaults, and the pending source, metadata, and packaging updates already present in the other affected packages.

## 0.4.0

### Minor Changes

- ca6ccbf: Add a shared `editor-session` entrypoint that exposes project-backed LitSX diagnostics, hover, and completions for editor integrations outside the tsserver plugin host.

## 0.3.2

### Patch Changes

- 8c4a4b6: Strip TypeScript-only syntax from final compiler output after consumer output plugins run, including interfaces, type aliases, assertions, and generics in `.litsx` compilation.

  Improve authored attribute completions to rank camel-case word segment matches more naturally.

## 0.3.1

### Patch Changes

- 0fd14c4: Remove legacy caret-based hoist metadata from the shared LitSX tooling so editor integrations only surface current `static ... = ...` hoists.

## 0.3.0

### Minor Changes

- 4a81cd6: Add `static ... = ...` as the primary static hoist syntax across LitSX authoring, formatting, tooling, and scaffolding.

  Legacy `^...` hoists still work in this release, but they now emit deprecation warnings so projects can migrate before removal.

## 0.2.1

### Patch Changes

- 791414f: Added support for renderer helpers imported across files, package specifiers, and project aliases such as `@/...`, so imported renderers can participate correctly in native lowering and static elements analysis.

  Improved compiler performance for repeated project builds by caching imported renderer module analysis per compilation session, which significantly reduces warm compile times for multi-file and alias-heavy projects.

  Improved `@litsx/typescript-plugin` project typecheck performance by caching stable diagnostics across repeated runs when project files have not changed, reducing repeated `litsx-tsc` costs while preserving invalidation when source versions move.

## 0.2.0

### Minor Changes

- cef2428: Publish the scoped runtime as `@litsx/litsx` and realign the public package surface on `0.2.0`.

## 0.1.0

### Minor Changes

- 5321478: Publish the initial public npm release as version 0.1.0 through the automated Changesets pipeline.
