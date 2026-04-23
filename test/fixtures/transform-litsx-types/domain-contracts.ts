import type { EntityId, PagedResult } from "./shared-models";

export interface ProjectRow {
  id: EntityId;
  name: string;
  status: "draft" | "active" | "archived";
}

export type ProjectGridBaseProps = {
  page: PagedResult<ProjectRow>;
  selectedId?: EntityId;
  onSelect: (id: EntityId) => void;
};
