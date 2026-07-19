# `@litsx/storybook`

Official Storybook integration helpers for LitSX-authored stories.

This package currently builds on top of `@storybook/web-components-vite` and provides:

- `.stories.litsx` indexing
- structural story-element registration based on LitSX compiler metadata
- a small config helper for Storybook + Vite projects

## Usage

```js
import { createLitsxStorybookConfig } from "@litsx/storybook";

export default createLitsxStorybookConfig();
```
