<script setup>
import { jsxAuthoringExampleSource } from "./playground-example-source.js";
</script>

<template>
  <section class="litsx-home-body">
    <div class="litsx-home-body__container">
      <div class="litsx-home-body__grid">
        <aside class="litsx-home-body__playground">
          <div class="litsx-home-body__playground-shell">
            <div class="litsx-home-body__eyebrow">Live playground</div>
            <h2 class="litsx-home-body__playground-title">
              Try authored Lit<sup>sx</sup> immediately
            </h2>
            <p class="litsx-home-body__playground-copy">
              Edit JSX, inspect the emitted output, and preview the generated web component
              without leaving the home page.
            </p>
            <litsx-playground
              exportname="Composer"
              previewtagname="docs-home-composer-preview"
              filename="/playground/HomeComposer.tsx"
              panelmaxheight="32rem"
            >
              {{ jsxAuthoringExampleSource }}
            </litsx-playground>
          </div>
        </aside>

        <div class="litsx-home-body__content vp-doc">
          <section>
            <h2>What Is Lit<sup>sx</sup>?</h2>
            <p>
              Lit<sup>sx</sup> is a framework for authoring Lit-based web components with JSX.
              The framework has its own runtime model, its own primitives, and its own tooling
              story.
            </p>
            <p>It is designed around one authored model:</p>
            <ul>
              <li>JSX is the language for describing UI</li>
              <li>prop types drive generated web-component property metadata</li>
              <li>static declarations stay with the component</li>
              <li>the runtime target is always Lit and web components</li>
            </ul>
          </section>

          <section>
            <h2>Why Lit<sup>sx</sup></h2>
            <p>Lit<sup>sx</sup> is for teams that want:</p>
            <ul>
              <li>JSX as the language for building component trees</li>
              <li>Lit as the rendering foundation</li>
              <li>web components as the runtime and distribution model</li>
              <li>tree-shakeable runtime primitives instead of a React runtime dependency</li>
              <li>less verbose UI authoring</li>
              <li>a more functional style of component composition</li>
            </ul>
            <p>
              The framework is opinionated about one thing: when you write Lit<sup>sx</sup>, it
              must feel like JSX on top of Lit.
            </p>
            <p>That means the important surface is the code you author:</p>
            <ul>
              <li>typed props</li>
              <li>JSX bindings</li>
              <li>
                static hoists such as <code>^properties(...)</code>,
                <code>^styles(...)</code>, and other <code>^name(...)</code> declarations
              </li>
              <li>runtime hooks such as <code>useStyle(...)</code></li>
            </ul>
          </section>

          <section>
            <h2>What You Get</h2>
            <ul>
              <li>Native Lit<sup>sx</sup> runtime primitives for JSX and web components</li>
              <li>TypeScript language-service support for Lit-flavored authored JSX</li>
              <li>Compile-time inference for generated Lit property descriptors from typed props</li>
              <li>Static hoists that lower to memoized static getters on the generated class</li>
              <li>Project scaffolding through <code>create-litsx-app</code></li>
            </ul>
          </section>

          <section>
            <h2>Who It Is For</h2>
            <ul>
              <li>design systems shipped as web components</li>
              <li>product teams that want JSX authoring without a React runtime dependency</li>
              <li>teams building framework-independent UI primitives</li>
            </ul>
          </section>

          <section>
            <h2>Start Here</h2>
            <ul>
              <li><a href="/guides/why-litsx">Why Lit<sup>sx</sup></a></li>
              <li><a href="/guides/jsx-authoring">How to write Lit<sup>sx</sup></a></li>
              <li><a href="/guides/styling">How to style components</a></li>
              <li><a href="/guides/primitives">What primitives exist</a></li>
              <li><a href="/guides/refs">How refs resolve</a></li>
              <li><a href="/guides/tooling">How to configure tooling</a></li>
              <li><a href="/guides/migrating-from-react">How to migrate from React</a></li>
              <li><a href="/examples/">Real examples</a></li>
            </ul>
          </section>

        </div>
      </div>
    </div>
  </section>
</template>
