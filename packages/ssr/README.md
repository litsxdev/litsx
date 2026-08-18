# @litsx/ssr

Hydratable server rendering for LitSX. It wraps Lit Labs SSR without patching it,
and reconciles the server and client template shapes used by JSX spread props.

```js
import { render } from "@litsx/ssr";
import { hydrate } from "@litsx/ssr/client";
```
