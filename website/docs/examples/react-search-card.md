# React Search Card

This example shows the kind of React-shaped component that `@litsx/babel-preset-react-compat` is meant to carry during migration.

- `memo(...)`
- `forwardRef(...)`
- `useState(...)`, `useRef(...)`, `useDeferredValue(...)`, `useMemo(...)`
- `lazy(...)` and `Suspense`

The point is not that this is the final native Lit<sup>sx</sup> style. The point is that you can keep this authored shape while moving a codebase toward Lit<sup>sx</sup>.

<script setup>
import {
  reactMigrationExampleSource,
  reactForwardRefExampleSource,
} from "../.vitepress/theme/components/playground-example-source.js";
</script>

## Full Migration Shape

<ClientOnly>
  <litsx-playground
    mode="react-compat"
    exportname="ReactMigrationDemo"
    previewtagname="docs-example-react-search-card"
    filename="/playground/ReactMigrationDemo.tsx"
    panelmaxheight="38rem"
  >{{ reactMigrationExampleSource }}</litsx-playground>
</ClientOnly>

## Ref As Prop

This smaller example isolates the `forwardRef`-style path handled inside the React compatibility preset.

<ClientOnly>
  <litsx-playground
    mode="react-compat"
    exportname="ReactForwardRefDemo"
    previewtagname="docs-example-react-forward-ref"
    filename="/playground/ReactForwardRefDemo.tsx"
    panelmaxheight="30rem"
  >{{ reactForwardRefExampleSource }}</litsx-playground>
</ClientOnly>

## What To Notice

- this is migration-oriented source, not the recommended native end state
- the preset owns the React-only lowering details
- once the migration stabilizes, the next step is to move toward native Lit<sup>sx</sup> primitives and bindings

## Next

- [Migrating from React](../guides/migrating-from-react.md)
- [Transform Recipes](../transforms/)
