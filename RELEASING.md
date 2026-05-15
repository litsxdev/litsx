# Releasing LitSX

LitSX releases are managed with Changesets.

## Model

- package versioning is independent
- public npm packages are released from `main`
- version bumps and changelogs are generated from `.changeset/*.md`
- release publication is gated by the `npm-release` GitHub environment
- `vscode-litsx` remains a separate manual Marketplace release

## Public npm packages

- `litsx`
- `@litsx/compiler`
- `@litsx/vite-plugin`
- `@litsx/typescript`
- `@litsx/eslint-plugin`
- `create-litsx-app`
- `prettier-plugin-litsx`
- `@litsx/light-dom-registry`
- `@litsx/babel-parser`
- `@litsx/authoring`
- `@litsx/prop-types`
- `@litsx/babel-preset-litsx`
- `@litsx/babel-preset-react-compat`
- `@litsx/babel-plugin-transform-jsx-html-template`
- `@litsx/babel-plugin-transform-litsx-scoped-elements`
- `@litsx/babel-plugin-litsx-proptypes`
- `@litsx/babel-plugin-shared-hooks`
- `@litsx/typescript-session`

## Ignored packages

These stay outside npm publication and are ignored by Changesets:

- `vscode-litsx`
- `@litsx/playground`
- `@litsx/vitepress`

`vscode-litsx` remains private to the workspace package graph and is released manually to
the VS Code Marketplace only.

`test/fixtures/dx-smoke-app` remains in the repository as a fixture for authored-source
tests and stays outside the active Yarn workspaces graph and release machinery.

## Contributor workflow

If a pull request changes one or more public packages, add a changeset:

```sh
yarn changeset
```

That file records:

- which packages change
- the bump type
- the changelog summary used later for package changelogs and GitHub Releases

## Local validation

Run these before merging release-affecting work:

```sh
yarn test
yarn release:check
yarn release:smoke:scaffolds
yarn release:test
```

Useful release commands:

```sh
yarn changeset
yarn changeset:status
yarn changeset:version
yarn release:publish
```

## GitHub workflows

### `Test`

- runs on pushes to branches
- runs on all pull requests, including forks
- stays secret-free
- validates the full test suite

### `Changeset Status`

- runs on pull requests
- stays secret-free
- checks whether release-affecting pull requests include valid changesets

### `Release Validate`

- runs on pushes to `main`
- runs on pull requests
- stays secret-free
- validates release surfaces and scaffold smoke
- uploads preview npm tarballs and VSIX artifacts on `main`

### `Deploy Docs`

- runs on pushes to `main`
- builds the VitePress site with `yarn docs:build`
- deploys `website/docs/.vitepress/dist` to GitHub Pages
- assumes custom-domain hosting at:
  - `https://litsx.dev/`
- publishes `website/docs/public/CNAME` so the Pages artifact keeps the custom domain attached
- can inject site analytics at build time through repository variables

### `Release`

- runs on pushes to `main`
- stays idle when no pending `.changeset/*.md` files are present
- when pending changesets exist:
  - waits for approval through the `npm-release` environment
  - runs `yarn changeset:version`
  - commits the resulting version and changelog updates back to `main`
  - publishes public npm packages with `yarn release:publish`
- does not create a release PR
- does not publish `vscode-litsx`

### `Publish VS Code Extension`

- remains manual
- stays outside npm publication and Changesets versioning
- packages a `.vsix`
- generates a GitHub artifact attestation for that `.vsix`
- publishes `vscode-litsx` to the Marketplace with `VSCE_PAT`

## Required GitHub setup

- environment: `npm-release`
  - secret: `NPM_TOKEN`
- environment: `vscode-marketplace`
  - secret: `VSCE_PAT`

Recommended repository setup:

- protect `main`
- require the `Test / test` job
- require the `Release Validate / validate` job
- enable GitHub Pages with source set to `GitHub Actions`
- configure the custom domain `litsx.dev` in the repository Pages settings
- if you want traffic analytics on the docs site, configure repository variables for one provider:
  - `LITSX_ANALYTICS_PROVIDER=ga4` and `LITSX_GA_MEASUREMENT_ID=G-...`
  - or `LITSX_ANALYTICS_PROVIDER=plausible`, `LITSX_PLAUSIBLE_DOMAIN=litsx.dev`, and optionally `LITSX_PLAUSIBLE_API_HOST=https://plausible.io`
- install the `changeset-bot` GitHub App so PRs get nudged when a changeset is missing

## Scaffold version sync

`create-litsx-app` embeds published dependency ranges for:

- `litsx`
- `@litsx/eslint-plugin`
- `@litsx/typescript`
- `@litsx/vite-plugin`
- `prettier-plugin-litsx`

Those ranges are synchronized during `yarn changeset:version`, so the scaffold stays aligned with whatever versions Changesets has just written.

## VS Code extension release

`vscode-litsx` stays private in the workspace and is not published by Changesets or npm.

Public npm packages opt into npm provenance through `publishConfig.provenance: true`. npm publication runs from the `Release` workflow after `npm-release` environment approval and requires a valid `NPM_TOKEN`.

Before Marketplace publish:

```sh
yarn release:vscode:build
yarn release:vscode:package
```

Then use the `Publish VS Code Extension` workflow.
