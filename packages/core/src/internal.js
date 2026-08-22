/**
 * Compiler/runtime ABI. This entrypoint is generated-code infrastructure and
 * is not part of the LitSX authoring API.
 */
export {
  STRUCTURAL_HOOKS,
  applyStructuralHooks,
  readStructuralHook,
} from "./structural-hooks-runtime.js";
export {
  prepareEffects,
  runWithHookHost,
} from "./runtime-controller.js";
