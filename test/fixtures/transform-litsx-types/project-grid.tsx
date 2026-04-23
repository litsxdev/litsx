import type { ProjectGridProps } from "./project-grid-types";

export function ProjectGrid(props: ProjectGridProps) {
  ^properties<ProjectGridProps>({
    selectedId: { attribute: "selected-id", reflect: true },
    onSelect: { attribute: false },
    page: { attribute: false },
  });

  return (
    <section>
      <h2>{props.title}</h2>
      <p>{props.filters.length}</p>
      <p>{props.page.items.length}</p>
      <p>{props.page.total}</p>
      <p>{props.selectedId}</p>
      <button onClick={() => props.onSelect(props.page.items[0].id)}>select</button>
    </section>
  );
}
