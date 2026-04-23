export type ResourceId = string & {
  readonly __brand: "ResourceId";
};

export interface ResourceShape {
  metadata: Record<string, unknown>;
  status: "idle" | "loading" | "ready";
}

export type ResourceCardProps = Readonly<
  Pick<ResourceShape, "metadata" | "status">
> & {
  resourceId: ResourceId;
  onCommit: (id: ResourceId) => void;
};
