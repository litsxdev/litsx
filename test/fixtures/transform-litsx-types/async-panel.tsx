import type { ResourcePanelProps } from "./async-types";

export function AsyncPanel(props: ResourcePanelProps) {
  return (
    <section>
      <h2>{props.title}</h2>
      <p>{props.id}</p>
      <p>{props.ready ? "ready" : "pending"}</p>
      <p>{props.payload.items.length}</p>
      <button on:click={() => props.onResolve(props.id)}>resolve</button>
    </section>
  );
}
