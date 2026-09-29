---
"@litsx/babel-preset-litsx": patch
"@litsx/babel-preset-react-compat": patch
"@litsx/scoped-registry-shim": patch
---

Compile `SuspenseList.revealOrder` as a property for native and React-compatible JSX, including string literals, aliases, and namespace imports. Replay properties assigned before a scoped custom element upgrade through the real class accessors so React Context providers initialize and propagate updates in light DOM.
