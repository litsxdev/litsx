export enum ViewMode {
  Compact = "compact",
  Comfortable = "comfortable",
}

export enum RetryPolicy {
  Never = 0,
  Always = 1,
}

export interface EdgeCaseProps {
  createdAt: Date;
  mode: ViewMode;
  retryPolicy: RetryPolicy;
  mixed: string | number;
  onRetry: () => void;
}
