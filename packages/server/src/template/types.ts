import { TemplateHelperRow } from "../types";

export interface TemplateContext {
  environment?: Record<string, unknown>;
  variables?: Record<string, unknown>;
  helpers?: Record<string, TemplateHelperRow>;
  sequenceOffset?: number;
}

export type TemplateFunction = (
  args: string[],
  context: TemplateContext,
) => unknown;

export interface BuiltinFunctionDefinition {
  name: string;
  description: string;
  resolve: TemplateFunction;
}

export interface ResolvedTemplate {
  text: string;
  json: unknown | null;
  value: unknown;
}
