import initCanonical from "@litsx/typescript";
import { warnDeprecatedTypescriptPlugin } from "./deprecation.js";

export * from "@litsx/typescript";

export default function init(modules) {
  const plugin = initCanonical(modules);
  return {
    ...plugin,
    create(info) {
      warnDeprecatedTypescriptPlugin(info?.project?.projectService?.logger);
      return plugin.create(info);
    },
  };
}
