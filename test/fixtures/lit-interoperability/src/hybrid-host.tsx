import { useState } from "@litsx/core";
import {
  LightLitCounter,
  MixedLitBadge,
  PlainLitCounter,
} from "./plain-lit-elements.ts";
import { PureLitLightParent } from "./pure-lit-light-parent.ts";

export type HybridHostProps = {
  initialCount?: number;
};

export function HybridHost({ initialCount = 2 }: HybridHostProps) {
  const [count, setCount] = useState(initialCount);
  const badgeProps = {
    tone: "positive",
    enabled: true,
    model: { id: "spread-model" },
  };

  return (
    <section data-hybrid-shadow-host>
      <PlainLitCounter
        label="Shadow"
        count={count}
        active={true}
        payload={{ id: "shadow-payload" }}
        on:count-change={(event) => setCount(event.detail.count)}
      >
        <span slot="prefix">Prefix</span>
      </PlainLitCounter>
      <MixedLitBadge {...badgeProps} />
      <output data-host-count>{count}</output>
      <PureLitLightParent />
    </section>
  );
}

export function HybridLightHost() {
  return (
    <section data-hybrid-light-host>
      <LightLitCounter
        label="Light"
        count={4}
        active={false}
        payload={{ id: "light-payload" }}
      />
    </section>
  );
}

HybridLightHost.lightDom = true;
