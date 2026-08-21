// @ts-expect-error LitSX authored modules resolve through the LitSX/Vite pipeline.
const { defineDemoElements } = await import("./components.tsx");
defineDemoElements();

document.body.dataset.hydrated = "true";
