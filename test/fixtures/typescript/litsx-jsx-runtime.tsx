import {
  createRef,
  defineHook,
  lazy,
  SuspenseBoundary,
  SuspenseList,
  useHost,
  useRef,
  type LitsxStyleInfo,
} from "@litsx/core";

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
  use(key: string) {
    const host = useHost<I18nCapability>();
    return host.i18n.translate(key);
  },
});

const useI18nCapability = defineHook<I18nCapability>({
  mixin: I18nMixin,
});

type ButtonProps = {
  label: string;
  disabled?: boolean;
};

function ActionButton({ label, disabled }: ButtonProps) {
  return <button disabled={disabled}>{label}</button>;
}

const LazyActionButton = lazy(async () => ({ default: ActionButton }));
const cardStyle: LitsxStyleInfo = {
  backgroundColor: "tomato",
  "border-top": "1px solid currentColor",
  "--accent": "gold",
  opacity: 0.5,
  color: null,
};
const optionalStyle: string | LitsxStyleInfo | null | undefined = cardStyle;

function TranslatedButton() {
  const installation: void = useI18nCapability();
  void installation;
  return <button>{useTranslatedLabel("save")}</button>;
}

export function Screen() {
  const targetRef = useRef<HTMLButtonElement | HTMLAnchorElement>();
  const litTargetRef = createRef<HTMLButtonElement | HTMLAnchorElement>();

  return (
    <section class="screen-shell">
      <div style={{ color: "red", width: "20px" }} />
      <div style={cardStyle} />
      <div style={optionalStyle} />
      <div style="display: block" />
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
        id="standalone-action"
        class="rotate-180"
        style="color: red"
        slot="action"
        part="button"
        exportparts="label"
        role="button"
        title="Standalone action"
        tabindex={-1}
        aria-label="Standalone"
        data-state="ready"
        hidden
        inert
        on:change={(event?: CustomEvent) => void event}
      />
      <TranslatedButton />
      <LazyActionButton label="Lazy action" disabled />
      <button
        disabled
        ref={(node: HTMLButtonElement | undefined) => void node}
      >click</button>
      <a href="/details" ref={targetRef}>Details</a>
      <button ref={targetRef}>Open</button>
      <a href="/alternate" ref={litTargetRef}>Alternate</a>
      <button ref={litTargetRef}>Alternate action</button>
      <suspense-boundary
        fallback={<span>loading inline</span>}
      >
        <ActionButton label="Inline" />
      </suspense-boundary>
      <fancy-button data-variant="primary" />
    </section>
  );
}
