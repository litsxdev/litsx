# `@litsx/storybook`

Official Storybook integration helpers for standard LitSX JSX/TSX stories.

This package currently builds on top of `@storybook/web-components-vite` and provides:

- normal Storybook indexing for `.stories.jsx` and `.stories.tsx`
- structural story-element registration based on LitSX compiler metadata
- a small config helper for Storybook + Vite projects

## Usage

```js
import { createLitsxStorybookConfig } from "@litsx/storybook";

export default createLitsxStorybookConfig();
```

## Storybook compatibility

`@litsx/storybook` supports Storybook 10.4 and 10.5. The integration keeps
Storybook's contextual `makeTitle` callback when indexing stories and provides
a safe identity fallback when the Vite registration transform validates CSF
without an indexer context.
