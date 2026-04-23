import type { FallbackBaseProps } from "./fallback-types";

export function FallbackPanel(props: FallbackBaseProps) {
  return (
    <section>
      <p>{props.envelope.data.items.length}</p>
      <p>{props.flags.alpha ? "a" : "b"}</p>
      <p>{typeof props.displayValue}</p>
      <button onClick={() => props.onCommit("ok")}>commit</button>
    </section>
  );
}
