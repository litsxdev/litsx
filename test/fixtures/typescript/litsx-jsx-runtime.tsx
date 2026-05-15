import { SuspenseBoundary, SuspenseList } from "@litsx/core";

type ButtonProps = {
  label: string;
  disabled?: boolean;
};

function ActionButton({ label, disabled }: ButtonProps) {
  return <button disabled={disabled}>{label}</button>;
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
      <ActionButton label="Standalone" />
      <button disabled>click</button>
      <suspense-boundary
        fallback={<span>loading inline</span>}
      >
        <ActionButton label="Inline" />
      </suspense-boundary>
      <fancy-button data-variant="primary" />
    </section>
  );
}
