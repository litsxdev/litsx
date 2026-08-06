---
"@litsx/storybook": patch
---

Run authored-story registration before existing LitSX Vite transforms so
generated Storybook previews register and render their custom elements. Validate
property-bound stories with compiled CSF and cover the rendered browser runtime
in the Storybook compatibility matrix.
