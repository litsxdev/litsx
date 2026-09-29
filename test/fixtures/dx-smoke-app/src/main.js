import "@webcomponents/scoped-custom-element-registry";
import { DxSmokeApp } from "./dx-smoke-app.tsx";
import "./styles/tokens.css";

customElements.define(
  "app-root",
  /** @type {CustomElementConstructor} */ (/** @type {unknown} */ (DxSmokeApp)),
);

const app = document.querySelector("#app");
if (!app) throw new Error("Missing #app mount point");
app.innerHTML = "<app-root></app-root>";
