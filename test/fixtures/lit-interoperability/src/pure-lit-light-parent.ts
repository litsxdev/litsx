import { LitElement, html } from "lit";
import { MatrixLightBridge } from "./matrix-components.tsx";

/** Pure Lit authoring whose nested light-DOM child is supplied by LitSX. */
export class PureLitLightParent extends LitElement {
  static elements = {
    "matrix-light-bridge": MatrixLightBridge,
  };

  render() {
    return html`
      <section data-pure-lit-light-parent>
        <matrix-light-bridge></matrix-light-bridge>
      </section>
    `;
  }
}
