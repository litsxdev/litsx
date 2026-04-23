export type ApiEnvelope<TData, TMeta> = {
  data: TData;
  meta: TMeta;
};

export type FeatureFlags<T extends string> = {
  [K in T]?: boolean;
};

export type ValueOrFactory<T> = T extends string
  ? T | (() => T)
  : T;

export interface FallbackBaseProps {
  envelope: ApiEnvelope<
    {
      items: string[];
    },
    {
      source: string;
    }
  >;
  flags: FeatureFlags<"alpha" | "beta" | "gamma">;
  displayValue: ValueOrFactory<string>;
  onCommit: (value: string) => void;
}
