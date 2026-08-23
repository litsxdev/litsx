---
"@litsx/unocss": patch
---

Isolate generated utilities per component: inject finite candidates from that component's JSX markup and explicit `Component.styles` guards, plus only safelist entries matching its non-finite class patterns. Deduplicate overlapping markup/guard candidates and keep sibling or unrelated module strings out of shadow roots.
