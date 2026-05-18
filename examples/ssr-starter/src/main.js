import { hydratePage } from "@litsx/ssr-client";

await hydratePage({
  async register() {
    // @ts-expect-error LitSX authored modules resolve through the LitSX/Vite pipeline.
    const { defineDemoElements } = await import("./components.litsx");
    defineDemoElements();
  },
});

document.body.dataset.hydrated = "true";
