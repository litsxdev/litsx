import { defineComponent, h } from "vue";
import { useRoute, withBase } from "vitepress";
import {
  buildVersionPath,
  findVersionById,
  findVersionByPath,
  getPathWithinVersion,
  getVersionIdFromPath,
} from "../shared.js";

export default defineComponent({
  name: "DocsVersionBanner",
  props: {
    versions: {
      type: Array,
      required: true,
    },
  },
  setup(props) {
    const route = useRoute();

    return () => {
      const versions = props.versions ?? [];
      const latestVersion = versions[0];

      if (!latestVersion) {
        return null;
      }

      const currentVersionId = getVersionIdFromPath(route.path);
      if (currentVersionId === "next" || currentVersionId === latestVersion.id) {
        return null;
      }

      const currentVersion = findVersionById(versions, currentVersionId);
      if (!currentVersion) {
        return null;
      }

      const latestPath = buildVersionPath(
        getPathWithinVersion(route.path, findVersionByPath(versions, route.path)),
        { prefix: "/" },
        withBase
      );

      return h("div", { class: "docs-version-banner" }, [
        h("div", { class: "docs-version-banner__inner" }, [
          h(
            "span",
            { class: "docs-version-banner__text" },
            `You are reading ${currentVersion.label}, an older version of the docs.`
          ),
          h(
            "a",
            {
              class: "docs-version-banner__link",
              href: latestPath,
            },
            "Go to the latest docs"
          ),
        ]),
      ]);
    };
  },
});
