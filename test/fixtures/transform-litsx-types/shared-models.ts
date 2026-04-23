export type Brand<T, Name extends string> = T & {
  readonly __brand: Name;
};

export type EntityId = Brand<string, "EntityId">;

export interface AuditInfo {
  createdBy: string;
  updatedBy?: string;
}

export interface PagedResult<TItem> {
  items: TItem[];
  total: number;
  audit: AuditInfo;
}
