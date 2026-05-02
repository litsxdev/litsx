import { createReactCompatPresetPlugins } from "./pipeline.js";

export { createReactCompatPresetPlugins } from "./pipeline.js";

export default function reactCompatPreset(api, options = {}) {
  api.assertVersion?.("^8.0.0-0");

  return {
    plugins: createReactCompatPresetPlugins(options),
  };
}
