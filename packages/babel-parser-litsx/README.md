# `@litsx/babel-parser`

LitSX parser adapter built on top of `@babel/parser`.

This package adapts the parser layer so LitSX-authored syntax can be parsed without losing the authored binding model.

## What It Does

`@litsx/babel-parser` accepts Lit-style JSX attribute prefixes such as:

- `.prop`
- `?attr`
- `@event`

It preserves those authored names in the AST so downstream LitSX transforms can differentiate them from ordinary JSX attributes.

It also participates in the authored-to-virtual source mapping chain used by the LitSX compiler toolchain.

## Install

```bash
npm install @litsx/babel-parser
```

## Usage

```js
import parser from "@litsx/babel-parser";

const ast = parser.parse(
  "const tpl = <button .label={text} @click={handle} ?disabled={flag}></button>;",
  {
    sourceType: "module",
    plugins: ["jsx"],
    sourceFileName: "/src/example.jsx",
  }
);
```

The AST uses the same Babel node families you would expect from `@babel/parser`, but authored LitSX attribute names remain intact.

## Differences from Upstream

Compared with `@babel/parser`, this package:

- accepts Lit-style prefixed JSX attribute names
- preserves authored attribute names for downstream transforms
- carries LitSX-specific virtualization metadata used by higher-level compiler tooling

It delegates actual parsing to `@babel/parser` and keeps the extra LitSX behavior in the authored-source virtualization/remap layer.

## When to Use It

Use this package only when you are assembling low-level LitSX compilation or tooling pieces directly.

For most build integrations, prefer the higher-level public surfaces:

- [`@litsx/compiler`](../compiler/README.md)
- [`@litsx/vite-plugin`](../vite-plugin/README.md)
