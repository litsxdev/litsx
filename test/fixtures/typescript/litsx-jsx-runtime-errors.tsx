import { ErrorBoundary, lazy, SuspenseBoundary, SuspenseList, useRef } from "@litsx/core";
import { ForwardedForm } from "./litsx-jsx-runtime.js";

type ButtonProps = {
  label: string;
};

function ActionButton({ label }: ButtonProps) {
  return <button>{label}</button>;
}

const LazyActionButton = lazy(async () => ({ default: ActionButton }));

export function BrokenScreen() {
  const anchorRef = useRef<HTMLAnchorElement>();
  const buttonRef = useRef<HTMLButtonElement>();

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

      {/* @ts-expect-error lazy components preserve their wrapped props */}
      <LazyActionButton />

      {/* @ts-expect-error unknown names are neither props nor standard host attributes */}
      <ActionButton label="Unknown" mysteryAttribute="value" />

      {/* @ts-expect-error native LitSX uses class */}
      <div className="legacy" />

      {/* @ts-expect-error native LitSX uses for */}
      <label htmlFor="query">Query</label>

      {/* @ts-expect-error native LitSX uses on:event */}
      <button onClick={() => undefined}>Save</button>

      {/* @ts-expect-error native LitSX key has no reconciliation contract */}
      <div key="legacy" />

      {/* @ts-expect-error style itself must be CSS text or a style property map */}
      <div style={42} />

      {/* @ts-expect-error style map values must be primitive CSS values */}
      <div style={{ color: { nested: true } }} />

      {/* @ts-expect-error boolean style property values are not part of Lit styleMap */}
      <div style={{ display: true }} />

      {/* @ts-expect-error an anchor-only ref cannot receive a button */}
      <button ref={anchorRef}>Wrong target</button>

      {/* @ts-expect-error overlapping intrinsic tag names use the HTML DOM target */}
      <a ref={(node: SVGAElement | undefined) => void node}>Wrong namespace ref</a>

      {/* @ts-expect-error exact authored component refs reject the wrong target */}
      <ForwardedForm ref={buttonRef} />

      {/* @ts-expect-error callback refs preserve the authored component target */}
      <ForwardedForm ref={(value: HTMLButtonElement | undefined) => void value} />
    </>
  );
}
