# Releasing LitSX

LitSX releases are managed with Changesets.

## Model

- package versioning is independent
- stable npm releases publish from `main`
- branch pushes can publish automatic snapshot prereleases
- npm publication is gated by the `npm-release` GitHub environment
- stable releases create version/changelog commits, tags, and GitHub Releases
- branch prereleases do not persist changelog edits, do not create tags, and do not create GitHub Releases

## Public npm packages

The release pipeline currently publishes these workspace packages:

- `@litsx/authoring`
- `@litsx/babel-plugin-litsx-proptypes`
- `@litsx/babel-plugin-shared-hooks`
- `@litsx/babel-plugin-transform-jsx-html-template`
- `@litsx/babel-plugin-transform-litsx-scoped-elements`
- `@litsx/babel-preset-litsx`
- `@litsx/babel-preset-react-compat`
- `@litsx/compiler`
- `@litsx/core`
- `create-litsx-app`
- `@litsx/eslint-plugin-litsx`
- `prettier-plugin-litsx`
- `@litsx/prop-types`
- `@litsx/scoped-registry-shim`
- `@litsx/typescript`
- `@litsx/typescript-session`
- `@litsx/vite-plugin`

The source of truth for this set is [scripts/release/release-packages.js](/Users/rafabernad/Workspace/litsx/scripts/release/release-packages.js).

## Private packages

These workspace packages stay private and outside npm publication:

- `@litsx/shiki-languages`

## Contributor workflow

If a change affects one or more public npm packages, add a changeset:

```sh
yarn changeset
```

That file records:

- which packages change
- the bump type
- the summary used later for package changelogs and stable GitHub Releases

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
yarn changeset:version:snapshot
yarn release:publish
```

## Stable releases

Stable releases come from `main` through the `Release` workflow.

When pending changesets exist, that workflow:

- waits for `Test` and `Release Validate`
- runs `yarn changeset:version`
- refreshes generated internal dependency ranges
- publishes public npm packages
- commits version and changelog updates back to `main`
- pushes git tags
- creates a GitHub Release

## Branch prereleases

Non-`main` branch pushes can publish automatic snapshot prereleases.

Properties of that flow:

- it runs only for successful `push` workflows on non-`main` branches
- it is triggered after `Release Validate`
- it uses Changesets snapshot versioning, not persistent prerelease mode
- it publishes under a branch-specific npm dist-tag shaped like `canary-<branch>`
- it does **not** commit version bumps back to the branch
- it restores package changelogs after versioning so the repository does not accumulate prerelease changelog noise
- it does **not** create git tags
- it does **not** create GitHub Releases

This flow is meant for unstable validation builds, not for a curated “next” channel.

## GitHub workflows

### `Test`

- runs on pushes to branches and on pull requests
- stays secret-free
- validates the full test suite and reports coverage

### `Changeset Status`

- runs on pull requests
- stays secret-free
- checks whether release-affecting pull requests include valid changesets

### `Release Validate`

- runs on pushes and pull requests
- stays secret-free
- materializes stable version bumps when changesets are present
- validates release surfaces and scaffold smoke
- uploads preview npm tarballs on `main`

### `Release`

- runs from `main`
- publishes stable npm releases
- creates version/changelog commits, tags, and GitHub Releases

### `Branch Prerelease`

- runs automatically after `Release Validate` for successful non-`main` branch pushes
- publishes snapshot npm builds under branch-specific `canary-...` dist-tags
- skips release commits, tags, and GitHub Releases

### `Backfill GitHub Releases`

- remains manual
- rebuilds or previews GitHub Releases from existing release commits

## Required GitHub setup

- environment: `npm-release`
  - secret: `NPM_TOKEN`

Recommended repository setup:

- protect `main`
- require `Test / Test Suite`
- require `Release Validate / Validate Release Surface`
- install the `changeset-bot` GitHub App so PRs get nudged when a changeset is missing

## Scaffold version sync

`create-litsx-app` embeds published dependency ranges for selected public packages.

Those ranges are synchronized during:

- `yarn changeset:version`
- `yarn changeset:version:snapshot`

so generated apps stay aligned with the versions that the release pipeline has just materialized.
