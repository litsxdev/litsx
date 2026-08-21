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

Vite integrations that must run on authored source or on LitSX's generated
output can be placed explicitly around the compiler plugin:

```js
export default createLitsxStorybookConfig({
  vitePlugins: {
    beforeLitsx: [sourceAnalyzer()],
    afterLitsx: [generatedCodeProcessor()],
  },
});
```

These phases are integration-neutral. LitSX does not assume which CSS engine,
asset processor, or analyzer supplies either plugin.

## Storybook compatibility

`@litsx/storybook` supports Storybook 10.4 and 10.5. The integration keeps
Storybook's contextual `makeTitle` callback when indexing stories and provides
a safe identity fallback when the Vite registration transform validates CSF
without an indexer context.
