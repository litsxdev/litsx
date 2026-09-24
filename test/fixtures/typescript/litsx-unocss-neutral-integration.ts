import type { TransformLitsxOptions, TransformLitsxResult } from "@litsx/compiler";
import { litsxUnoCss } from "../../../packages/unocss/src/index.js";

type EvolitCompilerOptions = Omit<
  TransformLitsxOptions,
  "filename" | "ssr" | "reactCompat"
> & { reactCompat?: false };

type EvolitLitsxIntegration = {
  readonly name: string;
  create(context: Readonly<{
    projectRoot: string;
    mode: "development" | "production";
    identity: Readonly<{ id: string }>;
  }>): Promise<{
    compiler?: EvolitCompilerOptions;
    resolveModule?(context: Readonly<{
      specifier: string;
      importer: string;
      target: "server" | "client";
      ssr: boolean;
      sourceMaps: boolean;
      generation: number;
      mode: "development" | "production";
    }>): Promise<null | void | { code: string; dependencies?: string[] }>;
    processModule?(context: Readonly<{
      result: TransformLitsxResult;
      sourcePath: string;
      source: string;
      target: "server" | "client";
      ssr: boolean;
      sourceMaps: boolean;
      generation: number;
    }>): unknown;
    finalize?(): unknown;
    invalidate?(context: Readonly<{ paths: string[] | null }>): unknown;
    forget?(context: Readonly<{ moduleId: string }>): unknown;
    dispose?(): unknown;
  }>;
};

const integration: EvolitLitsxIntegration = litsxUnoCss();
integration satisfies EvolitLitsxIntegration;
