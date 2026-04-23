# @litsx/babel-preset-react-compat

Source: `test/babel-preset-react-compat.test.js`

Generated from transform tests.

## Pipeline

- `@litsx/babel-preset-react-compat`

## Covered Cases

### Transforms a component using propTypes, useRef, and JSX

#### Interpretation

This case records the authored input and the generated output as a living transform contract.

#### Authored Input

```jsx
import { useRef, useEffect } from 'react';
      import PropTypes from 'prop-types';
      import FancyButton from './FancyButton.js';

      const FancyForm = (props) => {
        const buttonRef = useRef(null);

        useEffect(() => {
          buttonRef.current.focus();
        }, []);

        return (
          <div>
            <FancyButton ref={buttonRef} .label={props.label} />
          </div>
        );
      };

      FancyForm.propTypes = {
        label: PropTypes.string,
      };
```

#### Generated Output

```js
import { prepareEffects, useAfterUpdate, useRef, ErrorBoundary } from "litsx";
import { LitsxStaticHoistsMixin, ShadowDomElementsMixin } from "litsx/runtime-infrastructure";
import { LitElement, html } from "lit";
const _litsx_static_properties = Symbol("litsx.static.properties");
import FancyButton from './FancyButton.js';
class FancyForm extends ShadowDomElementsMixin(LitsxStaticHoistsMixin(LitElement)) {
  static get properties() {
    return this.__litsxStatic(_litsx_static_properties, () => this.__litsxMergeProperties({
      label: {
        type: String
      }
    }, this.__litsxResolveStaticValue({
      label: {
        type: String
      }
    })));
  }
  render() {
    prepareEffects(this);
    const buttonRef = useRef(this, null);
    useAfterUpdate(this, () => {
      buttonRef.current.focus();
    }, []);
    return html`<div><fancy-button .ref=${buttonRef} .label=${this.label}></fancy-button></div>`;
  }
  static elements = {
    "fancy-button": FancyButton
  };
}
```

### Normalizes React DOM and form semantics

#### Interpretation

This case records the authored input and the generated output as a living transform contract.

#### Authored Input

```jsx
export const FilterForm = ({ query, enabled, onQueryChange, onEnabledChange }) => {
        return (
          <label htmlFor="search">
            Search
            <input id="search" value={query} onChange={onQueryChange} />
            <input type="checkbox" checked={enabled} onChange={onEnabledChange} />
          </label>
        );
      };
```

#### Generated Output

```js
import { ErrorBoundary } from "litsx";
import { LitElement, html } from "lit";
export class FilterForm extends LitElement {
  static properties = {
    query: {
      type: String
    },
    enabled: {
      type: String
    },
    onQueryChange: {
      type: String
    },
    onEnabledChange: {
      type: String
    }
  };
  render() {
    return html`<label for="search">Search<input id="search" .value=${this.query} @input=${this.onQueryChange}><input type="checkbox" ?checked=${this.enabled} @change=${this.onEnabledChange}></label>`;
  }
}
```

### Preserves React event alias behavior for focus, blur, and double click

#### Interpretation

This case records the authored input and the generated output as a living transform contract.

#### Authored Input

```jsx
export const AliasedEvents = ({ onFocus, onBlur, onDoubleClick }) => {
        return (
          <section>
            <input onFocus={onFocus} onBlur={onBlur} />
            <button onDoubleClick={onDoubleClick}>Open</button>
          </section>
        );
      };
```

#### Generated Output

```js
import { ErrorBoundary } from "litsx";
import { LitElement, html } from "lit";
export class AliasedEvents extends LitElement {
  static properties = {
    onFocus: {
      type: String
    },
    onBlur: {
      type: String
    },
    onDoubleClick: {
      type: String
    }
  };
  render() {
    return html`<section><input @focusin=${{
      handleEvent: this.onFocus,
      capture: true
    }} @focusout=${{
      handleEvent: this.onBlur,
      capture: true
    }}><button @dblclick=${this.onDoubleClick}>Open</button></section>`;
  }
}
```

### Can stop before final template lowering when jsxTemplate is disabled

#### Interpretation

This case records the authored input and the generated output as a living transform contract.

#### Authored Input

```jsx
export const FilterForm = ({ query, onQueryChange }) => {
        return <input value={query} onChange={onQueryChange} />;
      };
```

#### Generated Output

```js
import { ErrorBoundary } from "litsx";
import { LitElement, html } from "lit";
export class FilterForm extends LitElement {
  static properties = {
    query: {
      type: String
    },
    onQueryChange: {
      type: String
    }
  };
  render() {
    return html`<input .value=${this.query} @input=${this.onQueryChange}>`;
  }
}
```

### Applies event aliases before final template lowering is skipped

#### Interpretation

This case records the authored input and the generated output as a living transform contract.

#### Authored Input

```jsx
export const AliasedEvents = ({ onFocus, onBlur, onDoubleClick }) => {
        return (
          <section>
            <input onFocus={onFocus} onBlur={onBlur} />
            <button onDoubleClick={onDoubleClick}>Open</button>
          </section>
        );
      };
```

#### Generated Output

```js
import { ErrorBoundary } from "litsx";
import { LitElement, html } from "lit";
export class AliasedEvents extends LitElement {
  static properties = {
    onFocus: {
      type: String
    },
    onBlur: {
      type: String
    },
    onDoubleClick: {
      type: String
    }
  };
  render() {
    return html`<section><input @focusin=${{
      handleEvent: this.onFocus,
      capture: true
    }} @focusout=${{
      handleEvent: this.onBlur,
      capture: true
    }}><button @dblclick=${this.onDoubleClick}>Open</button></section>`;
  }
}
```

### Lowers createContext, Provider, and useContext through the compat preset

#### Interpretation

This case records the authored input and the generated output as a living transform contract.

#### Authored Input

```jsx
import React, { createContext, useContext } from "react";

      const ThemeContext = createContext("light");

      export function Toolbar() {
        const theme = useContext(ThemeContext);
        return <button className={theme}>{theme}</button>;
      }

      export function App() {
        return (
          <ThemeContext.Provider value="dark">
            <Toolbar />
          </ThemeContext.Provider>
        );
      }
```

#### Generated Output

```js
import { ShadowDomElementsMixin } from "litsx/runtime-infrastructure";
import { prepareEffects, ErrorBoundary } from "litsx";
import { LitElement, html } from "lit";
import { createContext, useContext, LitsxContextProviderElement as LitsxContextProvider } from "litsx/context";
const ThemeContext = createContext("light");
export class Toolbar extends LitElement {
  render() {
    prepareEffects(this);
    const theme = useContext(this, ThemeContext);
    return html`<button class="${theme}">${theme}</button>`;
  }
}
export class App extends ShadowDomElementsMixin(LitElement) {
  render() {
    return html`<litsx-context-provider .context=${ThemeContext} .value=${"dark"}><toolbar></toolbar></litsx-context-provider>`;
  }
  static elements = {
    "litsx-context-provider": LitsxContextProvider,
    "toolbar": Toolbar
  };
}
```

### Lowers Context.Consumer and preserves context helpers before final template lowering

#### Interpretation

This case records the authored input and the generated output as a living transform contract.

#### Authored Input

```jsx
import { createContext } from "react";

      const ThemeContext = createContext("light");

      export function App() {
        return (
          <ThemeContext.Provider value="dark">
            <ThemeContext.Consumer>
              {(theme) => <span className={theme}>{theme}</span>}
            </ThemeContext.Consumer>
          </ThemeContext.Provider>
        );
      }
```

#### Generated Output

```js
import { ShadowDomElementsMixin } from "litsx/runtime-infrastructure";
import { ErrorBoundary } from "litsx";
import { LitElement, html } from "lit";
import { createContext, renderContext, LitsxContextProviderElement as LitsxContextProvider } from "litsx/context";
const ThemeContext = createContext("light");
export class App extends ShadowDomElementsMixin(LitElement) {
  render() {
    return html`<litsx-context-provider .context=${ThemeContext} .value=${"dark"}>${renderContext(this, ThemeContext, theme => html`<span class="${theme}">${theme}</span>`)}</litsx-context-provider>`;
  }
  static elements = {
    "litsx-context-provider": LitsxContextProvider
  };
}
```

### Rewrites local custom hooks that call useContext with the active host

#### Interpretation

This case shows the authored JSX/API surface and the normalized output produced by the compatibility transform.

#### Authored Input

```jsx
import { createContext, useContext } from "react";

      const ThemeContext = createContext("light");

      function useThemeLabel(prefix) {
        const theme = useContext(ThemeContext);
        return prefix + ":" + theme;
      }

      export function Toolbar() {
        const label = useThemeLabel("theme");
        return <span>{label}</span>;
      }
```

#### Generated Output

```js
import { prepareEffects, ErrorBoundary } from "litsx";
import { LitElement, html } from "lit";
import { createContext, useContext } from "litsx/context";
const ThemeContext = createContext("light");
function useThemeLabel(_host, prefix) {
  const theme = useContext(_host, ThemeContext);
  return prefix + ":" + theme;
}
export class Toolbar extends LitElement {
  render() {
    prepareEffects(this);
    const label = useThemeLabel(this, "theme");
    return html`<span>${label}</span>`;
  }
}
```

### Lowers memo and forwardRef together through the preset

#### Interpretation

This case records the authored input and the generated output as a living transform contract.

#### Authored Input

```jsx
import React, { forwardRef, memo } from "react";

      export const CardShell = memo(
        forwardRef(function CardShell({ title }, ref) {
          return <label ref={ref}>{title}</label>;
        })
      );
```

#### Generated Output

```js
import { useCallbackRef, prepareEffects, ErrorBoundary } from "litsx";
import { LitElement, html } from "lit";
export class CardShell extends LitElement {
  static properties = {
    title: {
      type: String
    },
    ref: {
      type: Object,
      attribute: false
    }
  };
  render() {
    prepareEffects(this);
    useCallbackRef(this, () => this.renderRoot?.querySelector("[data-ref=\"_refElement\"]") ?? this.querySelector("[data-ref=\"_refElement\"]"), node => {
      const componentRef = this.ref;
      if (typeof componentRef === "function") {
        componentRef(node);
      } else if (componentRef && typeof componentRef === "object") {
        componentRef.current = node;
      }
    }, [this.ref]);
    return html`<label data-ref="_refElement">${this.title}</label>`;
  }
}
```

### Can force light DOM output for react-compat migrations

#### Interpretation

This case records the authored input and the generated output as a living transform contract.

#### Authored Input

```jsx
import FancyButton from './FancyButton.js';

      export const LightForm = ({ label }) => {
        return (
          <section>
            <FancyButton .label={label} />
          </section>
        );
      };
```

#### Generated Output

```js
import { ShadowDomElementsMixin } from "litsx/runtime-infrastructure";
import { ErrorBoundary } from "litsx";
import { LitElement, html } from "lit";
import FancyButton from './FancyButton.js';
export class LightForm extends ShadowDomElementsMixin(LitElement) {
  static properties = {
    label: {
      type: String
    }
  };
  static elements = {
    "fancy-button": FancyButton
  };
  render() {
    return html`<section><fancy-button .label=${this.label}></fancy-button></section>`;
  }
}
```

### Rewrites ErrorBoundary and Suspense together to final Lit output

#### Interpretation

This case shows the authored JSX/API surface and the normalized output produced by the compatibility transform.

#### Authored Input

```jsx
import { ErrorBoundary } from "react-error-boundary";
      import { Suspense, lazy } from "react";

      const ResultsPanel = lazy(() => import("./ResultsPanel.js"));

      export function SearchCard() {
        return (
          <ErrorBoundary fallback={<p>Oops</p>}>
            <Suspense fallback={<p>Loading</p>}>
              <ResultsPanel value="ready" />
            </Suspense>
          </ErrorBoundary>
        );
      }
```

#### Generated Output

```js
import { ensureLazyElement, ErrorBoundary, SuspenseBoundary } from "litsx";
import { LitElement, html } from "lit";
import { ShadowDomElementsMixin } from "litsx/runtime-infrastructure";
const ResultsPanel = () => import("./ResultsPanel.js");
export class SearchCard extends ShadowDomElementsMixin(LitElement) {
  render() {
    ensureLazyElement(this, "results-panel", ResultsPanel);
    return html`<error-boundary .fallbackRenderer=${() => html`<p>Oops</p>`} .contentRenderer=${() => html`<suspense-boundary .fallbackRenderer=${() => html`<p>Loading</p>`} .contentRenderer=${() => html`<results-panel value="ready"></results-panel>`}></suspense-boundary>`}></error-boundary>`;
  }
  static elements = {
    "error-boundary": ErrorBoundary,
    "suspense-boundary": SuspenseBoundary
  };
}
```

### Drops React imports when fully lowered but preserves them when still referenced

#### Interpretation

This case records the authored input and the generated output as a living transform contract.

#### Fully Lowered Source

```jsx
import { useState } from "react";

      export function Counter() {
        const [count, setCount] = useState(0);
        return <button onClick={() => setCount(count + 1)}>{count}</button>;
      }
```

#### Generated Output

```js
import { useState, prepareEffects, ErrorBoundary } from "litsx";
import { LitElement, html } from "lit";
export class Counter extends LitElement {
  render() {
    prepareEffects(this);
    const [count, setCount] = useState(this, 0);
    return html`<button @click=${() => setCount(count + 1)}>${count}</button>`;
  }
}
```

#### Preserved Import Source

```jsx
import React, { useState } from "react";

      export function Counter() {
        const [count, setCount] = useState(0);
        return <button title={React.version} onClick={() => setCount(count + 1)}>{count}</button>;
      }
```

#### Generated Output

```js
import { useState, prepareEffects, ErrorBoundary } from "litsx";
import { LitElement, html } from "lit";
import React from "react";
export class Counter extends LitElement {
  render() {
    prepareEffects(this);
    const [count, setCount] = useState(this, 0);
    return html`<button title="${React.version}" @click=${() => setCount(count + 1)}>${count}</button>`;
  }
}
```

### Errors on unsupported class contextType

#### Interpretation

This case records the authored input and the generated output as a living transform contract.

#### Authored Input

```jsx
import React, { createContext } from "react";

      const ThemeContext = createContext("light");

      export class LegacyPanel extends React.Component {
        static contextType = ThemeContext;

        render() {
          return <div>{this.context}</div>;
        }
      }
```

#### Generated Error

```txt
unknown file: React class contextType is not supported by @litsx/babel-preset-react-compat.
[0m [90m 4 |[39m
 [90m 5 |[39m       [36mexport[39m [36mclass[39m [33mLegacyPanel[39m [36mextends[39m [33mReact[39m[33m.[39m[33mComponent[39m {
[31m[1m>[22m[39m[90m 6 |[39m         [36mstatic[39m contextType [33m=[39m [33mThemeContext[39m[33m;[39m
 [90m   |[39m         [31m[1m^[22m[39m[31m[1m^[22m[39m[31m[1m^[22m[39m[31m[1m^[22m[39m[31m[1m^[22m[39m[31m[1m^[22m[39m[31m[1m^[22m[39m[31m[1m^[22m[39m[31m[1m^[22m[39m[31m[1m^[22m[39m[31m[1m^[22m[39m[31m[1m^[22m[39m[31m[1m^[22m[39m[31m[1m^[22m[39m[31m[1m^[22m[39m[31m[1m^[22m[39m[31m[1m^[22m[39m[31m[1m^[22m[39m[31m[1m^[22m[39m[31m[1m^[22m[39m[31m[1m^[22m[39m[31m[1m^[22m[39m[31m[1m^[22m[39m[31m[1m^[22m[39m[31m[1m^[22m[39m[31m[1m^[22m[39m[31m[1m^[22m[39m[31m[1m^[22m[39m[31m[1m^[22m[39m[31m[1m^[22m[39m[31m[1m^[22m[39m[31m[1m^[22m[39m[31m[1m^[22m[39m[31m[1m^[22m[39m
 [90m 7 |[39m
 [90m 8 |[39m         render() {
 [90m 9 |[39m           [36mreturn[39m [33m<[39m[33mdiv[39m[33m>[39m{[36mthis[39m[33m.[39mcontext}[33m<[39m[33m/[39m[33mdiv[39m[33m>[39m[33m;[39m[0m
```

### Errors when Context.Consumer does not receive exactly one function child

#### Interpretation

This case records the authored input and the generated output as a living transform contract.

#### Authored Input

```jsx
import { createContext } from "react";

      const ThemeContext = createContext("light");

      export function BrokenConsumer() {
        return (
          <ThemeContext.Consumer>
            <span>broken</span>
          </ThemeContext.Consumer>
        );
      }
```

#### Generated Error

```txt
unknown file: React context Consumer requires a function child.
[0m [90m  5 |[39m       [36mexport[39m [36mfunction[39m [33mBrokenConsumer[39m() {
 [90m  6 |[39m         [36mreturn[39m (
[31m[1m>[22m[39m[90m  7 |[39m           [33m<[39m[33mThemeContext[39m[33m.[39m[33mConsumer[39m[33m>[39m
 [90m    |[39m           [31m[1m^[22m[39m
 [90m  8 |[39m             [33m<[39m[33mspan[39m[33m>[39mbroken[33m<[39m[33m/[39m[33mspan[39m[33m>[39m
 [90m  9 |[39m           [33m<[39m[33m/[39m[33mThemeContext[39m[33m.[39m[33mConsumer[39m[33m>[39m
 [90m 10 |[39m         )[33m;[39m[0m
```
