import { createLitsxPresetPlugins } from "./pipeline.js";

export { createLitsxPresetPlugins, detectLitsxSourceFeatures } from "./pipeline.js";
export {
  createTransformLitsxComponentsPlugin,
  setTypescriptModule,
} from "./pipeline.js";

export default function litsxPreset(api, options = {}) {
  api.assertVersion?.("^8.0.0-0");

  return {
    plugins: createLitsxPresetPlugins(options),
  };
}
