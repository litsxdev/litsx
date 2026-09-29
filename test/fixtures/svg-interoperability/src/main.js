import * as svgHosts from "./svg-host.tsx";
import { registerHydrationModules } from "@litsx/ssr/hydration";

await registerHydrationModules([svgHosts]);
