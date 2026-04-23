import type { ProjectGridBaseProps } from "./domain-barrel";

export type ProjectGridProps = Readonly<ProjectGridBaseProps> & {
  title: string;
  filters: ReadonlyArray<"all" | "active" | "archived">;
};
