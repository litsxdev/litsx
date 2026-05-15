// @vitest-environment happy-dom

import assert from "assert";
import { html, LitElement } from "lit";
import { describe, it } from "vitest";
import {
  LitsxContextProviderElement,
  createContext,
  renderContext,
  useContext,
} from "../packages/core/src/context.js";

let tagCounter = 0;

function nextTag(prefix = "litsx-react-context") {
  tagCounter += 1;
  return `${prefix}-${tagCounter}`;
}

function ensureProviderElement() {
  if (!customElements.get("litsx-context-provider")) {
    customElements.define("litsx-context-provider", LitsxContextProviderElement);
  }
}

function defineElement(tagName, ctor) {
  if (!customElements.get(tagName)) {
    customElements.define(tagName, ctor);
  }
}

async function flush() {
  await Promise.resolve();
  await Promise.resolve();
}

describe("react context compat runtime", () => {
  it("uses provider values inside the subtree and does not leak to siblings", async () => {
    ensureProviderElement();
    const ThemeContext = createContext("light");
    const readerTag = nextTag("litsx-context-reader");

    class ContextReader extends LitElement {
      render() {
        return html`<span>${useContext(this, ThemeContext)}</span>`;
      }
    }

    defineElement(readerTag, ContextReader);

    const provider = document.createElement("litsx-context-provider");
    provider.context = ThemeContext;
    provider.value = "dark";

    const insideReader = document.createElement(readerTag);
    const outsideReader = document.createElement(readerTag);

    provider.appendChild(insideReader);
    document.body.append(provider, outsideReader);

    await insideReader.updateComplete;
    await outsideReader.updateComplete;

    assert.match(insideReader.shadowRoot.textContent, /dark/);
    assert.match(outsideReader.shadowRoot.textContent, /light/);
  });

  it("updates subscribed consumers and resolves nested providers to the nearest value", async () => {
    ensureProviderElement();
    const ThemeContext = createContext("light");
    const readerTag = nextTag("litsx-context-reader");

    class ContextReader extends LitElement {
      render() {
        return html`<span>${useContext(this, ThemeContext)}</span>`;
      }
    }

    defineElement(readerTag, ContextReader);

    const outerProvider = document.createElement("litsx-context-provider");
    outerProvider.context = ThemeContext;
    outerProvider.value = "dark";

    const directReader = document.createElement(readerTag);
    outerProvider.appendChild(directReader);

    const innerProvider = document.createElement("litsx-context-provider");
    innerProvider.context = ThemeContext;
    innerProvider.value = "contrast";

    const nestedReader = document.createElement(readerTag);
    innerProvider.appendChild(nestedReader);
    outerProvider.appendChild(innerProvider);

    document.body.appendChild(outerProvider);

    await directReader.updateComplete;
    await nestedReader.updateComplete;

    assert.match(directReader.shadowRoot.textContent, /dark/);
    assert.match(nestedReader.shadowRoot.textContent, /contrast/);

    outerProvider.value = "night";
    await flush();
    await directReader.updateComplete;
    await nestedReader.updateComplete;

    assert.match(directReader.shadowRoot.textContent, /night/);
    assert.match(nestedReader.shadowRoot.textContent, /contrast/);
  });

  it("supports renderContext and rejects context changes after initialization", async () => {
    ensureProviderElement();
    const ThemeContext = createContext("light");
    const OtherContext = createContext("other");
    const consumerTag = nextTag("litsx-context-consumer");

    class ConsumerView extends LitElement {
      render() {
        return html`${renderContext(
          this,
          ThemeContext,
          (theme) => html`<strong>${theme}</strong>`
        )}`;
      }
    }

    defineElement(consumerTag, ConsumerView);

    const provider = document.createElement("litsx-context-provider");
    provider.context = ThemeContext;
    provider.value = "dark";

    const consumer = document.createElement(consumerTag);
    provider.appendChild(consumer);
    document.body.appendChild(provider);

    await consumer.updateComplete;
    assert.match(consumer.shadowRoot.textContent, /dark/);

    assert.throws(
      () => {
        provider.context = OtherContext;
      },
      /does not allow changing context/
    );
  });

  it("rejects invalid contexts and invalid renderContext children", () => {
    const host = {
      addController() {},
      requestUpdate() {},
    };

    assert.throws(
      () => useContext(host, {}),
      /requires a context created by createContext/
    );
    assert.throws(
      () => renderContext({}, createContext("light"), "not-a-function"),
      /requires a function child/
    );
  });

  it("allows a null context before initialization but rejects clearing it after provider creation", () => {
    ensureProviderElement();
    const ThemeContext = createContext("light");
    const provider = document.createElement("litsx-context-provider");

    provider.context = null;
    assert.strictEqual(provider.context, null);

    provider.context = ThemeContext;
    assert.throws(
      () => {
        provider.context = null;
      },
      /requires a context created by createContext/
    );
  });

  it("tolerates being connected before a context is assigned", () => {
    const provider = new LitsxContextProviderElement();

    assert.doesNotThrow(() => {
      provider.connectedCallback();
      provider.disconnectedCallback();
    });
  });
});
