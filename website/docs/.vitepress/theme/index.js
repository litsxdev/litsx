import { h } from "vue";
import DefaultTheme from "vitepress/theme-without-fonts";
import DocsVersionBanner from "../../../../packages/vitepress/src/theme/DocsVersionBanner.js";
import DocsVersionSelect from "../../../../packages/vitepress/src/theme/DocsVersionSelect.js";
import { defaultDocsVersions } from "../../../../packages/vitepress/src/versions.js";
import "../../../../packages/vitepress/src/styles.css";
import "./custom.css";
import "./components/LitsxPlayground.tsx";
import NavTitleIcon from "./components/NavTitleIcon.js";

const versions = defaultDocsVersions;

export default {
  ...DefaultTheme,
  Layout() {
    return h(DefaultTheme.Layout, null, {
      "nav-bar-title-before": () => h(NavTitleIcon),
      "nav-bar-content-after": () => h(DocsVersionSelect, { versions }),
      "page-top": () => h(DocsVersionBanner, { versions }),
    });
  },
  enhanceApp({ app }) {
    DefaultTheme.enhanceApp?.({ app });
  },
};
