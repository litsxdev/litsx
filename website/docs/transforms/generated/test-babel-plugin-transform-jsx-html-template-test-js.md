# @litsx/babel-plugin-transform-jsx-html-template

Source: `test/babel-plugin-transform-jsx-html-template.test.js`

Generated from transform tests.

## Pipeline

- `@litsx/babel-plugin-transform-jsx-html-template`

## Covered Cases

### Emits lit-html templates

#### Interpretation

This case records the authored input and the generated output as a living transform contract.

#### Authored Input

```jsx
const view = <button .label={text}>{count}</button>;
```

#### Generated Output

```js
import { html } from "lit";
const view = html`<button .label=${text}>${count}</button>`;
```

### Keeps Lit-style listener attributes intact

#### Interpretation

This case highlights syntax that should survive the transform unchanged or be preserved semantically.

#### Authored Input

```jsx
const view = <button @click={handleClick}></button>;
```

#### Generated Output

```js
import { html } from "lit";
const view = html`<button @click=${handleClick}></button>`;
```

### Keeps later lit-style attributes aligned in sourcemaps

#### Interpretation

This case highlights syntax that should survive the transform unchanged or be preserved semantically.

#### Authored Input

```jsx
const view = <button @click={save} .value={name} ?disabled={busy}></button>;
```

#### Generated Output

```js
import { html } from "lit";
const view = html`<button @click=${save} .value=${name} ?disabled=${busy}></button>`;
```

### Leaves React-style listener syntax untouched

#### Interpretation

This case highlights syntax that should survive the transform unchanged or be preserved semantically.

#### Authored Input

```jsx
const view = <button onClick={handleClick}></button>;
```

#### Generated Output

```js
import { html } from "lit";
const view = html`<button onClick="${handleClick}"></button>`;
```

### Handles nested nodes and boolean attributes

#### Interpretation

This case captures supported authored syntax and the emitted code path used to preserve that behavior.

#### Authored Input

```jsx
const view = (
        <section class="dashboard">
          <button ?disabled={isDisabled} .label={label}>
            {greeting}
            {items.map((item) => (
              <span class="item" key={item.id}>
                <strong>{item.label}</strong>
              </span>
            ))}
          </button>
        </section>
      );
```

#### Generated Output

```js
import { html } from "lit";
const view = html`<section class="dashboard"><button ?disabled=${isDisabled} .label=${label}>${greeting}${items.map(item => html`<span class="item" key="${item.id}"><strong>${item.label}</strong></span>`)}</button></section>`;
```

### Renders capitalized components as HTML elements

#### Interpretation

This case records the authored input and the generated output as a living transform contract.

#### Authored Input

```jsx
const view = <FancyButton foo="bar" baz={value} />;
```

#### Generated Output

```js
import { html } from "lit";
const view = html`<FancyButton foo="bar" baz="${value}"></FancyButton>`;
```

### Supports bare boolean attributes without values

#### Interpretation

This case captures supported authored syntax and the emitted code path used to preserve that behavior.

#### Authored Input

```jsx
const view = <button disabled></button>;
```

#### Generated Output

```js
import { html } from "lit";
const view = html`<button disabled></button>`;
```

### Does not self-close non-void HTML elements

#### Interpretation

This case records the authored input and the generated output as a living transform contract.

#### Authored Input

```jsx
const view = <div class="host" />;
```

#### Generated Output

```js
import { html } from "lit";
const view = html`<div class="host"></div>`;
```

### Does not self-close iframe elements

#### Interpretation

This case records the authored input and the generated output as a living transform contract.

#### Authored Input

```jsx
const view = <iframe srcdoc={doc} sandbox="allow-scripts" />;
```

#### Generated Output

```js
import { html } from "lit";
const view = html`<iframe srcdoc="${doc}" sandbox="allow-scripts"></iframe>`;
```

### Keeps opening and closing tags aligned for kebab-case custom elements with attributes

#### Interpretation

This case highlights syntax that should survive the transform unchanged or be preserved semantically.

#### Authored Input

```jsx
const view = (
        <suspense-boundary fallback={<span>loading</span>}>
          <span>ready</span>
        </suspense-boundary>
      );
```

#### Generated Output

```js
import { html } from "lit";
const view = html`<suspense-boundary fallback="${html`<span>loading</span>`}"><span>ready</span></suspense-boundary>`;
```

### Keeps Lit-style prefixed attributes on kebab-case custom elements

#### Interpretation

This case highlights syntax that should survive the transform unchanged or be preserved semantically.

#### Authored Input

```jsx
const view = (
        <suspense-boundary .contentRenderer={() => <span>ready</span>} @resolve={handleResolve} ?pending={isPending}>
          <span>fallback</span>
        </suspense-boundary>
      );
```

#### Generated Output

```js
import { html } from "lit";
const view = html`<suspense-boundary .contentRenderer=${() => html`<span>ready</span>`} @resolve=${handleResolve} ?pending=${isPending}><span>fallback</span></suspense-boundary>`;
```

### Trims whitespace around text nodes in templates

#### Interpretation

This case records the authored input and the generated output as a living transform contract.

#### Authored Input

```jsx
const view = <div>\n      hello\n    </div>;
```

#### Generated Output

```js
import { html } from "lit";
const view = html`<div>\n      hello\n    </div>`;
```

### Transforms namespaced component tags

#### Interpretation

This case records the authored input and the generated output as a living transform contract.

#### Authored Input

```jsx
const view = <x:custom foo={value} />;
```

#### Generated Output

```js
import { html } from "lit";
const view = html`${x.custom({
  foo: value
}, html``)}`;
```

### Ignores empty JSX expression containers

#### Interpretation

This case records the authored input and the generated output as a living transform contract.

#### Authored Input

```jsx
const view = <div>{}</div>;
```

#### Generated Output

```js
import { html } from "lit";
const view = html`<div></div>`;
```

### Transforms JSX in nested functions

#### Interpretation

This case records the authored input and the generated output as a living transform contract.

#### Authored Input

```jsx
const createFactory = () => {
        const render = () => {
          const inline = () => <span>{value}</span>;
          return inline;
        };
        return render();
      };
```

#### Generated Output

```js
import { html } from "lit";
const createFactory = () => {
  const render = () => {
    const inline = () => html`<span>${value}</span>`;
    return inline;
  };
  return render();
};
```

### Throws on unsupported spread attributes

#### Interpretation

This case documents an intentionally unsupported construct and the failure mode that callers should expect.

#### Authored Input

```jsx
const x = <div {...rest}></div>;
```

#### Generated Error

```txt
unknown file: JSXSpreadAttribute is not supported
```

#### Expected Error

```txt
JSXSpreadAttribute is not supported
```

### Throws on spread children

#### Interpretation

This case documents an intentionally unsupported construct and the failure mode that callers should expect.

#### Authored Input

```jsx
const x = <div>{...items}</div>;
```

#### Generated Error

```txt
unknown file: JSXSpreadChild is not supported
```

#### Expected Error

```txt
JSXSpreadChild is not supported
```

### Handles fragments without wrapping element

#### Interpretation

This case captures supported authored syntax and the emitted code path used to preserve that behavior.

#### Authored Input

```jsx
const view = <><span>one</span><span>two</span></>;
```

#### Generated Output

```js
import { html } from "lit";
const view = html`<span>one</span><span>two</span>`;
```

### Creates bare template literals when tag is disabled

#### Interpretation

This case records the authored input and the generated output as a living transform contract.

- No inline source fixture extracted for this case.

### Creates bare template literals when the plugin tag option is empty

#### Interpretation

This case records the authored input and the generated output as a living transform contract.

#### Authored Input

```jsx
const view = <div>{label}</div>;
```

#### Generated Output

```js
const view = `<div>${label}</div>`;
```

### Adds a custom tagged import next to existing lit imports

#### Interpretation

This case records the authored input and the generated output as a living transform contract.

#### Authored Input

```jsx
import { LitElement } from "lit";
const view = <div>{label}</div>;
```

#### Generated Output

```js
import { LitElement, svg } from "lit";
const view = svg`<div>${label}</div>`;
```

### Creates component calls for namespaced components and spread props

#### Interpretation

This case records the authored input and the generated output as a living transform contract.

- No inline source fixture extracted for this case.
