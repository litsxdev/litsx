export interface ReactContext<T> {
  readonly defaultValue: T;
  readonly Provider: unknown;
  readonly Consumer: unknown;
}

export declare function createContext<T>(defaultValue: T): ReactContext<T>;

export declare function useContext<T>(context: ReactContext<T>): T;
export declare function useContext<T>(
  host: object,
  context: ReactContext<T>
): T;

export declare function renderContext<T, TResult>(
  host: object,
  context: ReactContext<T>,
  render: (value: T) => TResult
): TResult;

export declare class LitsxContextProviderElement extends HTMLElement {
  context: ReactContext<unknown>;
  value: unknown;
}
