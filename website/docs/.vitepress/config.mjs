import { defineConfig } from "vitepress";
import path from "path";
import { fileURLToPath } from "url";
import {
  litsxVitePress,
  litsxVitePressMarkdown,
} from "../../../packages/vitepress/src/index.js";

const docsConfigDir = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(docsConfigDir, "../../..");

export default defineConfig({
  title: "Litsx",
  description: "Lit<sup>sx</sup> is a JSX-first framework for authoring Lit-based web components, with native primitives, tooling, and optional React migration support.",
  head: [
    ["link", { rel: "icon", href: "/flame_32.png", type: "image/png", sizes: "32x32" }],
    ["link", { rel: "icon", href: "/flame_16.png", type: "image/png", sizes: "16x16" }],
    ["link", { rel: "apple-touch-icon", href: "/flame_256.png" }],
    ["link", { rel: "preconnect", href: "https://fonts.googleapis.com" }],
    ["link", { rel: "preconnect", href: "https://fonts.gstatic.com", crossorigin: "" }],
    [
      "link",
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Montserrat:wght@700;800&display=swap",
      },
    ],
  ],
  vite: {
    plugins: litsxVitePress({ workspaceRoot }),
  },
  markdown: litsxVitePressMarkdown(),
  vue: {
    template: {
      compilerOptions: {
        isCustomElement: (tag) => tag === "litsx-playground",
      },
    },
  },
  cleanUrls: true,
  themeConfig: {
    logo: "/title.svg",
    siteTitle: false,
    nav: [
      { text: "Why Lit<sup>sx</sup>", link: "/guides/why-litsx" },
      { text: "Guide", link: "/getting-started" },
      { text: "Reference", link: "/reference/" },
      { text: "Framework", link: "/framework/generated/" },
      { text: "React Migration", link: "/guides/migrating-from-react" },
      { text: "Examples", link: "/examples/" },
    ],
    sidebar: [
      {
        text: "Using Lit<sup>sx</sup>",
        items: [
          { text: "What is Lit<sup>sx</sup>?", link: "/" },
          { text: "Why Lit<sup>sx</sup>", link: "/guides/why-litsx" },
          { text: "Getting Started", link: "/getting-started" },
          { text: "JSX Authoring", link: "/guides/jsx-authoring" },
          { text: "Static Hoists", link: "/guides/static-hoists" },
          { text: "Styling", link: "/guides/styling" },
          { text: "Property Inference", link: "/guides/property-inference" },
          { text: "Primitives", link: "/guides/primitives" },
          { text: "Events", link: "/guides/events" },
          { text: "Refs", link: "/guides/refs" },
          { text: "Async UI", link: "/guides/suspense" },
          { text: "Tooling", link: "/guides/tooling" },
          { text: "Migrating from React", link: "/guides/migrating-from-react" },
          {
            text: "Example Walkthroughs",
            items: [
              { text: "Overview", link: "/examples/" },
              { text: "Counter Card", link: "/examples/counter-card" },
              { text: "Property Inference", link: "/examples/property-inference" },
              { text: "Async Reveal Order", link: "/examples/async-reveal-order" },
              { text: "Native Refs", link: "/examples/native-refs" },
              { text: "React Search Card", link: "/examples/react-search-card" },
            ],
          },
        ],
      },
      {
        text: "Reference",
        items: [
          { text: "Reference Overview", link: "/reference/" },
          {
            text: "Primitives",
            items: [
              { text: "ErrorBoundary", link: "/reference/generated/errorboundary" },
              { text: "SuspenseBoundary", link: "/reference/generated/suspenseboundary" },
              { text: "SuspenseList", link: "/reference/generated/suspenselist" },
            ],
          },
          {
            text: "Hooks",
            items: [
              { text: "useAfterUpdate", link: "/reference/generated/useafterupdate" },
              { text: "useAsyncState", link: "/reference/generated/useasyncstate" },
              { text: "useCallbackRef", link: "/reference/generated/usecallbackref" },
              { text: "useControlledState", link: "/reference/generated/usecontrolledstate" },
              { text: "useDeferredValue", link: "/reference/generated/usedeferredvalue" },
              { text: "useEmit", link: "/reference/generated/useemit" },
              { text: "useEvent", link: "/reference/generated/useevent" },
              { text: "useExpose", link: "/reference/generated/useexpose" },
              { text: "useExternalStore", link: "/reference/generated/useexternalstore" },
              { text: "useHost", link: "/reference/generated/usehost" },
              { text: "useHostContent", link: "/reference/generated/usehostcontent" },
              { text: "useMemoValue", link: "/reference/generated/usememovalue" },
              { text: "useOnCommit", link: "/reference/generated/useoncommit" },
              { text: "useOnConnect", link: "/reference/generated/useonconnect" },
              { text: "useOptimistic", link: "/reference/generated/useoptimistic" },
              { text: "usePrevious", link: "/reference/generated/useprevious" },
              { text: "useReducedState", link: "/reference/generated/usereducedstate" },
              { text: "useRef", link: "/reference/generated/useref" },
              { text: "useSlot", link: "/reference/generated/useslot" },
              { text: "useStableCallback", link: "/reference/generated/usestablecallback" },
              { text: "useState", link: "/reference/generated/usestate" },
              { text: "useTextContent", link: "/reference/generated/usetextcontent" },
              { text: "useTransition", link: "/reference/generated/usetransition" },
            ],
          },
          {
            text: "Styling",
            items: [
              { text: "useStyle", link: "/reference/generated/usestyle" },
            ],
          },
          {
            text: "Related",
            items: [
              { text: "Framework Reference", link: "/framework/generated/" },
              { text: "Examples", link: "/examples/" },
            ],
          },
        ],
      },
      {
        text: "Internals",
        collapsed: true,
        items: [
          { text: "Transform Recipes", link: "/transforms/" },
        ],
      },
    ],
    socialLinks: [{ icon: "github", link: "https://github.com/litsx/litsx" }],
  },
});
