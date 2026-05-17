declare module "*.litsx" {
  export const defineDemoElements: () => void;
}

declare global {
  interface Window {
    __litsxSsrDemo?: {
      roots: unknown;
      rootPayload: unknown;
      rootText: string;
    };
  }
}

export {};
