import { builtinFunctions } from "./builtins";
import { TemplateContext } from "../types";

const builtinRegistry = new Map(
  builtinFunctions.map((definition) => [definition.name, definition]),
);

export function resolveBuiltinFunction(
  token: string,
  context: TemplateContext,
) {
  const [name, ...args] = token.split(":");
  const definition = builtinRegistry.get(name);
  if (!definition) return { matched: false, value: undefined };
  return { matched: true, value: definition.resolve(args, context) };
}

export function listBuiltinFunctions() {
  return builtinFunctions.map(({ name, description }) => ({ name, description }));
}

export { builtinFunctions } from "./builtins";
