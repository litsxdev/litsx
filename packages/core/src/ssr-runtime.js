import { registerSsrEffectsController } from "./runtime-controller.js";
import { SsrEffectsController } from "./ssr-effects-controller.js";

registerSsrEffectsController(
  (host, ssrContext) => new SsrEffectsController(host, ssrContext),
);

export { SsrEffectsController };
