import type { CardProps } from "./shared-types";

export function SharedCard(props: CardProps) {
  return (
    <article>
      <h2>{props.title}</h2>
      <p>{props.active ? "on" : "off"}</p>
      <p>{props.tags.length}</p>
    </article>
  );
}

SharedCard.properties = {
  active: { reflect: true },
  payload: { attribute: false },
  onSelect: { attribute: false },
};
