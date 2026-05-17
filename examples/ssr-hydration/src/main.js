import {
  LITSX_HYDRATION_PAYLOAD_PROPERTY,
  hydrateDocument,
} from "@litsx/ssr-client";

const roots = await hydrateDocument({
  clientImports: [],
  async register() {
    // @ts-expect-error LitSX authored modules resolve through the LitSX/Vite pipeline.
    const { defineDemoElements } = await import("./components.litsx");
    defineDemoElements();
  },
});

const root = /** @type {any} */ (document.querySelector("demo-app"));
document.body.dataset.hydrated = "true";

window.__litsxSsrDemo = {
  roots,
  rootPayload: root?.[LITSX_HYDRATION_PAYLOAD_PROPERTY] ?? null,
  rootText: root?.shadowRoot?.textContent ?? "",
};
