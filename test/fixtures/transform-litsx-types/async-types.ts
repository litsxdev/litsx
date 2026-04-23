export interface AsyncResourceState<TId extends string, TPayload> {
  id: TId;
  payload: TPayload;
  ready: boolean;
  onResolve: (id: TId) => void;
}

export type ResourcePanelProps = AsyncResourceState<
  "alpha" | "beta",
  {
    items: string[];
    meta: Record<string, unknown>;
  }
> & {
  title: string;
};
