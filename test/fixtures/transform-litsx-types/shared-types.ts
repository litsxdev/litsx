export interface BaseCardProps {
  title: string;
  active: boolean;
  payload: Record<string, unknown>;
  onSelect: (id: string) => void;
}

export type CardProps = Pick<BaseCardProps, "title" | "active" | "payload" | "onSelect"> & {
  tags: ReadonlyArray<string>;
};
