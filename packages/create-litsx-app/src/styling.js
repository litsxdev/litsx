export const STYLING_OPTIONS = ["css", "tailwind", "unocss"];

export function normalizeStyling(value = "css") {
  const styling = String(value || "css")
    .trim()
    .toLowerCase();
  if (!STYLING_OPTIONS.includes(styling)) {
    throw new Error(
      `Unknown styling option "${value}". Expected ${STYLING_OPTIONS.map((option) => `"${option}"`).join(", ")}.`,
    );
  }
  return styling;
}

export function styleClasses(styling, baseClasses, utilityClasses = "") {
  return styling === "css"
    ? baseClasses
    : [baseClasses, utilityClasses].filter(Boolean).join(" ");
}

export function applyStylingPackageBits(packageJson, styling, versions) {
  if (styling === "tailwind") {
    Object.assign(packageJson.devDependencies, {
      "@litsx/tailwind": versions["@litsx/tailwind"],
      "@tailwindcss/vite": "^4.3.0",
      tailwindcss: "^4.3.0",
    });
  } else if (styling === "unocss") {
    Object.assign(packageJson.devDependencies, {
      "@litsx/unocss": versions["@litsx/unocss"],
      unocss: "^66.8.1",
    });
  }
}

function createStyleIntegrationSource(styling) {
  if (styling === "tailwind") {
    return `import { createTailwindContext } from "@litsx/tailwind";
import {
  createTailwindVitePlugins,
  withTailwindViteCompiler,
} from "@litsx/tailwind/vite";

const integration = {
  entry: "./src/styles/tailwind.css",
};

export function createLitsxStyleIntegration(litsx = {}) {
  const context = createTailwindContext(integration);
  return {
    litsx: withTailwindViteCompiler(litsx, integration, context),
    plugins: createTailwindVitePlugins({}, integration, context),
  };
}
`;
  }

  return `import { presetWind3 } from "unocss";
import {
  createUnoCssVitePlugins,
  withUnoCssViteCompiler,
} from "@litsx/unocss/vite";

const integration = {};
const unocss = {
  presets: [presetWind3()],
};

export function createLitsxStyleIntegration(litsx = {}) {
  return {
    litsx: withUnoCssViteCompiler(litsx, integration),
    plugins: createUnoCssVitePlugins(unocss, integration),
  };
}
`;
}

function createViteConfig(styling) {
  if (styling === "css") {
    return `import { litsx } from "@litsx/vite-plugin";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [litsx({ sourceMaps: true })],
  resolve: {
    dedupe: ["lit", "lit-html", "lit-element", "@lit/reactive-element"],
  },
});
`;
  }

  return `import { litsx } from "@litsx/vite-plugin";
import { defineConfig } from "vite";
import { createLitsxStyleIntegration } from "./litsx.style.js";

const styling = createLitsxStyleIntegration({ sourceMaps: true });

export default defineConfig({
  plugins: [litsx(styling.litsx), ...styling.plugins],
  resolve: {
    dedupe: ["lit", "lit-html", "lit-element", "@lit/reactive-element"],
  },
});
`;
}

function createVitestConfig(styling) {
  const styleImports =
    styling === "css"
      ? ""
      : 'import { createLitsxStyleIntegration } from "./litsx.style.js";\n';
  const styleSetup =
    styling === "css"
      ? ""
      : "\nconst styling = createLitsxStyleIntegration({ sourceMaps: true });\n";
  const plugins =
    styling === "css"
      ? "[litsx({ sourceMaps: true })]"
      : "[litsx(styling.litsx), ...styling.plugins]";

  return `import { playwright } from "@vitest/browser-playwright";
import { defineConfig } from "vitest/config";
import { litsx } from "@litsx/vite-plugin";
${styleImports}${styleSetup}
export default defineConfig({
  plugins: ${plugins},
  resolve: {
    dedupe: ["lit", "lit-html", "lit-element", "@lit/reactive-element"],
  },
  optimizeDeps: {
    include: ["@litsx/core", "@litsx/core/elements", "@litsx/core/rendering", "lit"],
  },
  test: {
    include: ["src/**/*.test.js"],
    browser: {
      enabled: true,
      provider: playwright(),
      headless: true,
      instances: [{ browser: "chromium" }],
    },
  },
});
`;
}

function createStorybookMain(styling) {
  if (styling === "css") {
    return `import { createLitsxStorybookConfig } from "@litsx/storybook";

export default createLitsxStorybookConfig();
`;
  }

  return `import { createLitsxStorybookConfig } from "@litsx/storybook";
import { createLitsxStyleIntegration } from "../litsx.style.js";

const styling = createLitsxStyleIntegration();

export default createLitsxStorybookConfig({
  compiler: styling.litsx,
  vitePlugins: {
    afterLitsx: styling.plugins,
  },
});
`;
}

export function applyStylingFiles(
  files,
  styling,
  { includeStorybook = false, includeVite = true } = {},
) {
  if (includeVite) {
    files.set("vite.config.js", createViteConfig(styling));
  } else {
    files.delete("vite.config.js");
  }
  files.set("vitest.config.js", createVitestConfig(styling));

  if (styling !== "css") {
    files.set("litsx.style.js", createStyleIntegrationSource(styling));
  }

  if (styling === "tailwind") {
    files.set(
      "src/styles/tailwind.css",
      `@import "tailwindcss" source(none);

@theme {
  --color-brand: #f05a28;
}
`,
    );
  }

  if (includeStorybook) {
    files.set(".storybook/main.js", createStorybookMain(styling));
  }
}

export function appendStylingReadme(readme, styling) {
  const label =
    styling === "css"
      ? "Lit component CSS"
      : styling === "tailwind"
        ? "Tailwind CSS"
        : "UnoCSS";
  return `${readme.trimEnd()}

## Styling

This scaffold uses **${label}**. Regenerate with \`--styles css\`,
\`--styles tailwind\`, or \`--styles unocss\` to select another profile.
`;
}
