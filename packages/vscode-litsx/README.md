# `vscode-litsx`

[![VS Code](https://img.shields.io/badge/distribution-VS%20Code%20Marketplace-0078d7)](../../RELEASING.md)
[![Release](https://img.shields.io/badge/release-manual-6e7781)](../../RELEASING.md)
[![Package](https://img.shields.io/badge/package-vsix-0078d7)](./package.json)
[![Attestation](https://img.shields.io/badge/vsix_attestation-enabled-2ea44f)](../../RELEASING.md)

Official VS Code support for LitSX-authored source.

This extension focuses on the editor layer that TypeScript plugins do not cover
well on their own:

- TextMate highlighting for `@event`, `.prop`, `?attr`, and `^hoists(...)`
- CSS highlighting inside `^styles(\`...\`)`
- workspace defaults that keep the TypeScript server aligned with LitSX
- a light italic treatment for LitSX-specific attrs and hoists so they stand
  apart from ordinary HTML/JSX attributes without requiring aggressive color
  overrides

It is designed to complement:

- `@litsx/typescript-plugin` for LitSX virtualization and TS-facing semantics
- `@litsx/eslint-plugin` for lint and policy enforcement

For `*.tsx` and `*.jsx`, the extension does not override the default VS Code
language mode automatically. Instead, it exposes LitSX language modes and can
suggest switching when LitSX-authored syntax is detected in a standard
`typescriptreact` or `javascriptreact` file.

## What Comes From Where

- Syntax highlighting: `vscode-litsx`
- Hover, completions, diagnostics in `LitSX` / `LitSX JSX`: `vscode-litsx`
- Virtualization and TS-facing LitSX semantics: `@litsx/typescript-plugin`
- Lint and CI policy: `@litsx/eslint-plugin`

## Status

- it provides dedicated `LitSX` and `LitSX JSX` language modes
- `.litsx` is the authored source default
- `.litsx.jsx` remains the explicit JavaScript variant
- it does not replace the full JavaScript or TypeScript language services
- it complements `@litsx/typescript-plugin` and `@litsx/eslint-plugin`

## Marketplace Release Track

`vscode-litsx` is released as a VS Code Marketplace extension.

Before publishing a release candidate, package a `.vsix` and verify it in a
clean VS Code profile. The release checklist for this repository lives in the
root [`RELEASING.md`](../../RELEASING.md).

Build and package commands:

- `yarn workspace vscode-litsx build`
- `yarn workspace vscode-litsx package:vsix`

## File Extensions

Use these file extensions for official LitSX-authored source:

- `*.litsx`
- `*.litsx.jsx`

Supported JSX-bearing compatibility files can still be switched manually to a
LitSX language mode when needed:

- `*.tsx`
- `*.jsx`

The extension takes this route deliberately. VS Code's built-in JSX grammars still
mark LitSX-authored attributes such as `@click`, `.value`, and `?disabled` as
illegal tokens, so official highlighting cannot rely on `typescriptreact` or
`javascriptreact` alone.

The intended split is:

- syntax highlighting, language modes, editor UX, and first-pass project-backed TS feedback: `vscode-litsx`
- LitSX virtualization/remapping logic for TypeScript-facing semantics: `@litsx/typescript-plugin`
- lint and policy: `@litsx/eslint-plugin`

For the dedicated `LitSX` and `LitSX JSX` language modes, the extension:

- surfaces authored LitSX diagnostics directly
- adds project-backed TypeScript diagnostics for the current file
- provides authored hover/completion plus basic project-backed TS hover/completion

That keeps useful editor feedback available even when the file is no longer
using the standard `typescriptreact/javascriptreact` language modes.

## TSX And JSX Detection

When you open a standard `tsx` or `jsx` file, `vscode-litsx` leaves the default
language mode alone. If the document starts using LitSX-authored syntax such as:

- `@click`
- `.value`
- `?disabled`
- `^styles(...)`

the extension can suggest switching that file to the matching LitSX language
mode:

- `typescriptreact` -> `litsx`
- `javascriptreact` -> `litsx-jsx`

When you accept the suggestion, the extension remembers that choice for that
file in the current workspace and reapplies the LitSX language mode when you
open it again.

If you dismiss the suggestion, that dismissal is also remembered for the same
file content so the editor does not keep re-prompting on every reopen. If the
file changes substantially and still uses LitSX-authored syntax, the suggestion
can appear again.

You can also switch manually with the command:

- `LitSX: Switch Current File to LitSX Mode`
- `LitSX: Reset Current File to Standard Language Mode`

The reset command clears the stored LitSX preference for the current file. It
does not persist a dismissal on your behalf.
