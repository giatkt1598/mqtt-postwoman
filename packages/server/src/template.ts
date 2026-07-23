import { getVariableCollection, listVariables, AppDatabase } from "./db";
import { createTemplateHelperMap, resolveCustomHelper } from "./template/custom-helpers";
import { resolveBuiltinFunction } from "./template/functions";
import { ResolvedTemplate, TemplateContext } from "./template/types";
import { safeJsonParse } from "./utils";

export type { ResolvedTemplate, TemplateContext } from "./template/types";

function resolveHelper(name: string, context: TemplateContext) {
  if (name.startsWith("var.")) {
    const key = name.slice(4);
    return context.variableCollection?.[key] ?? context.variables?.[key] ?? "";
  }
  const builtin = resolveBuiltinFunction(name, context);
  if (builtin.matched) return builtin.value;
  const custom = resolveCustomHelper(name, context);
  return custom.matched ? custom.value : `{{${name}}}`;
}

function replaceInString(value: string, context: TemplateContext) {
  return value.replace(/{{\s*([^}]+?)\s*}}/g, (_match, token) => {
    const resolved = resolveHelper(String(token), context);
    if (resolved === undefined || resolved === null) return "";
    if (typeof resolved === "object") {
      return JSON.stringify(resolved);
    }
    return String(resolved);
  });
}

function resolveDeep(value: unknown, context: TemplateContext): unknown {
  if (typeof value === "string") {
    const trimmed = value.trim();
    const maybeJson = trimmed.startsWith("{") || trimmed.startsWith("[") ? safeJsonParse(trimmed) : null;
    if (maybeJson !== null) {
      return resolveDeep(maybeJson, context);
    }
    return replaceInString(value, context);
  }
  if (Array.isArray(value)) {
    return value.map((item) => resolveDeep(item, context));
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    return entries.reduce<Record<string, unknown>>((acc, [key, item]) => {
      acc[key] = resolveDeep(item, context);
      return acc;
    }, {});
  }
  return value;
}

export function resolveTemplatePayload(
  db: AppDatabase,
  template: string,
  variableCollectionId?: string | null,
  variables?: Record<string, unknown>,
  sequenceOffset = 0,
) {
  const variableCollectionRow = variableCollectionId
    ? getVariableCollection(db.raw, variableCollectionId)
    : undefined;
  const variableCollection = variableCollectionRow
    ? Object.fromEntries(
        listVariables(db.raw, variableCollectionRow.id).map((variable) => [variable.name, variable.value]),
      )
    : {};
  const helpers = createTemplateHelperMap(db);
  const context: TemplateContext = {
    variableCollection,
    variables,
    helpers,
    sequenceOffset,
  };

  const parsed = safeJsonParse(template);
  const resolved = resolveDeep(parsed ?? template, context);
  if (typeof resolved === "string") {
    const json = safeJsonParse(resolved);
    return {
      text: resolved,
      json,
      value: json ?? resolved,
    };
  }
  const text = typeof resolved === "string" ? resolved : JSON.stringify(resolved, null, 2);
  return {
    text,
    json: resolved,
    value: resolved,
  };
}
