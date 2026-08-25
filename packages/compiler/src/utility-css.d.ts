export declare const LITSX_COMPONENT_SYMBOL: "litsx.component";
export declare const LITSX_LIGHT_DOM_SCOPE_SYMBOL: "litsx.lightDomStyleScope";
export declare const LITSX_LIGHT_DOM_SCOPE_ATTRIBUTE: "data-litsx-style-scope";
export declare const UTILITY_CSS_DYNAMIC_WILDCARD: "\u0000";

export type StaticUtilitySource = {
  file: string;
  expression?: string;
  node?: unknown;
};

export type UtilityClassCandidates = {
  candidates: string[];
  dynamicPatterns: string[];
  dependencies: string[];
  staticSources: StaticUtilitySource[];
};

export declare function createStaticGuardResolver(options: {
  source?: string;
  filename?: string;
  ast?: unknown;
}): {
  resolveLocal(name: string): any;
  resolveNode(node: unknown): any;
  resolveExport(file: string, exportName: string): any;
};
export declare function resolveStaticClassExpression(
  descriptor: StaticUtilitySource,
): any;
export declare function resolveStaticGuardExport(descriptor: {
  file: string;
  exportName: string;
}): any;
export declare function runtimeStyleExpression(node: unknown): boolean;
export declare function combineUtilityStringParts(
  parts: readonly (readonly string[])[],
  limit?: number,
): string[] | null;
export declare function unwrapStringExpression(node: any, types: any): any;
export declare function inlineConstantBindings(
  node: any,
  scope: any,
  types: any,
  resolving?: Set<unknown>,
  parent?: any,
): any;
export declare function finiteStringValues(
  node: any,
  types: any,
): string[] | null;
export declare function classPatternValues(
  node: any,
  types: any,
  resolveStatic?: (node: any) => string[] | null,
  wildcard?: string,
): string[];
export declare function collectUtilityClassCandidates(
  classPath: any,
  types: any,
  staticResolver: any,
  filename?: string,
  options?: {
    dynamicWildcard?: string;
    excludeLitsxComponentClasses?: boolean;
  },
): UtilityClassCandidates;
export declare function isSymbolFor(
  node: unknown,
  name: string,
  types: any,
): boolean;
export declare function isLitsxComponentClass(
  classPath: any,
  types: any,
): boolean;
export declare function containsLightDomMixin(
  node: unknown,
  types: any,
): boolean;
export declare function getStaticRuntimeMetadataString(
  classPath: any,
  symbolKey: string,
  types: any,
): string | null;
