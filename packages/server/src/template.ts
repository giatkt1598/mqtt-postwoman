import { randomUUID } from "crypto";
import dayjs from "dayjs";
import { AppDatabase, listHelpers, getEnvironment } from "./db";
import { HelperKind, TemplateHelperRow } from "./types";
import { parseObjectLike, safeJsonParse } from "./utils";

export interface TemplateContext {
  environment?: Record<string, unknown>;
  variables?: Record<string, unknown>;
  helpers?: Record<string, TemplateHelperRow>;
  sequenceOffset?: number;
}

export interface ResolvedTemplate {
  text: string;
  json: unknown | null;
}

type HelperResolver = (config: Record<string, unknown>, context: TemplateContext) => unknown;

function formatDate(date: Date, format?: unknown) {
  const current = dayjs(date);
  if (typeof format !== "string" || !format) return current.toISOString();
  if (format === "iso") return current.toISOString();
  if (format === "date") return current.format("YYYY-MM-DD");
  if (format === "time") return current.format("HH:mm:ss");
  // Accept the common lowercase year/day spelling while keeping Day.js tokens.
  const dayjsFormat = format.replace(/yyyy/g, "YYYY").replace(/yy/g, "YY").replace(/dd/g, "DD");
  return current.format(dayjsFormat);
}

const builtinHelpers: Record<string, HelperResolver> = {
  now: (config) => formatDate(new Date(), config.format),
  uuid: () => randomUUID(),
  timestamp: () => Date.now(),
};

const helperKindResolvers: Record<HelperKind, HelperResolver> = {
  literal: (config) => config.value ?? "",
  now: (config) => formatDate(new Date(), config.format),
  uuid: () => randomUUID(),
  randomInt: (config) => {
    const min = Number(config.min ?? 0);
    const max = Number(config.max ?? 999999);
    return Math.floor(min + Math.random() * (max - min + 1));
  },
  env: (config, context) => {
    const key = String(config.key ?? "");
    return context.environment?.[key] ?? context.variables?.[key] ?? "";
  },
};

function loadCustomHelpers(db: AppDatabase) {
  const rows = listHelpers(db.raw);
  return rows.reduce<Record<string, TemplateHelperRow>>((acc, row) => {
    acc[row.name] = row;
    return acc;
  }, {});
}

function resolveHelper(name: string, context: TemplateContext) {
  if (name.startsWith("now:")) {
    return builtinHelpers.now?.({ format: name.slice("now:".length) }, context);
  }
  if (name.startsWith("sequence:")) {
    const [startText, digitsText] = name.slice("sequence:".length).split(":");
    const start = Number(startText);
    const value = (Number.isFinite(start) ? start : 0) + (context.sequenceOffset ?? 0);
    const digits = Number(digitsText);
    return Number.isInteger(digits) && digits > 0 ? String(value).padStart(digits, "0") : value;
  }
  if (name.startsWith("env.")) {
    const key = name.slice(4);
    return context.environment?.[key] ?? context.variables?.[key] ?? "";
  }
  if (Object.prototype.hasOwnProperty.call(builtinHelpers, name)) {
    return builtinHelpers[name]?.({}, context);
  }
  const helper = context.helpers?.[name];
  if (!helper) return `{{${name}}}`;
  const config = parseObjectLike(safeJsonParse(helper.configJson));
  return helperKindResolvers[helper.kind](config, context);
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
  environmentId?: string | null,
  variables?: Record<string, unknown>,
  sequenceOffset = 0,
) {
  const environmentRow = environmentId ? getEnvironment(db.raw, environmentId) : undefined;
  const environment = environmentRow ? (safeJsonParse(environmentRow.variablesJson) as Record<string, unknown> | null) ?? {} : {};
  const helpers = loadCustomHelpers(db);
  const context: TemplateContext = {
    environment,
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
