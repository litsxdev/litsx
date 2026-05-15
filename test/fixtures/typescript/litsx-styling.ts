import { useStyle } from "@litsx/core";

declare const gap: number;
declare const accent: string;

useStyle("--panel-gap", `${gap}px`);
useStyle("--panel-accent", () => accent, [accent]);
