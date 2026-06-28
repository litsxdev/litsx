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
      <suspense-list tail="visible" />

      {/* @ts-expect-error fallbackRenderer is not part of the SuspenseBoundary authoring contract */}
      <SuspenseBoundary fallbackRenderer={() => "loading"} />

      {/* @ts-expect-error contentRenderer is not part of the ErrorBoundary authoring contract */}
      <ErrorBoundary contentRenderer={() => "ready"} />

      {/* @ts-expect-error ActionButton requires a label */}
      <ActionButton />
    </>
  );
}
