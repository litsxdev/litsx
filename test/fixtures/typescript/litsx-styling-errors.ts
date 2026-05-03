import { useStyle } from "@litsx/litsx";

declare const host: object;

// @ts-expect-error deps must be an array when provided
useStyle(host, "--panel-gap", () => "12px", "invalid");
