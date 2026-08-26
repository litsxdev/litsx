import { LitElement } from "lit";
import type { LitsxComponentProps } from "@litsx/core/jsx-runtime";

type Payload = {
  id: string;
};

class PlainLitCounter extends LitElement {
  static properties = {
    label: { type: String },
    count: { type: Number },
    active: { type: Boolean },
    payload: { attribute: false },
    onCommit: { attribute: false },
  };

  declare label: string;
  declare count: number;
  declare active: boolean;
  declare payload: Payload | null;
  declare onCommit: ((payload: Payload) => void) | undefined;

  increment() {}
}

type LitElementConstructor = new (...args: any[]) => LitElement;

const CapabilityMixin = <TBase extends LitElementConstructor>(Base: TBase) =>
  class CapabilityHost extends Base {
    static properties = {
      tone: { type: String },
      enabled: { type: Boolean },
    };

    declare tone: "neutral" | "positive";
    declare enabled: boolean;

    constructor(...args: any[]) {
      super(...args);
    }
  };

class MixedLitBadge extends CapabilityMixin(LitElement) {
  static properties = {
    ...super.properties,
    model: { attribute: false },
  };

  declare model: Payload | null;
}

const counterProps: LitsxComponentProps<typeof PlainLitCounter> = {
  label: "Counter",
  count: 2,
  active: true,
  payload: { id: "typed" },
  onCommit: (payload) => void payload.id,
};
void counterProps;

export function PureLitConsumer() {
  return (
    <section>
      <PlainLitCounter />
      <PlainLitCounter
        label="Counter"
        count={2}
        active
        payload={{ id: "direct" }}
        onCommit={(payload) => void payload.id}
        id="plain-counter"
        class="counter"
        slot="content"
        on:count-change={(event) => void event.detail}
        ref={(node) => void node?.increment()}
      />
      <MixedLitBadge tone="positive" enabled model={{ id: "mixed" }} />

      {/* @ts-expect-error Lit property types are preserved */}
      <PlainLitCounter count="2" />

      {/* @ts-expect-error LitElement runtime APIs are not authored JSX props */}
      <PlainLitCounter requestUpdate={() => undefined} />

      {/* @ts-expect-error component methods are not authored JSX props */}
      <PlainLitCounter increment={() => undefined} />

      {/* @ts-expect-error unknown properties remain rejected */}
      <MixedLitBadge mystery="value" />
    </section>
  );
}
