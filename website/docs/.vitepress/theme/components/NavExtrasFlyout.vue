<script setup>
import { computed } from "vue";
import { useData } from "vitepress";
import VPFlyout from "vitepress/dist/client/theme-default/components/VPFlyout.vue";
import VPSwitchAppearance from "vitepress/dist/client/theme-default/components/VPSwitchAppearance.vue";
import DocsVersionSelect from "../../../../../packages/vitepress/src/theme/DocsVersionSelect.js";

const props = defineProps({
  versions: {
    type: Array,
    required: true,
  },
});

const { theme } = useData();

const githubLink = computed(() =>
  (theme.value.socialLinks || []).find((link) => link.icon === "github")?.link ||
  "https://github.com/litsxdev/litsx",
);
</script>

<template>
  <div class="litsx-nav-extras-wrap">
    <div class="litsx-nav-version-inline">
      <DocsVersionSelect :versions="versions" />
    </div>

    <VPFlyout class="litsx-nav-extras" label="extra navigation">
      <div class="group">
        <div class="item appearance">
          <p class="label">{{ theme.darkModeSwitchLabel || "Appearance" }}</p>
          <div class="appearance-action">
            <VPSwitchAppearance />
          </div>
        </div>
      </div>

      <div class="group">
        <a class="item github" :href="githubLink" target="_blank" rel="noopener">
          <span class="github-icon" aria-hidden="true"></span>
          <span class="label">GitHub</span>
        </a>
      </div>

      <div class="group">
        <div class="item version">
          <p class="label">Version</p>
          <DocsVersionSelect :versions="versions" />
        </div>
      </div>
    </VPFlyout>
  </div>
</template>
