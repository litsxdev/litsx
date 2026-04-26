import { h } from "vue";

const pills = [
  {
    label: "TypeScript first",
    iconSrc: "/ts-logo-512.svg",
    iconAlt: "TypeScript",
  },
  {
    label: "Lightweight (~8.0 kB gzip)",
    icon: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M18.5 5.5c-4.5.6-8 4-9.3 8.2l-1.1 3.8 3.8-1.1c4.2-1.3 7.6-4.8 8.2-9.3-.6-.9-.7-1-1.6-1.6Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="m12 12 4-4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
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
