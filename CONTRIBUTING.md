# Contributing

## Branches and pull requests

- `main` is the protected integration branch
- external contributors should work from a fork branch
- maintainers can work from feature branches in the main repository
- open pull requests against `main`
- do not assume publish credentials or Marketplace tokens are available in pull requests

## Local validation

Before opening a pull request, run:

```sh
yarn test
yarn release:check
yarn release:smoke:scaffolds
yarn release:test
```

## Changesets

If your pull request changes one or more public packages, add a changeset:

```sh
yarn changeset
```

Use the changeset to declare:

- which packages changed
- whether each should get a `patch`, `minor`, or `major` bump
- a short human summary for changelogs and GitHub Releases

Packages outside npm publication do not need changesets:

- `vscode-litsx`
- `@litsx/vitepress`
- `test/fixtures/dx-smoke-app`

Commit style:

- use Conventional Commits subjects for every commit
- prefer scopes that match the affected package or area
- do not use unscoped free-form subjects when a conventional type applies

Examples:

- `feat(vscode): improve LitSX diagnostics`
- `fix(compiler): preserve empty jsx comments in compat transforms`
- `chore(release): update workspace release tooling`

## CI model

- `Test` runs on:
  - pushes to branches
  - all pull requests, including forks
- `Release Validate` runs on:
  - pushes to `main`
  - pull requests
  - it validates the publishable surface and uploads preview artifacts on `main`
- npm release automation runs through the `Release` workflow on `main`
- `changesets/action` creates or updates the release PR and publishes changed packages after that PR is merged
- VS Code Marketplace publication stays manual through `Publish VS Code Extension`

Maintainers should install the `changeset-bot` GitHub App so pull requests get a bot reminder when a public-package change is missing a changeset.

## Release-related changes

If a pull request changes package publishing, scaffolding, or Marketplace packaging, make sure:

- `RELEASING.md` still matches the actual workflow
- package manifests stay publishable
- generated scaffolds still reference the correct package versions
- `vscode-litsx` packaging still works through `yarn release:vscode:package`
