import { h } from "vue";

const pills = [
  {
    label: "TypeScript first",
    iconSrc: "/ts-logo-512.svg",
    iconAlt: "TypeScript",
  },
  {
    label: "Lightweight (~8.0 kB gzip)",
    iconMaskSrc: "/lightweight.svg",
  },
  {
    label: "Built on Lit",
    iconSrc: "/lit-1.svg",
    iconAlt: "Lit",
  },
];

export default function HomeHeroPills() {
  return h(
    "div",
    { class: "litsx-hero-pills" },
    pills.map((pill) =>
      h("span", { class: "litsx-hero-pill" }, [
        pill.iconSrc
          ? h("img", {
              class: "litsx-hero-pill-icon litsx-hero-pill-icon-image",
              src: pill.iconSrc,
              alt: pill.iconAlt ?? "",
              width: 14,
              height: 14,
            })
          : pill.iconMaskSrc
            ? h("span", {
                class: "litsx-hero-pill-icon litsx-hero-pill-icon-mask",
                "aria-hidden": "true",
                style: {
                  "--litsx-hero-pill-mask": `url("${pill.iconMaskSrc}")`,
                },
              })
          : h("span", {
              class: "litsx-hero-pill-icon",
              "aria-hidden": "true",
              innerHTML: pill.icon,
            }),
        h("span", { class: "litsx-hero-pill-label" }, pill.label),
      ]),
    ),
  );
}
