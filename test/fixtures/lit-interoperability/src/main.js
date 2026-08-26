import * as hybridHosts from "./hybrid-host.tsx";
import { registerHydrationModules } from "@litsx/ssr/hydration";

await registerHydrationModules([hybridHosts]);
