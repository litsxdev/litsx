import { defineHook, SuspenseBoundary, SuspenseList } from "@litsx/core";

interface I18nCapability {
  i18n: {
    translate(key: string): string;
  };
}

const I18nMixin = <TBase extends new (...args: any[]) => object>(Base: TBase) =>
  class extends Base implements I18nCapability {
    i18n = {
      translate: (key: string) => key,
    };
  };

const useTranslatedLabel = defineHook({
  mixin: I18nMixin,
  use(host: I18nCapability, key: string) {
    return host.i18n.translate(key);
  },
});

type ButtonProps = {
  label: string;
  disabled?: boolean;
};

function ActionButton({ label, disabled }: ButtonProps) {
  return <button disabled={disabled}>{label}</button>;
}

function TranslatedButton() {
  return <button>{useTranslatedLabel("save")}</button>;
}

export function Screen() {
  return (
    <section class="screen-shell">
      <SuspenseList revealOrder="forwards" tail="collapsed">
        <SuspenseBoundary
          fallback={<span>loading primary</span>}
        >
          <ActionButton label="Primary" />
        </SuspenseBoundary>
        <SuspenseBoundary
          fallback={<span>loading secondary</span>}
        >
          <ActionButton label="Secondary" disabled />
        </SuspenseBoundary>
      </SuspenseList>
      <ActionButton
        label="Standalone"
        hidden
        inert
        on:change={(event?: CustomEvent) => void event}
      />
      <TranslatedButton />
      <button
        disabled
        ref={(node: HTMLButtonElement | undefined) => void node}
      >click</button>
      <suspense-boundary
        fallback={<span>loading inline</span>}
      >
        <ActionButton label="Inline" />
      </suspense-boundary>
      <fancy-button data-variant="primary" />
    </section>
  );
}
