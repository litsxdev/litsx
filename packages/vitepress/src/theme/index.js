import { h } from "vue";
import DefaultTheme from "vitepress/theme-without-fonts";
import DocsVersionBanner from "./DocsVersionBanner.js";
import DocsVersionSelect from "./DocsVersionSelect.js";
import { defaultDocsVersions } from "../versions.js";

export { default as DocsVersionBanner } from "./DocsVersionBanner.js";
export { default as DocsVersionSelect } from "./DocsVersionSelect.js";

export function createLitsxVitePressTheme({ versions = defaultDocsVersions } = {}) {
  return {
    ...DefaultTheme,
    Layout() {
      return h(DefaultTheme.Layout, null, {
        "nav-bar-content-after": () => h(DocsVersionSelect, { versions }),
        "page-top": () => h(DocsVersionBanner, { versions }),
      });
    },
    enhanceApp({ app }) {
      DefaultTheme.enhanceApp?.({ app });
    },
  };
}

export default createLitsxVitePressTheme;
