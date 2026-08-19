import { ErrorBoundary, SuspenseBoundary, SuspenseList } from "@litsx/core";

type ButtonProps = {
  label: string;
};

function ActionButton({ label }: ButtonProps) {
  return <button>{label}</button>;
}

export function BrokenScreen() {
  return (
    <>
      {/* @ts-expect-error invalid reveal order */}
      <SuspenseList revealOrder="sideways" />

      {/* @ts-expect-error invalid tail */}
      <SuspenseList tail="visible" />

      {/* @ts-expect-error fallbackRenderer is not part of the SuspenseBoundary authoring contract */}
      <SuspenseBoundary fallbackRenderer={() => "loading"} />

      {/* @ts-expect-error contentRenderer is not part of the ErrorBoundary authoring contract */}
      <ErrorBoundary contentRenderer={() => "ready"} />

      {/* @ts-expect-error ActionButton requires a label */}
      <ActionButton />

      {/* @ts-expect-error native LitSX uses class */}
      <div className="legacy" />

      {/* @ts-expect-error native LitSX uses for */}
      <label htmlFor="query">Query</label>

      {/* @ts-expect-error native LitSX uses on:event */}
      <button onClick={() => undefined}>Save</button>

      {/* @ts-expect-error native LitSX key has no reconciliation contract */}
      <div key="legacy" />
    </>
  );
}
