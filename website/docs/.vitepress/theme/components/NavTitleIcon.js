import { h } from "vue";

export default function NavTitleIcon() {
  return h("img", {
    class: "litsx-nav-title-icon",
    src: "/flame_64.png",
    srcset: "/flame_32.png 32w, /flame_64.png 64w, /flame_128.png 128w",
    sizes: "28px",
    width: "28",
    height: "28",
    alt: "",
    "aria-hidden": "true",
  });
}
