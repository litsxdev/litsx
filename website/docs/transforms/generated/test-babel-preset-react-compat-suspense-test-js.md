# @litsx/babel-preset-react-compat suspense boundaries

Source: `test/babel-preset-react-compat-suspense.test.js`

Generated from transform tests.

## Pipeline

- `@litsx/babel-preset-react-compat`

## Covered Cases

### Rewrites Suspense to a suspense-boundary utility component

#### Interpretation

This case shows the authored JSX/API surface and the normalized output produced by the compatibility transform.

#### Authored Input

```jsx
import { Suspense } from 'react';

export const Screen = () => {
  return (
    <Suspense fallback={<span>loading</span>}>
      <div>ready</div>
    </Suspense>
  );
};
```

#### Generated Output

```js
import { ShadowDomElementsMixin } from "litsx/runtime-infrastructure";
import { ErrorBoundary, SuspenseBoundary } from "litsx";
import { LitElement, html } from "lit";
export class Screen extends ShadowDomElementsMixin(LitElement) {
  render() {
    return html`<suspense-boundary .fallbackRenderer=${() => html`<span>loading</span>`} .contentRenderer=${() => html`<div>ready</div>`}></suspense-boundary>`;
  }
  static elements = {
    "suspense-boundary": SuspenseBoundary
  };
}
```

### Rewrites SuspenseList to a suspense-list utility component

#### Interpretation

This case shows the authored JSX/API surface and the normalized output produced by the compatibility transform.

#### Authored Input

```jsx
import React, { Suspense, SuspenseList } from 'react';

export const Screen = () => {
  return (
    <SuspenseList revealOrder='forwards'>
      <Suspense fallback={<span>One</span>}>
        <div>alpha</div>
      </Suspense>
      <Suspense fallback={<span>Two</span>}>
        <div>beta</div>
      </Suspense>
    </SuspenseList>
  );
};
```

#### Generated Output

```js
import { ShadowDomElementsMixin } from "litsx/runtime-infrastructure";
import { ErrorBoundary, SuspenseBoundary, SuspenseList } from "litsx";
import { LitElement, html } from "lit";
export class Screen extends ShadowDomElementsMixin(LitElement) {
  render() {
    return html`<suspense-list revealOrder="forwards"><suspense-boundary .fallbackRenderer=${() => html`<span>One</span>`} .contentRenderer=${() => html`<div>alpha</div>`}></suspense-boundary><suspense-boundary .fallbackRenderer=${() => html`<span>Two</span>`} .contentRenderer=${() => html`<div>beta</div>`}></suspense-boundary></suspense-list>`;
  }
  static elements = {
    "suspense-boundary": SuspenseBoundary,
    "suspense-list": SuspenseList
  };
}
```

### Keeps lazy registration inside the content renderer of suspense-boundary

#### Interpretation

This case highlights syntax that should survive the transform unchanged or be preserved semantically.

#### Authored Input

```jsx
import { lazy, Suspense } from 'react';

const FancyButton = lazy(() => import('./FancyButton.js'));

export const Screen = () => {
  return (
    <Suspense fallback={<span>loading</span>}>
      <FancyButton />
    </Suspense>
  );
};
```

#### Generated Output

```js
import { ensureLazyElement, ErrorBoundary, SuspenseBoundary } from "litsx";
import { LitElement, html } from "lit";
import { ShadowDomElementsMixin } from "litsx/runtime-infrastructure";
const FancyButton = () => import('./FancyButton.js');
export class Screen extends ShadowDomElementsMixin(LitElement) {
  render() {
    ensureLazyElement(this, "fancy-button", FancyButton);
    return html`<suspense-boundary .fallbackRenderer=${() => html`<span>loading</span>`} .contentRenderer=${() => html`<fancy-button></fancy-button>`}></suspense-boundary>`;
  }
  static elements = {
    "suspense-boundary": SuspenseBoundary
  };
}
```

### Keeps each lazy registration inside its own suspense-boundary when using SuspenseList

#### Interpretation

This case highlights syntax that should survive the transform unchanged or be preserved semantically.

#### Authored Input

```jsx
import { lazy, Suspense, SuspenseList } from 'react';

const AlphaPanel = lazy(() => import('./AlphaPanel.js'));
const BetaPanel = lazy(() => import('./BetaPanel.js'));

export const Screen = () => {
  return (
    <SuspenseList revealOrder='forwards'>
      <Suspense fallback={<span>One</span>}>
        <AlphaPanel />
      </Suspense>
      <Suspense fallback={<span>Two</span>}>
        <BetaPanel />
      </Suspense>
    </SuspenseList>
  );
};
```

#### Generated Output

```js
import { ensureLazyElement, ErrorBoundary, SuspenseBoundary, SuspenseList } from "litsx";
import { LitElement, html } from "lit";
import { ShadowDomElementsMixin } from "litsx/runtime-infrastructure";
const AlphaPanel = () => import('./AlphaPanel.js');
const BetaPanel = () => import('./BetaPanel.js');
export class Screen extends ShadowDomElementsMixin(LitElement) {
  render() {
    ensureLazyElement(this, "alpha-panel", AlphaPanel);
    ensureLazyElement(this, "beta-panel", BetaPanel);
    return html`<suspense-list revealOrder="forwards"><suspense-boundary .fallbackRenderer=${() => html`<span>One</span>`} .contentRenderer=${() => html`<alpha-panel></alpha-panel>`}></suspense-boundary><suspense-boundary .fallbackRenderer=${() => html`<span>Two</span>`} .contentRenderer=${() => html`<beta-panel></beta-panel>`}></suspense-boundary></suspense-list>`;
  }
  static elements = {
    "suspense-boundary": SuspenseBoundary,
    "suspense-list": SuspenseList
  };
}
```

### Handles namespace React.Suspense and React.SuspenseList forms

#### Interpretation

This case captures supported authored syntax and the emitted code path used to preserve that behavior.

#### Authored Input

```jsx
import * as React from 'react';

export const Screen = () => {
  return (
    <React.SuspenseList revealOrder='forwards'>
      <React.Suspense fallback={<span>loading</span>}>
        <div>ready</div>
      </React.Suspense>
    </React.SuspenseList>
  );
};
```

#### Generated Output

```js
import { ShadowDomElementsMixin } from "litsx/runtime-infrastructure";
import { ErrorBoundary, SuspenseBoundary, SuspenseList } from "litsx";
import { LitElement, html } from "lit";
export class Screen extends ShadowDomElementsMixin(LitElement) {
  render() {
    return html`<suspense-list revealOrder="forwards"><suspense-boundary .fallbackRenderer=${() => html`<span>loading</span>`} .contentRenderer=${() => html`<div>ready</div>`}></suspense-boundary></suspense-list>`;
  }
  static elements = {
    "suspense-boundary": SuspenseBoundary,
    "suspense-list": SuspenseList
  };
}
```

### Emits null renderers when suspense has no fallback or content

#### Interpretation

This case records the authored input and the generated output as a living transform contract.

#### Authored Input

```jsx
import { Suspense } from 'react';

export const Screen = () => {
  return <Suspense />;
};
```

#### Generated Output

```js
import { ShadowDomElementsMixin } from "litsx/runtime-infrastructure";
import { ErrorBoundary, SuspenseBoundary } from "litsx";
import { LitElement, html } from "lit";
export class Screen extends ShadowDomElementsMixin(LitElement) {
  render() {
    return html`<suspense-boundary .fallbackRenderer=${() => null} .contentRenderer=${() => null}></suspense-boundary>`;
  }
  static elements = {
    "suspense-boundary": SuspenseBoundary
  };
}
```

### Preserves fragment children inside the suspense content renderer

#### Interpretation

This case records the authored input and the generated output as a living transform contract.

#### Authored Input

```jsx
import { Suspense } from 'react';

export const Screen = () => {
  return (
    <Suspense fallback={<span>loading</span>}>
      <>
        <div>alpha</div>
        <div>beta</div>
      </>
    </Suspense>
  );
};
```

#### Generated Output

```js
import { ShadowDomElementsMixin } from "litsx/runtime-infrastructure";
import { ErrorBoundary, SuspenseBoundary } from "litsx";
import { LitElement, html } from "lit";
export class Screen extends ShadowDomElementsMixin(LitElement) {
  render() {
    return html`<suspense-boundary .fallbackRenderer=${() => html`<span>loading</span>`} .contentRenderer=${() => html`<div>alpha</div><div>beta</div>`}></suspense-boundary>`;
  }
  static elements = {
    "suspense-boundary": SuspenseBoundary
  };
}
```

### Supports boolean fallbacks and single expression children

#### Interpretation

This case captures supported authored syntax and the emitted code path used to preserve that behavior.

#### Authored Input

```jsx
import { Suspense as Wait } from 'react';

export const Screen = ({ readyView }) => {
  return <Wait fallback>{readyView}</Wait>;
};
```

#### Generated Output

```js
import { ShadowDomElementsMixin } from "litsx/runtime-infrastructure";
import { ErrorBoundary, SuspenseBoundary } from "litsx";
import { LitElement, html } from "lit";
export class Screen extends ShadowDomElementsMixin(LitElement) {
  static properties = {
    readyView: {
      type: String
    }
  };
  static elements = {
    "suspense-boundary": SuspenseBoundary
  };
  render() {
    return html`<suspense-boundary .fallbackRenderer=${() => true} .contentRenderer=${() => this.readyView}></suspense-boundary>`;
  }
}
```

### Supports string fallbacks and plain text children

#### Interpretation

This case captures supported authored syntax and the emitted code path used to preserve that behavior.

#### Authored Input

```jsx
import { Suspense } from 'react';

export const Screen = () => {
  return <Suspense fallback="loading">ready</Suspense>;
};
```

#### Generated Output

```js
import { ShadowDomElementsMixin } from "litsx/runtime-infrastructure";
import { ErrorBoundary, SuspenseBoundary } from "litsx";
import { LitElement, html } from "lit";
export class Screen extends ShadowDomElementsMixin(LitElement) {
  render() {
    return html`<suspense-boundary .fallbackRenderer=${() => "loading"} .contentRenderer=${() => "ready"}></suspense-boundary>`;
  }
  static elements = {
    "suspense-boundary": SuspenseBoundary
  };
}
```

### Treats empty fallback expressions as boolean true instead of crashing

#### Interpretation

This case records the authored input and the generated output as a living transform contract.

#### Authored Input

```jsx
import { Suspense } from 'react';

export const Screen = () => {
  return <Suspense fallback={true}><div>ready</div></Suspense>;
};
```

#### Generated Output

```js
import { ShadowDomElementsMixin } from "litsx/runtime-infrastructure";
import { ErrorBoundary, SuspenseBoundary } from "litsx";
import { LitElement, html } from "lit";
export class Screen extends ShadowDomElementsMixin(LitElement) {
  render() {
    return html`<suspense-boundary .fallbackRenderer=${() => true} .contentRenderer=${() => html`<div>ready</div>`}></suspense-boundary>`;
  }
  static elements = {
    "suspense-boundary": SuspenseBoundary
  };
}
```

### Leaves non-React namespace suspense lookalikes untouched

#### Interpretation

This case highlights syntax that should survive the transform unchanged or be preserved semantically.

#### Authored Input

```jsx
import * as UI from 'ui-kit';

export const Screen = () => {
  return <UI.Suspense fallback="loading"><div>ready</div></UI.Suspense>;
};
```

#### Generated Output

```js
import { ErrorBoundary } from "litsx";
import { LitElement, html } from "lit";
import * as UI from 'ui-kit';
export class Screen extends LitElement {
  render() {
    return html`<UI.Suspense fallback="loading"><div>ready</div></UI.Suspense>`;
  }
}
```

### Drops key attributes from suspense lists imported under aliases

#### Interpretation

This case records the authored input and the generated output as a living transform contract.

#### Authored Input

```jsx
import { Suspense as Wait, SuspenseList as Queue } from 'react';

export const Screen = () => {
  return (
    <Queue key="outer" revealOrder="forwards">
      <Wait fallback={<span>One</span>}>
        <div>alpha</div>
      </Wait>
    </Queue>
  );
};
```

#### Generated Output

```js
import { ShadowDomElementsMixin } from "litsx/runtime-infrastructure";
import { ErrorBoundary, SuspenseBoundary, SuspenseList } from "litsx";
import { LitElement, html } from "lit";
export class Screen extends ShadowDomElementsMixin(LitElement) {
  render() {
    return html`<suspense-list revealOrder="forwards"><suspense-boundary .fallbackRenderer=${() => html`<span>One</span>`} .contentRenderer=${() => html`<div>alpha</div>`}></suspense-boundary></suspense-list>`;
  }
  static elements = {
    "suspense-boundary": SuspenseBoundary,
    "suspense-list": SuspenseList
  };
}
```

### Renders numeric fallbacks and null content when suspense children are empty comments

#### Interpretation

This case records the authored input and the generated output as a living transform contract.

#### Authored Input

```jsx
import { Suspense } from 'react';

export const Screen = () => {
  return <Suspense fallback={404}>{/* empty */}</Suspense>;
};
```

#### Generated Output

```js
import { ShadowDomElementsMixin } from "litsx/runtime-infrastructure";
import { ErrorBoundary, SuspenseBoundary } from "litsx";
import { LitElement, html } from "lit";
export class Screen extends ShadowDomElementsMixin(LitElement) {
  render() {
    return html`<suspense-boundary .fallbackRenderer=${() => 404} .contentRenderer=${() => null}></suspense-boundary>`;
  }
  static elements = {
    "suspense-boundary": SuspenseBoundary
  };
}
```

### Moves only matching ensureLazyElement calls into suspense content renderers

#### Interpretation

This case records the authored input and the generated output as a living transform contract.

#### Authored Input

```jsx
import { ensureLazyElement } from 'litsx';
import { Suspense } from 'react';

const AlphaPanel = () => null;
const BetaPanel = () => null;

export const Screen = () => {
  ensureLazyElement(this, 'alpha-panel', AlphaPanel);
  ensureLazyElement(this, 'beta-panel', BetaPanel);
  return (
    <section>
      <Suspense fallback={<span>loading</span>}>
        <alpha-panel />
      </Suspense>
    </section>
  );
};
```

#### Generated Output

```js
import { ShadowDomElementsMixin } from "litsx/runtime-infrastructure";
import { LitElement, html } from "lit";
import { ensureLazyElement, ErrorBoundary, SuspenseBoundary } from 'litsx';
const AlphaPanel = () => null;
const BetaPanel = () => null;
export class Screen extends ShadowDomElementsMixin(LitElement) {
  render() {
    ensureLazyElement(this, 'beta-panel', BetaPanel);
    return html`<section><suspense-boundary .fallbackRenderer=${() => html`<span>loading</span>`} .contentRenderer=${() => {
      ensureLazyElement(this, 'alpha-panel', AlphaPanel);
      return html`<alpha-panel></alpha-panel>`;
    }}></suspense-boundary></section>`;
  }
  static elements = {
    "suspense-boundary": SuspenseBoundary
  };
}
```

### Does not introduce boundary-key or list-key attributes in the component model

#### Interpretation

This case records the authored input and the generated output as a living transform contract.

#### Authored Input

```jsx
import { Suspense, SuspenseList } from 'react';

export const Screen = () => {
  return (
    <SuspenseList revealOrder='forwards'>
      <Suspense fallback={<span>One</span>}>
        <div>alpha</div>
      </Suspense>
    </SuspenseList>
  );
};
```

#### Generated Output

```js
import { ShadowDomElementsMixin } from "litsx/runtime-infrastructure";
import { ErrorBoundary, SuspenseBoundary, SuspenseList } from "litsx";
import { LitElement, html } from "lit";
export class Screen extends ShadowDomElementsMixin(LitElement) {
  render() {
    return html`<suspense-list revealOrder="forwards"><suspense-boundary .fallbackRenderer=${() => html`<span>One</span>`} .contentRenderer=${() => html`<div>alpha</div>`}></suspense-boundary></suspense-list>`;
  }
  static elements = {
    "suspense-boundary": SuspenseBoundary,
    "suspense-list": SuspenseList
  };
}
```

### Uses light-dom utility components rather than runtime helper functions

#### Interpretation

This case records the authored input and the generated output as a living transform contract.

#### Authored Input

```jsx
import { Suspense } from 'react';

export const Screen = () => {
  return (
    <Suspense fallback={<span>loading</span>}>
      <div>ready</div>
    </Suspense>
  );
};
```

#### Generated Output

```js
import { ShadowDomElementsMixin } from "litsx/runtime-infrastructure";
import { ErrorBoundary, SuspenseBoundary } from "litsx";
import { LitElement, html } from "lit";
export class Screen extends ShadowDomElementsMixin(LitElement) {
  render() {
    return html`<suspense-boundary .fallbackRenderer=${() => html`<span>loading</span>`} .contentRenderer=${() => html`<div>ready</div>`}></suspense-boundary>`;
  }
  static elements = {
    "suspense-boundary": SuspenseBoundary
  };
}
```

### Emits final html output after lowering Suspense before the template pass

#### Interpretation

This case records the authored input and the generated output as a living transform contract.

#### Authored Input

```jsx
import { Suspense } from 'react';

export const Screen = () => {
  return (
    <Suspense fallback={<span>loading</span>}>
      <div>ready</div>
    </Suspense>
  );
};
```

#### Generated Output

```js
import { ShadowDomElementsMixin } from "litsx/runtime-infrastructure";
import { ErrorBoundary, SuspenseBoundary } from "litsx";
import { LitElement, html } from "lit";
export class Screen extends ShadowDomElementsMixin(LitElement) {
  render() {
    return html`<suspense-boundary .fallbackRenderer=${() => html`<span>loading</span>`} .contentRenderer=${() => html`<div>ready</div>`}></suspense-boundary>`;
  }
  static elements = {
    "suspense-boundary": SuspenseBoundary
  };
}
```

### Lowers nested error and suspense structures through multiple recursion levels

#### Interpretation

This case records the authored input and the generated output as a living transform contract.

#### Authored Input

```jsx
import { ErrorBoundary } from 'react-error-boundary';
import { lazy, Suspense, SuspenseList } from 'react';

const AlphaPanel = lazy(() => import('./AlphaPanel.js'));

export const Screen = () => {
  return (
    <ErrorBoundary fallback={<p>outer-fallback</p>}>
      <section>
        <SuspenseList revealOrder='forwards'>
          <Suspense fallback={<span>alpha-loading</span>}>
            <AlphaPanel />
          </Suspense>
          <Suspense fallback={<span>beta-loading</span>}>
            <article><strong>beta-ready</strong></article>
          </Suspense>
        </SuspenseList>
      </section>
    </ErrorBoundary>
  );
};
```

#### Generated Output

```js
import { ensureLazyElement, ErrorBoundary, SuspenseBoundary, SuspenseList } from "litsx";
import { LitElement, html } from "lit";
import { ShadowDomElementsMixin } from "litsx/runtime-infrastructure";
const AlphaPanel = () => import('./AlphaPanel.js');
export class Screen extends ShadowDomElementsMixin(LitElement) {
  render() {
    ensureLazyElement(this, "alpha-panel", AlphaPanel);
    return html`<error-boundary .fallbackRenderer=${() => html`<p>outer-fallback</p>`} .contentRenderer=${() => html`<section><suspense-list revealOrder="forwards"><suspense-boundary .fallbackRenderer=${() => html`<span>alpha-loading</span>`} .contentRenderer=${() => html`<alpha-panel></alpha-panel>`}></suspense-boundary><suspense-boundary .fallbackRenderer=${() => html`<span>beta-loading</span>`} .contentRenderer=${() => html`<article><strong>beta-ready</strong></article>`}></suspense-boundary></suspense-list></section>`}></error-boundary>`;
  }
  static elements = {
    "error-boundary": ErrorBoundary,
    "suspense-boundary": SuspenseBoundary,
    "suspense-list": SuspenseList
  };
}
```
