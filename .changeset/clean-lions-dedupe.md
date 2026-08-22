---
"@litsx/core": patch
---

Consume `adoptStyles` through the public `lit` peer instead of declaring a separate direct `@lit/reactive-element` dependency, reducing the risk of loading multiple Lit runtime copies.
