---
"@litsx/authoring": minor
"@litsx/babel-plugin-transform-jsx-html-template": minor
"@litsx/babel-preset-litsx": minor
"@litsx/babel-preset-react-compat": minor
"@litsx/compiler": minor
"@litsx/core": minor
"@litsx/storybook": minor
"@litsx/vite-plugin": minor
"create-litsx-app": minor
---

Make standard JSX and TSX the recommended LitSX authoring surface. Infer Lit attribute, boolean, and property bindings from ordinary prop names; add the explicit `on:event` listener convention for HTML and custom elements; preserve native lowercase handler properties; type published custom-event metadata; and keep React `onX` conversion isolated to react-compat.

Make standard `.jsx` and `.tsx` the only authored source formats. Generate projects with ordinary component props, `Component.styles = css\`...\`` assignments, native `tsc` type-checking, standard Prettier formatting, and TSX Storybook stories. Remove the unreleased `.litsx`, prefixed binding, static-hoist, custom TypeScript, Prettier-plugin, and syntax-highlighting compatibility surfaces.
