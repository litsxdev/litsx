import type { TableProps } from "./table-types";

export function TableView(props: TableProps) {
  return (
    <section>
      <header>{props.columns.length}</header>
      <ul>
        {props.rows.map((row) => (
          <li>{row.name}</li>
        ))}
      </ul>
      <footer>{props.selectedId}</footer>
    </section>
  );
}
