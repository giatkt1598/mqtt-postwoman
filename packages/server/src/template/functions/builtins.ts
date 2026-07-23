import { randomUUID } from "crypto";
import dayjs from "dayjs";
import {
  BuiltinFunctionDefinition,
  TemplateContext,
} from "../types";

function normalizeDayjsFormat(format: string) {
  return format.replace(/yyyy/g, "YYYY").replace(/yy/g, "YY").replace(/dd/g, "DD");
}

function formatNow(format?: string) {
  const current = dayjs();
  if (!format || format === "iso") return current.toISOString();
  if (format === "date") return current.format("YYYY-MM-DD");
  if (format === "time") return current.format("HH:mm:ss");
  return current.format(normalizeDayjsFormat(format));
}

function resolveSequence(args: string[], context: TemplateContext) {
  const start = Number(args[0] ?? 0);
  const value = (Number.isFinite(start) ? start : 0) + (context.sequenceOffset ?? 0);
  const digits = Number(args[1]);
  return Number.isInteger(digits) && digits > 0
    ? String(value).padStart(digits, "0")
    : value;
}

function resolveRandomInt(args: string[]) {
  const min = Number(args[0] ?? 0);
  const max = Number(args[1] ?? 999999);
  const lower = Number.isFinite(min) ? min : 0;
  const upper = Number.isFinite(max) ? max : 999999;
  return Math.floor(lower + Math.random() * (upper - lower + 1));
}

export const builtinFunctions: BuiltinFunctionDefinition[] = [
  {
    name: "now",
    description: "Current time, optionally formatted with Day.js tokens.",
    resolve: (args) => formatNow(args.join(":")),
  },
  {
    name: "uuid",
    description: "Generates a new UUID.",
    resolve: () => randomUUID(),
  },
  {
    name: "timestamp",
    description: "Current Unix timestamp in milliseconds.",
    resolve: () => Date.now(),
  },
  {
    name: "sequence",
    description: "Generates a sequence with optional zero padding.",
    resolve: resolveSequence,
  },
  {
    name: "randomInt",
    description: "Generates a random integer between min and max.",
    resolve: resolveRandomInt,
  },
];
