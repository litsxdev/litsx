import * as hybridHosts from "./hybrid-host.tsx";
import * as matrixComponents from "./matrix-components.tsx";
import { registerHydrationModules } from "@litsx/ssr/hydration";

await registerHydrationModules([hybridHosts, matrixComponents]);

if (customElements.get("plain-lit-bridge") !== matrixComponents.PlainLitBridge) {
  customElements.define("plain-lit-bridge", matrixComponents.PlainLitBridge);
}
if (
  customElements.get("plain-lit-terminal") !== matrixComponents.PlainLitTerminal
) {
  customElements.define("plain-lit-terminal", matrixComponents.PlainLitTerminal);
}
if (
  customElements.get("plain-lit-context-bridge") !==
  matrixComponents.PlainLitContextBridge
) {
  customElements.define(
    "plain-lit-context-bridge",
    matrixComponents.PlainLitContextBridge,
  );
}
