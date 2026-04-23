import { createReactCompatPresetPlugins } from "./pipeline.js";

export { createReactCompatPresetPlugins } from "./pipeline.js";

export default function reactCompatPreset(api, options = {}) {
  api.assertVersion?.(7);

  return {
    plugins: createReactCompatPresetPlugins(options),
  };
}
