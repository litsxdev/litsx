import {
  LITSX_HYDRATION_PAYLOAD_PROPERTY,
  hydratePage,
} from "@litsx/ssr-client";

const roots = await hydratePage({
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
