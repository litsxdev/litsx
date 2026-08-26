![LitSX](https://litsx.dev/title.svg)

[![Test](https://github.com/litsxdev/litsx/actions/workflows/test.yml/badge.svg)](https://github.com/litsxdev/litsx/actions/workflows/test.yml)
[![Release Validate](https://github.com/litsxdev/litsx/actions/workflows/release-validate.yml/badge.svg)](https://github.com/litsxdev/litsx/actions/workflows/release-validate.yml)
[![Release](https://github.com/litsxdev/litsx/actions/workflows/release.yml/badge.svg)](https://github.com/litsxdev/litsx/actions/workflows/release.yml)
[![Docs](https://img.shields.io/badge/docs-litsx.dev-0a7ea4)](https://litsx.dev/)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](./LICENSE)

LitSX is a Lit-first framework and compiler toolchain for authoring web
components with ordinary JSX and TypeScript. It combines Lit's rendering and
web-component model with compiler-driven bindings, functional components,
hooks, scoped custom-element registries, SSR and hydration, and build-tool
integrations.

Source stays standard `.jsx` or `.tsx`; the LitSX compiler turns it into Lit
elements and templates. There is no custom file format or authored `.property`,
`?boolean`, or `@event` syntax.

## Quick start

Create a Vite application with the supported TypeScript, ESLint, and LitSX
configuration:

```sh
npx create-litsx-app my-app --template app
cd my-app
npm install
npm run dev
```

The scaffolder also provides `component`, `design-system`, and `ssr` templates,
plus optional Storybook visual tests for design-system projects. See
[`create-litsx-app`](./packages/create-litsx-app/README.md) for the complete
matrix.

## Authoring LitSX

Configure TypeScript to use the LitSX JSX runtime:

```json
{
  "compilerOptions": {
    "jsx": "react-jsx",
    "jsxImportSource": "@litsx/core"
  }
}
```

Then author normal TSX:

```tsx
import { css, useEmit, useState } from "@litsx/core";

type CounterButtonProps = {
  initialValue?: number;
  label: string;
};

type CounterButtonEvents = {
  "value-change": { value: number };
};

export function CounterButton({ initialValue = 0, label }: CounterButtonProps) {
  const [value, setValue] = useState(initialValue);
  const emit = useEmit<CounterButtonEvents>();

  const increment = () => {
    const nextValue = value + 1;
    setValue(nextValue);
    emit("value-change", { value: nextValue });
  };

  return (
    <button class="counter" on:click={increment}>
      {label}: {value}
    </button>
  );
}

CounterButton.styles = css`
  .counter {
    color: var(--counter-color, currentColor);
  }
`;
```

Use the component with ordinary prop names and the explicit `on:event` channel:

```tsx
<CounterButton
  initialValue={2}
  label="Count"
  on:value-change={(event) => console.log(event.detail.value)}
/>
```

The compiler inspects the destination contract and chooses the correct Lit
attribute, boolean-attribute, property, event, style, spread, and ref binding.
Objects, arrays, callbacks, camel-case props, and `{ attribute: false }`
declarations remain JavaScript properties; HTML, `aria-*`, and `data-*` names
retain platform attribute semantics.

The full source-language contract lives in [`AUTHORING.md`](./AUTHORING.md). It
is the canonical reference for components, bindings, events, spreads, refs,
identity, metadata, styles, light DOM, and compiler behavior.

## What the framework includes

- Functional JSX/TSX components compiled to Lit-backed custom elements.
- Native hooks for state, effects, refs, context, async work, transitions,
  imperative handles, host content, and external stores.
- Typed custom events through `useEmit<EventMap>()` and published component
  event metadata.
- Shadow DOM by default, explicit light DOM, scoped element registries, and
  stable component identity.
- Form-associated custom-element primitives based on `ElementInternals`.
- Suspense, error boundaries, lazy components, request-local resource state,
  and streaming SSR.
- Declarative shadow DOM, document rendering, hydration, module preloads, and
  Vite asset resolution.
- Isolated Tailwind CSS and UnoCSS output for shadow and scoped/global light-DOM
  components, including parallel build isolation.
- Storybook, ESLint, Vite, compiler, and project-scaffolding integrations.
- A separate React-compat compilation pipeline for migrating compatible
  React-authored source without changing native LitSX semantics.

## Recommended entry points

| Package                                                     | Use it for                                                                           |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| [`@litsx/core`](./packages/core/README.md)                  | JSX runtime, components, hooks, events, refs, forms, styles, and runtime primitives. |
| [`@litsx/vite-plugin`](./packages/vite-plugin/README.md)    | The default compilation integration for Vite applications and libraries.             |
| [`@litsx/compiler`](./packages/compiler/README.md)          | Programmatic compilation outside the supported Vite path.                            |
| [`@litsx/ssr`](./packages/ssr/README.md)                    | Scoped server rendering, streaming documents, resources, and hydration.              |
| [`create-litsx-app`](./packages/create-litsx-app/README.md) | New app, component library, design system, SSR, and visual-test projects.            |

Most applications should begin with `create-litsx-app` and should not need to
configure the Babel packages directly.

## Integrations

| Package                                                                    | Scope                                                                           |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| [`@litsx/eslint-plugin`](./packages/eslint-plugin-litsx/README.md)         | Framework-aware ESLint rules and the recommended flat config.                   |
| [`@litsx/storybook`](./packages/storybook/README.md)                       | LitSX CSF/MDX indexing and Storybook's Vite web-components builder.             |
| [`@litsx/tailwind`](./packages/tailwind/README.md)                         | Tailwind CSS v4 component collection and the official Vite adapter.             |
| [`@litsx/unocss`](./packages/unocss/README.md)                             | UnoCSS generation, document/component style routing, and Vite integration.      |
| [`@litsx/scoped-registry-shim`](./packages/scoped-registry-shim/README.md) | Scoped custom-element registry support used by LitSX hosts and renderer mounts. |

## Compiler and compatibility packages

The monorepo contains 19 workspaces. The lower-level packages below are public
for advanced integrations and for composition inside the official toolchain:

| Package                                                                                                                    | Responsibility                                                    |
| -------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| [`@litsx/authoring`](./packages/authoring/README.md)                                                                       | Shared standard-JSX semantics and generated-template encoding.    |
| [`@litsx/typescript-session`](./packages/typescript-session/README.md)                                                     | TypeScript sessions used for destination and component inference. |
| [`@litsx/babel-preset-litsx`](./packages/babel-preset-litsx/README.md)                                                     | Canonical native LitSX lowering pipeline.                         |
| [`@litsx/babel-preset-react-compat`](./packages/babel-preset-react-compat/README.md)                                       | Bounded React-source migration pipeline.                          |
| [`@litsx/babel-plugin-transform-jsx-html-template`](./packages/babel-plugin-transform-jsx-html-template/README.md)         | JSX-to-`lit-html` template lowering.                              |
| [`@litsx/babel-plugin-transform-litsx-scoped-elements`](./packages/babel-plugin-transform-litsx-scoped-elements/README.md) | Scoped-element metadata transform.                                |
| [`@litsx/babel-plugin-litsx-proptypes`](./packages/babel-plugin-litsx-proptypes/README.md)                                 | React `propTypes` compatibility lowering.                         |
| [`@litsx/babel-plugin-shared-hooks`](./packages/babel-plugin-shared-hooks/README.md)                                       | Shared transform helpers for the Babel package family.            |
| [`@litsx/prop-types`](./packages/prop-types/README.md)                                                                     | Runtime support for `propTypes` compatibility.                    |

The React-compat preset is a migration tool, not the native authoring model. It
adapts supported React conventions and rejects unsupported hooks or private
React behavior rather than silently approximating them.

## SSR and hydration

`@litsx/ssr` renders LitSX component trees without globally registering scoped
children. For most applications, `renderDocument(...)` is the server entry
point and `@litsx/ssr/hydration` reconnects the existing server DOM in the
browser. Vite-backed SSR development is an opt-in adapter at
`@litsx/vite-plugin/ssr`; the SSR package itself has no Vite dependency.

```tsx
import { renderDocument } from "@litsx/ssr";
import { ProductPage } from "./ProductPage.tsx";

const result = await renderDocument(<ProductPage product={product} />, {
  title: product.name,
  clientEntry: "/src/client.ts",
});

return result.document;
```

The v1 SSR guarantee is centered on LitSX-authored component trees. Generic Lit
templates can be rendered, but arbitrary third-party Lit components do not
automatically acquire LitSX's scoped SSR and hydration semantics. See the
[`@litsx/ssr` documentation](./packages/ssr/README.md) for the precise boundary.

## Web-component interoperability

Compiled LitSX components expose the standard custom-element boundary:
attributes, properties, `CustomEvent`s, slots, element methods, and refs. Host
frameworks can consume that platform API without understanding LitSX template
syntax.

Generated framework-specific adapters and coordinated host-framework SSR are
not part of the 1.0 scope. Future React, Angular, Vue, Svelte, Solid, Preact, and
other integration work is tracked in the
[`Framework interoperability`](https://github.com/litsxdev/litsx/milestone/1)
milestone.

## Documentation

- [Documentation site](https://litsx.dev/)
- [Native authoring contract](./AUTHORING.md)
- [Release and npm channel guide](./RELEASING.md)
- [SSR starter example](./examples/ssr-starter/README.md)
- Package-specific guides under [`packages/`](./packages)

The website is maintained in the separate
[`litsxdev/litsx.dev`](https://github.com/litsxdev/litsx.dev) repository. Package
README files are also published to npm; the npm page follows the contents of the
version installed under the selected dist-tag.

## Developing the monorepo

Requirements:

- Node.js `^22.18.0 || >=24.11.0`
- Corepack
- Yarn `4.10.3`

Install the workspace and run the main checks:

```sh
corepack enable
yarn install
yarn test
yarn coverage
yarn build
```

Additional release and integration gates:

```sh
yarn test:ssr:browser
yarn test:storybook-compat
yarn release:check
yarn release:smoke:scaffolds
yarn release:test
```

`yarn coverage` enforces the global coverage policy and reports package-level
coverage. Browser hydration, Storybook compatibility, generated scaffolds,
package surfaces, Lit runtime deduplication, and SSR performance have dedicated
gates because unit tests alone do not cover those contracts.

## License

LitSX is licensed under the [Apache License 2.0](./LICENSE).
