import { defineComponent, h } from "vue";
import { useRoute, withBase } from "vitepress";
import {
  buildVersionPath,
  findVersionByPath,
  getPathWithinVersion,
} from "../shared.js";

export default defineComponent({
  name: "DocsVersionSelect",
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
      if (versions.length === 0) {
        return null;
      }

      const currentVersion = findVersionByPath(versions, route.path);
      const currentValue = currentVersion?.id ?? "";
      const pathWithinVersion = getPathWithinVersion(route.path, currentVersion);

      return h("label", { class: "docs-version-select", "aria-label": "Documentation version" }, [
        h(
          "select",
          {
            class: "docs-version-select__control",
            value: currentValue,
            onChange(event) {
              const nextVersion = versions.find(
                (version) => version.id === event.target.value
              );

              if (!nextVersion) {
                return;
              }

              window.location.href = buildVersionPath(pathWithinVersion, nextVersion, withBase);
            },
          },
          versions.map((version) =>
            h(
              "option",
              { value: version.id },
              version.current ? `${version.label} (Current)` : version.label
            )
          )
        ),
      ]);
    };
  },
});
