import { AppDatabase, listHelpers } from "../db";
import { HelperKind, TemplateHelperRow } from "../types";
import { parseObjectLike, safeJsonParse } from "../utils";
import { TemplateContext } from "./types";
import { builtinFunctions } from "./functions";

type CustomHelperResolver = (
  config: Record<string, unknown>,
  context: TemplateContext,
) => unknown;

function loadCustomHelpers(db: AppDatabase) {
  return listHelpers(db.raw).reduce<Record<string, TemplateHelperRow>>(
    (acc, row) => {
      acc[row.name] = row;
      return acc;
    },
    {},
  );
}

const helperKindResolvers: Record<HelperKind, CustomHelperResolver> = {
  literal: (config) => config.value ?? "",
  now: (config) => {
    const format = typeof config.format === "string" ? config.format : "";
    return builtinFunctions.find((item) => item.name === "now")?.resolve(
      [format],
      {},
    );
  },
  uuid: () => builtinFunctions.find((item) => item.name === "uuid")?.resolve([], {}),
  randomInt: (config) => {
    const min = String(config.min ?? 0);
    const max = String(config.max ?? 999999);
    return builtinFunctions.find((item) => item.name === "randomInt")?.resolve(
      [min, max],
      {},
    );
  },
  env: (config, context) => {
    const key = String(config.key ?? "");
    return context.environment?.[key] ?? context.variables?.[key] ?? "";
  },
};

export function createTemplateHelperMap(db: AppDatabase) {
  return loadCustomHelpers(db);
}

export function resolveCustomHelper(
  name: string,
  context: TemplateContext,
) {
  const helper = context.helpers?.[name];
  if (!helper) return { matched: false, value: undefined };
  const config = parseObjectLike(safeJsonParse(helper.configJson));
  const resolver = helperKindResolvers[helper.kind];
  return {
    matched: true,
    value: resolver ? resolver(config, context) : `{{${name}}}`,
  };
}
