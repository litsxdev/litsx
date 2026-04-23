export type ColumnId = "name" | "status" | "owner";

export interface TableRecord {
  name: string;
  status: "open" | "closed";
  owner: {
    id: string;
    displayName: string;
  };
}

export type TableProps = {
  columns: ReadonlyArray<ColumnId>;
  rows: TableRecord[];
  selectedId?: string;
  onSelect: (id: string) => void;
};
