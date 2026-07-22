import { randomUUID } from "crypto";

export function nowIso() {
  return new Date().toISOString();
}

export function createId() {
  return randomUUID();
}

export function safeJsonParse(value: string) {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

export function indent(text: string, spaces: number) {
  const pad = " ".repeat(spaces);
  return text
    .split("\n")
    .map((line) => `${pad}${line}`)
    .join("\n");
}

export function parseObjectLike(value: unknown) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}
