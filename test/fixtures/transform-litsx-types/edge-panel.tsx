import type { EdgeCaseProps } from "./edge-types";

export function EdgePanel(props: EdgeCaseProps) {
  return (
    <section>
      <p>{props.createdAt.toISOString()}</p>
      <p>{props.mode}</p>
      <p>{props.retryPolicy}</p>
      <p>{props.mixed}</p>
      <button on:click={() => props.onRetry()}>retry</button>
    </section>
  );
}
