import { createLitsxPresetPlugins } from "./pipeline.js";

export { createLitsxPresetPlugins, detectLitsxSourceFeatures } from "./pipeline.js";
export {
  createTransformLitsxComponentsPlugin,
  setTypescriptModule,
} from "./pipeline.js";

export default function litsxPreset(api, options = {}) {
  api.assertVersion?.(7);

  return {
    plugins: createLitsxPresetPlugins(options),
  };
}
