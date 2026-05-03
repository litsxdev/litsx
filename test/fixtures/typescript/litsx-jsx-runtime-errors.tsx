import { SuspenseBoundary, SuspenseList } from "@litsx/litsx";

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

      {/* @ts-expect-error fallbackRenderer must be a function */}
      <SuspenseBoundary fallbackRenderer="loading" />

      {/* @ts-expect-error ActionButton requires a label */}
      <ActionButton />
    </>
  );
}
