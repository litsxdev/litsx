import { LitElement, css, html } from "lit";
import { LitsxContextProviderElement } from "@litsx/core/context";
import { LightDomMixin } from "@litsx/core/elements";
import { MatrixContext } from "./matrix-context.ts";

type LitElementConstructor = new (...args: any[]) => LitElement;

export const PlainBridgeMixin = <BaseConstructor extends LitElementConstructor>(
  Base: BaseConstructor,
) =>
  class PlainBridgeCapability extends Base {
    static properties = {
      ...((Base as any).properties ?? {}),
      bridgeLabel: { type: String, attribute: "bridge-label" },
    };

    static styles = [
      (Base as any).styles ?? [],
      css`
        :host {
          display: block;
          outline-style: solid;
          outline-width: 2px;
        }
      `,
    ];

    declare bridgeLabel: string;
    bridgeConnections = 0;

    constructor(...args: any[]) {
      super(...args);
      this.bridgeLabel = "plain-bridge";
    }

    connectedCallback() {
      super.connectedCallback();
      this.bridgeConnections += 1;
    }
  };

export class PlainLitBridge extends PlainBridgeMixin(LitElement) {
  static properties = {
    ...super.properties,
    payload: { attribute: false },
  };

  static styles = [
    super.styles ?? [],
    css`
      .bridge {
        padding: 3px;
      }
    `,
  ];

  declare payload: { id: string } | null;

  constructor() {
    super();
    this.payload = null;
  }

  render() {
    return html`
      <section class="bridge" data-plain-bridge>
        <matrix-complex-leaf
          label=${this.bridgeLabel}
          .payload=${this.payload}
        ></matrix-complex-leaf>
      </section>
    `;
  }
}

export class PlainLitContextBridge extends LightDomMixin(LitElement) {
  static properties = {
    context: { attribute: false },
  };

  static elements = {
    "litsx-context-provider": LitsxContextProviderElement,
    "plain-lit-bridge": PlainLitBridge,
  };

  declare context: object | null;

  constructor() {
    super();
    this.context = MatrixContext;
  }

  render() {
    return html`
      <litsx-context-provider
        .context=${this.context}
        .value=${"context-fallback"}
      >
        <plain-lit-bridge
          .bridgeLabel=${"light-bridge"}
          .payload=${{ id: "light-payload" }}
        ></plain-lit-bridge>
      </litsx-context-provider>
    `;
  }
}

export class PlainLitTerminal extends LitElement {
  static properties = {
    value: { type: Number },
    payload: { attribute: false },
  };

  declare value: number;
  declare payload: { id: string } | null;

  constructor() {
    super();
    this.value = 0;
    this.payload = null;
  }

  increment() {
    this.value += 1;
    this.dispatchEvent(
      new CustomEvent("terminal-change", {
        bubbles: true,
        composed: true,
        detail: { value: this.value },
      }),
    );
  }

  render() {
    return html`
      <button data-terminal @click=${this.increment}>
        ${this.value}:${this.payload?.id ?? "none"}
      </button>
    `;
  }
}
