# @litsx/babel-preset-litsx

Source: `test/babel-preset-litsx.test.js`

Generated from transform tests.

## Pipeline

- `@litsx/babel-preset-litsx`

## Covered Cases

### Defaults to final html template lowering

#### Interpretation

This case records the authored input and the generated output as a living transform contract.

#### Authored Input

```jsx
export const Greeting = ({ label }) => {
  return <button>{label}</button>;
};
```

#### Generated Output

```js
import { LitElement, html } from "lit";
export class Greeting extends LitElement {
  static properties = {
    label: {
      type: String
    }
  };
  render() {
    return html`<button>${this.label}</button>`;
  }
}
```

### Matches the direct preset plugin factory

#### Interpretation

This case records the authored input and the generated output as a living transform contract.

#### Authored Input

```jsx
import FancyButton from './FancyButton.js';
export const Greeting = ({ label = 'Save' }) => {
  return <FancyButton .label={label} @click={save} />;
};
```

#### Generated Output

```js
import { ShadowDomElementsMixin } from "@litsx/litsx/runtime-infrastructure";
import { LitElement, html } from "lit";
import FancyButton from './FancyButton.js';
export class Greeting extends ShadowDomElementsMixin(LitElement) {
  static properties = {
    label: {
      type: String
    }
  };
  static elements = {
    "fancy-button": FancyButton
  };
  constructor() {
    super();
    this.label ??= 'Save';
  }
  render() {
    return html`<fancy-button .label=${this.label} @click=${save}></fancy-button>`;
  }
}
```

### Detects source features so the compiler can skip unnecessary native plugin passes

#### Interpretation

This case records the authored input and the generated output as a living transform contract.

#### Plain Source

```jsx
export const Greeting = ({ label }) => {
  return <button>{label}</button>;
};
```

#### Generated Output

```js
import { LitElement, html } from "lit";
export class Greeting extends LitElement {
  static properties = {
    label: {
      type: String
    }
  };
  render() {
    return html`<button>${this.label}</button>`;
  }
}
```

#### Feature Source

```jsx
import FancyButton from './FancyButton.js';
import { useRef, useState } from '@litsx/litsx';
export function Greeting({ label }) {
  const ref = useRef(null);
  const [count] = useState(0);
  return <FancyButton ref={ref}>{label}{count}</FancyButton>;
}
```

#### Generated Output

```js
import { ShadowDomElementsMixin } from "@litsx/litsx/runtime-infrastructure";
import { LitElement, html } from "lit";
import FancyButton from './FancyButton.js';
import { useRef, useState, prepareEffects } from '@litsx/litsx';
export class Greeting extends ShadowDomElementsMixin(LitElement) {
  static properties = {
    label: {
      type: String
    }
  };
  static elements = {
    "fancy-button": FancyButton
  };
  render() {
    prepareEffects(this);
    const ref = useRef(this, null);
    const [count] = useState(this, 0);
    return html`<fancy-button .ref=${ref}>${this.label}${count}</fancy-button>`;
  }
}
```

### Can disable final template lowering

#### Interpretation

This case records the authored input and the generated output as a living transform contract.

#### Authored Input

```jsx
export const Greeting = ({ label }) => {
  return <button @click={save}>{label}</button>;
};
```

#### Generated Output

```js
import { LitElement, html } from "lit";
export class Greeting extends LitElement {
  static properties = {
    label: {
      type: String
    }
  };
  render() {
    return html`<button @click=${save}>${this.label}</button>`;
  }
}
```

### Can be consumed through createLitsxPresetPlugins directly

#### Interpretation

This case records the authored input and the generated output as a living transform contract.

#### Authored Input

```jsx
export const Greeting = ({ label }) => {
  return <button @click={save}>{label}</button>;
};
```

#### Generated Output

```js
import { LitElement, html } from "lit";
export class Greeting extends LitElement {
  static properties = {
    label: {
      type: String
    }
  };
  render() {
    return html`<button @click=${save}>${this.label}</button>`;
  }
}
```

### Covers typed props, scoped elements, and final template lowering through the preset

#### Interpretation

This case records the authored input and the generated output as a living transform contract.

#### Authored Input

```jsx
import FancyButton from './FancyButton.js';
type Props = { label: string; count: number };
export const TypedForm = ({ label, count }: Props) => {
  return <FancyButton .label={label}>{count}</FancyButton>;
};
```

#### Generated Output

```js
import { ShadowDomElementsMixin } from "@litsx/litsx/runtime-infrastructure";
import { LitElement, html } from "lit";
import FancyButton from './FancyButton.js';
type Props = {
  label: string;
  count: number;
};
export class TypedForm extends ShadowDomElementsMixin(LitElement) {
  static properties = {
    label: {
      type: String
    },
    count: {
      type: Number
    }
  };
  static elements = {
    "fancy-button": FancyButton
  };
  render() {
    return html`<fancy-button .label=${this.label}>${this.count}</fancy-button>`;
  }
}
```

### Does not lower React-only wrappers in the native preset

#### Interpretation

This case records the authored input and the generated output as a living transform contract.

#### Authored Input

```jsx
import { forwardRef, memo } from 'react';
export const Card = memo(
  forwardRef(function Card({ title }, ref) {
    return <label ref={ref}>{title}</label>;
  })
);
```

#### Generated Output

```js
import { html } from "lit";
import { forwardRef, memo } from 'react';
export const Card = memo(forwardRef(function Card({
  title
}, ref) {
  return html`<label ref="${ref}">${title}</label>`;
}));
```

### Does not lower React propTypes in the native preset anymore

#### Interpretation

This case records the authored input and the generated output as a living transform contract.

#### Authored Input

```jsx
import PropTypes from 'prop-types';
export function Card(props) {
  return <article>{props.title}</article>;
}
Card.propTypes = {
  title: PropTypes.string,
};
```

#### Generated Output

```js
import { LitElement, html } from "lit";
import PropTypes from 'prop-types';
export class Card extends LitElement {
  static properties = {
    title: {
      type: String
    }
  };
  render() {
    return html`<article>${this.title}</article>`;
  }
}
Card.propTypes = {
  title: PropTypes.string
};
```

### Covers a combined native preset path with static hoists, handlers, refs, and scoped elements

#### Interpretation

This case records the authored input and the generated output as a living transform contract.

#### Authored Input

```jsx
import FancyButton from './FancyButton.js';
import { useRef, useState } from '@litsx/litsx';
type Props = { label: string; active: boolean };
export function ActionCard({ label, active }: Props) {
  const buttonRef = useRef(null);
  const [count, setCount] = useState(0);
  ^styles(`:host { display: block; }`);
  ^properties<Props>({ active: { reflect: true } });
  return <FancyButton ref={buttonRef} .label={label} @click={() => setCount(count + 1)}>{active ? count : 0}</FancyButton>;
}
```

#### Generated Output

```js
import { LitsxStaticHoistsMixin, ShadowDomElementsMixin } from "@litsx/litsx/runtime-infrastructure";
import { LitElement, css, html } from "lit";
const _litsx_static_styles = Symbol("litsx.static.styles");
const _litsx_static_properties = Symbol("litsx.static.properties");
import FancyButton from './FancyButton.js';
import { useRef, useState, prepareEffects } from '@litsx/litsx';
type Props = {
  label: string;
  active: boolean;
};
export class ActionCard extends ShadowDomElementsMixin(LitsxStaticHoistsMixin(LitElement)) {
  static get styles() {
    return this.__litsxStatic(_litsx_static_styles, () => this.__litsxResolveStaticValue(css`:host { display: block; }`));
  }
  static get properties() {
    return this.__litsxStatic(_litsx_static_properties, () => this.__litsxMergeProperties({
      label: {
        type: String
      },
      active: {
        type: Boolean
      }
    }, this.__litsxResolveStaticValue({
      active: {
        reflect: true
      }
    })));
  }
  render() {
    prepareEffects(this);
    const buttonRef = useRef(this, null);
    const [count, setCount] = useState(this, 0);
    return html`<fancy-button .ref=${buttonRef} .label=${this.label} @click=${() => setCount(count + 1)}>${this.active ? count : 0}</fancy-button>`;
  }
  static elements = {
    "fancy-button": FancyButton
  };
}
```

### Supports in-memory playground type resolution through the preset

#### Interpretation

This case captures supported authored syntax and the emitted code path used to preserve that behavior.

#### Authored Input

```jsx
type BaseProps = {
        title: string;
        active: boolean;
        payload: Record<string, unknown>;
      };

      type CardProps = Pick<BaseProps, "title" | "active"> & {
        payload: BaseProps["payload"];
      };

      function Card(props: CardProps) {
        return <article>{props.title}</article>;
      }
```

#### Generated Output

```js
import { LitElement, html } from "lit";
type BaseProps = {
  title: string;
  active: boolean;
  payload: Record<string, unknown>;
};
type CardProps = Pick<BaseProps, "title" | "active"> & {
  payload: BaseProps["payload"];
};
class Card extends LitElement {
  static properties = {
    title: {
      type: String
    },
    active: {
      type: Boolean
    },
    payload: {
      type: Object
    }
  };
  render() {
    return html`<article>${this.title}</article>`;
  }
}
```

### Lowers native useState through the canonical preset

#### Interpretation

This case records the authored input and the generated output as a living transform contract.

#### Authored Input

```jsx
import { useState } from '@litsx/litsx';
export function Counter() {
  const [count, setCount] = useState(1);
  return <button @click={() => setCount(count + 1)}>{count}</button>;
}
```

#### Generated Output

```js
import { LitElement, html } from "lit";
import { useState, prepareEffects } from '@litsx/litsx';
export class Counter extends LitElement {
  render() {
    prepareEffects(this);
    const [count, setCount] = useState(this, 1);
    return html`<button @click=${() => setCount(count + 1)}>${count}</button>`;
  }
}
```

### Preserves sibling declarators around native useState through the preset

#### Interpretation

This case records the authored input and the generated output as a living transform contract.

#### Authored Input

```jsx
import { useState } from '@litsx/litsx';
export function Counter() {
  const label = 'ok', [count, setCount] = useState(0);
  setCount(count + 1);
  return <div>{label}: {count}</div>;
}
```

#### Generated Output

```js
import { LitElement, html } from "lit";
import { useState, prepareEffects } from '@litsx/litsx';
export class Counter extends LitElement {
  render() {
    prepareEffects(this);
    const label = 'ok',
      [count, setCount] = useState(this, 0);
    setCount(count + 1);
    return html`<div>${label}: ${count}</div>`;
  }
}
```

### Threads host through local custom hooks that call native useState

#### Interpretation

This case records the authored input and the generated output as a living transform contract.

#### Authored Input

```jsx
import { useState } from '@litsx/litsx';
function useCounter(initial) {
  const [value, setValue] = useState(initial);
  return [value, setValue];
}
export function Counter() {
  const [value, setValue] = useCounter(0);
  return <button @click={() => setValue(value + 1)}>{value}</button>;
}
```

#### Generated Output

```js
import { LitElement, html } from "lit";
import { useState, prepareEffects } from '@litsx/litsx';
function useCounter(_host, initial) {
  const [value, setValue] = useState(_host, initial);
  return [value, setValue];
}
export class Counter extends LitElement {
  render() {
    prepareEffects(this);
    const [value, setValue] = useCounter(this, 0);
    return html`<button @click=${() => setValue(value + 1)}>${value}</button>`;
  }
}
```

### Injects prepareEffects and host args for native effect hooks through the preset

#### Interpretation

This case documents code that is synthesized by the transform, not written directly by the user.

#### Authored Input

```jsx
import { useAfterUpdate } from '@litsx/litsx';
export function Counter() {
  useAfterUpdate(() => {
    this.flag = true;
  }, []);
  return <p>{this.flag}</p>;
}
```

#### Generated Output

```js
import { LitElement, html } from "lit";
import { useAfterUpdate, prepareEffects } from '@litsx/litsx';
export class Counter extends LitElement {
  render() {
    prepareEffects(this);
    useAfterUpdate(this, () => {
      this.flag = true;
    }, []);
    return html`<p>${this.flag}</p>`;
  }
}
```

### Threads host through native custom hooks in the preset

#### Interpretation

This case records the authored input and the generated output as a living transform contract.

#### Authored Input

```jsx
import { useStableCallback, useAfterUpdate } from '@litsx/litsx';
function useCustom(flag) {
  const callback = useStableCallback(() => flag, [flag]);
  useAfterUpdate(() => flag && callback(), [flag, callback]);
  return callback;
}
export function Counter() {
  const value = useCustom(this.flag);
  return <button>{String(value && value())}</button>;
}
```

#### Generated Output

```js
import { LitElement, html } from "lit";
import { useStableCallback, useAfterUpdate, prepareEffects } from '@litsx/litsx';
function useCustom(_host, flag) {
  const callback = useStableCallback(_host, () => flag, [flag]);
  useAfterUpdate(_host, () => flag && callback(), [flag, callback]);
  return callback;
}
export class Counter extends LitElement {
  render() {
    prepareEffects(this);
    const value = useCustom(this, this.flag);
    return html`<button>${String(value && value())}</button>`;
  }
}
```

### Injects host for native useEmit through the preset

#### Interpretation

This case documents code that is synthesized by the transform, not written directly by the user.

#### Authored Input

```jsx
import { useEmit } from '@litsx/litsx';
export function Counter() {
  const emit = useEmit();
  emit('change', this.value, { cancelable: true });
  return <div>{this.value}</div>;
}
```

#### Generated Output

```js
import { LitElement, html } from "lit";
import { useEmit, prepareEffects } from '@litsx/litsx';
export class Counter extends LitElement {
  render() {
    prepareEffects(this);
    const emit = useEmit(this);
    emit('change', this.value, {
      cancelable: true
    });
    return html`<div>${this.value}</div>`;
  }
}
```

### Lowers native useRef DOM bindings through the canonical preset

#### Interpretation

This case records the authored input and the generated output as a living transform contract.

#### Authored Input

```jsx
import { useRef } from '@litsx/litsx';
export function Counter() {
  const buttonRef = useRef(null);
  return <button ref={buttonRef}>Click</button>;
}
```

#### Generated Output

```js
import { LitElement, html } from "lit";
import { prepareEffects, useRef, useCallbackRef } from '@litsx/litsx';
export class Counter extends LitElement {
  get _buttonRefElement() {
    return this.renderRoot?.querySelector("[data-ref=\"_buttonRefElement\"]") ?? this.querySelector("[data-ref=\"_buttonRefElement\"]");
  }
  render() {
    prepareEffects(this);
    const buttonRef = useRef(this, null);
    useCallbackRef(this, () => this._buttonRefElement, node => buttonRef.current = node);
    return html`<button data-ref="_buttonRefElement">Click</button>`;
  }
}
```

### Keeps non-DOM native useRef bindings as mutable refs through the preset

#### Interpretation

This case highlights syntax that should survive the transform unchanged or be preserved semantically.

#### Authored Input

```jsx
import { useRef } from '@litsx/litsx';
export function Counter() {
  const workerRef = useRef(null);
  workerRef.current = 'ok';
  return <div>{workerRef.current}</div>;
}
```

#### Generated Output

```js
import { LitElement, html } from "lit";
import { useRef, prepareEffects } from '@litsx/litsx';
export class Counter extends LitElement {
  render() {
    prepareEffects(this);
    const workerRef = useRef(this, null);
    workerRef.current = 'ok';
    return html`<div>${workerRef.current}</div>`;
  }
}
```

### Does not follow external playground imports when using in-memory mode

#### Interpretation

This case records the authored input and the generated output as a living transform contract.

#### Authored Input

```jsx
import type { CardProps } from './types';
function Card({ title, active }: CardProps) {
  return <article>{title} {active ? 'on' : 'off'}</article>;
}
```

#### Generated Output

```js
import { LitElement, html } from "lit";
import type { CardProps } from './types';
class Card extends LitElement {
  static properties = {
    title: {
      type: String
    },
    active: {
      type: String
    }
  };
  render() {
    return html`<article>${this.title} ${this.active ? 'on' : 'off'}</article>`;
  }
}
```
