import { LitElement, css, html } from "lit";

export type CounterPayload = {
  id: string;
};

export class PlainLitCounter extends LitElement {
  static properties = {
    label: { type: String },
    count: { type: Number },
    active: { type: Boolean, reflect: true },
    payload: { attribute: false },
  };

  static styles = css`
    :host {
      display: inline-block;
    }

    button {
      color: rgb(0, 0, 255);
    }
  `;

  declare label: string;
  declare count: number;
  declare active: boolean;
  declare payload: CounterPayload | null;

  constructor() {
    super();
    this.label = "Counter";
    this.count = 0;
    this.active = false;
    this.payload = null;
  }

  increment() {
    this.count += 1;
    this.dispatchEvent(
      new CustomEvent("count-change", {
        bubbles: true,
        composed: true,
        detail: {
          count: this.count,
          payload: this.payload,
        },
      }),
    );
  }

  render() {
    return html`
      <button data-counter @click=${this.increment}>
        <slot name="prefix"></slot>
        <span data-label>${this.label}</span>
        <span data-count>${this.count}</span>
      </button>
    `;
  }
}

export class LightLitCounter extends PlainLitCounter {}

type LitElementConstructor = new (...args: any[]) => LitElement;

export const CapabilityMixin = <BaseConstructor extends LitElementConstructor>(
  Base: BaseConstructor,
) =>
  class CapabilityHost extends Base {
    static properties = {
      ...((Base as any).properties ?? {}),
      tone: { type: String, reflect: true },
      enabled: { type: Boolean, reflect: true },
    };

    static styles = [
      (Base as any).styles ?? [],
      css`
        .value {
          color: rgb(0, 128, 0);
        }
      `,
    ];

    declare tone: string;
    declare enabled: boolean;
    capabilityConnections: number;

    constructor(...args: any[]) {
      super(...args);
      this.tone = "neutral";
      this.enabled = false;
      this.capabilityConnections = 0;
    }

    connectedCallback() {
      super.connectedCallback();
      this.capabilityConnections += 1;
    }
  };

export class MixedLitBadge extends CapabilityMixin(LitElement) {
  static properties = {
    ...super.properties,
    model: { attribute: false },
  };

  static styles = [
    super.styles ?? [],
    css`
      .value {
        background-color: rgb(255, 255, 0);
      }
    `,
  ];

  declare model: CounterPayload | null;

  constructor() {
    super();
    this.model = null;
  }

  render() {
    return html`
      <span class="value" data-tone=${this.tone}>
        ${this.enabled ? "enabled" : "disabled"}:${this.model?.id ?? "none"}
      </span>
    `;
  }
}
