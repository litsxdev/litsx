import { h } from "vue";
import DefaultTheme from "vitepress/theme-without-fonts";
import DocsVersionBanner from "../../../../packages/vitepress/src/theme/DocsVersionBanner.js";
import { defaultDocsVersions } from "../../../../packages/vitepress/src/versions.js";
import "../../../../packages/vitepress/src/styles.css";
import "./custom.css";
import "./components/LitsxPlayground.tsx";
import HomeAfterHero from "./components/HomeAfterHero.vue";
import HomeHeroPills from "./components/HomeHeroPills.js";
import NavExtrasFlyout from "./components/NavExtrasFlyout.vue";
import NavTitleIcon from "./components/NavTitleIcon.js";

const versions = defaultDocsVersions;

export default {
  ...DefaultTheme,
  Layout() {
    return h(DefaultTheme.Layout, null, {
      "nav-bar-title-before": () => h(NavTitleIcon),
      "nav-bar-content-after": () => h(NavExtrasFlyout, { versions }),
      "page-top": () => h(DocsVersionBanner, { versions }),
      "home-hero-actions-after": () => h(HomeHeroPills),
      "home-features-after": () => h(HomeAfterHero),
    });
  },
  enhanceApp({ app }) {
    DefaultTheme.enhanceApp?.({ app });
  },
};
