# Releasing LitSX

LitSX releases are managed with Changesets.

## Model

- package versioning is independent
- public npm packages are released from `main`
- version bumps and changelogs are generated from `.changeset/*.md`
- GitHub Releases for published npm packages are created automatically by `changesets/action`
- `vscode-litsx` remains a separate manual Marketplace release

## Public npm packages

- `litsx`
- `@litsx/compiler`
- `@litsx/vite-plugin`
- `@litsx/typescript-plugin`
- `@litsx/eslint-plugin`
- `create-litsx-app`
- `prettier-plugin-litsx`
- `@litsx/light-dom-registry`
- `@litsx/babel-parser`
- `@litsx/jsx-authoring`
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

`test/fixtures/dx-smoke-app` remains in the repository as a fixture for authored-source
tests, but it is no longer part of the active Yarn workspaces graph or release
machinery.

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

### `Release`

- runs on pushes to `main`
- uses `changesets/action`
- when unreleased changesets exist:
  - creates or updates a release PR
  - bumps package versions
  - updates package changelogs
- when the release PR is merged and no pending changesets remain:
  - publishes changed npm packages
  - publishes them with npm provenance enabled
  - creates GitHub Releases for the published packages

### `Publish VS Code Extension`

- remains manual
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
- optionally require reviewers on the `npm-release` environment
- install the `changeset-bot` GitHub App so PRs get nudged when a changeset is missing

## Scaffold version sync

`create-litsx-app` embeds published dependency ranges for:

- `litsx`
- `@litsx/eslint-plugin`
- `@litsx/typescript-plugin`
- `@litsx/vite-plugin`
- `prettier-plugin-litsx`

Those ranges are synchronized during `yarn changeset:version`, so the scaffold stays aligned with whatever versions Changesets has just written.

## VS Code extension release

`vscode-litsx` is not published by Changesets.

Public npm packages opt into npm provenance through `publishConfig.provenance: true`, and the `Release` workflow also sets `NPM_CONFIG_PROVENANCE=true` so `changesets publish` emits registry-backed provenance for the packages it publishes.

Before Marketplace publish:

```sh
yarn release:vscode:build
yarn release:vscode:package
```

Then use the `Publish VS Code Extension` workflow.
