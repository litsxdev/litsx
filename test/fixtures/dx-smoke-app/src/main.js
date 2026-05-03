import "@webcomponents/scoped-custom-element-registry";
import { DxSmokeApp } from "./dx-smoke-app.litsx";
import "./styles/tokens.css";

customElements.define("app-root", /** @type {any} */ (DxSmokeApp));

document.querySelector("#app").innerHTML = "<app-root></app-root>";
