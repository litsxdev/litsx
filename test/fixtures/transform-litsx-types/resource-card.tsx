import type { ResourceCardProps } from "./domain-index";

export function ResourceCard(props: ResourceCardProps) {
  ^properties<ResourceCardProps>({
    resourceId: { attribute: "resource-id", useDefault: true },
    status: { reflect: true },
    metadata: {
      attribute: false,
      converter: {
        fromAttribute(value) {
          return value;
        },
      },
    },
    onCommit: {
      attribute: false,
      hasChanged(value, oldValue) {
        return value !== oldValue;
      },
    },
  });

  return (
    <article data-status={props.status}>
      <h2>{props.resourceId}</h2>
      <p>{props.status}</p>
      <button onClick={() => props.onCommit(props.resourceId)}>commit</button>
    </article>
  );
}
