import { LitElement, css, html } from "lit";

const _litsx_static_styles = Symbol("litsx.static.styles");

class MyComponent2 extends LitElement {
  static get styles() {
    if (!Object.prototype.hasOwnProperty.call(this, _litsx_static_styles)) {
      const parent = Object.getPrototypeOf(this);
      this[_litsx_static_styles] =
        typeof css`
          :host {
            display: block;
          }

          p {
            color: var(--dynamic-color, black);
          }
        ` === "function"
          ? css`
              :host {
                display: block;
              }

              p {
                color: var(--dynamic-color, black);
              }
            `(parent)
          : css`
              :host {
                display: block;
              }

              p {
                color: var(--dynamic-color, black);
              }
            `;
    }

    return this[_litsx_static_styles];
  }

  updated(changedProperties) {
    // Estilo dinámico: aplica el color como variable CSS
    this.style.setProperty("--dynamic-color", this.color);

    // Efecto que depende de `title` y `color`
    if (changedProperties.has("title") || changedProperties.has("color")) {
      console.log("Title or color updated:", this.title, this.color);
    };

    // Llamada al método `updated` de la superclase
    super.updated(changedProperties);
  }

  render() {
    return html`
      <div>
        <h1>${this.title}</h1>
        <p>Hello World</p>
      </div>
    `;
  }
}

customElements.define("my-component", MyComponent);
