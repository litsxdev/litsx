export interface ReactCompatibleRef<T> {
  value: T | undefined;
  current: T | null;
}

export declare function useReactRef<T>(
  initialValue?: T
): ReactCompatibleRef<Exclude<T, null>>;

export declare function createReactRef<T = unknown>(): ReactCompatibleRef<T>;

export declare function toLitRef<T>(
  value:
    | { value: T | undefined }
    | { current: T | null }
    | ((value: T | null) => void)
    | null
    | undefined
): { value: T | undefined } | ((value: T | undefined) => void);
