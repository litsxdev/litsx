# React Context

This example isolates the new React context support in `@litsx/babel-preset-react-compat`.

It keeps the authored React shape:

- `createContext(...)`
- `<ThemeContext.Provider value={...}>`
- `useContext(ThemeContext)`
- `<ThemeContext.Consumer>{...}</ThemeContext.Consumer>`

but lowers that surface onto Lit<sup>sx</sup> plus `@lit/context`.

<script setup>
import { reactContextExampleSource } from "../.vitepress/theme/components/playground-example-source.js";
</script>

<ClientOnly>
  <litsx-playground
    mode="react-compat"
    exportname="ReactContextDemo"
    previewtagname="docs-example-react-context"
    filename="/playground/ReactContextDemo.tsx"
    panelmaxheight="30rem"
  >{{ reactContextExampleSource }}</litsx-playground>
</ClientOnly>

## What To Notice

- the authored API still looks like React
- the compat layer owns the lowering details
- this is migration support, not a native Lit<sup>sx</sup> context primitive

## Next

- [Migrating from React](../guides/migrating-from-react.md)
- [React Search Card](./react-search-card.md)
