import { MessageLogRow } from "../models";

export function parseJsonObject(value: string) {
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed
      : null;
  } catch {
    return null;
  }
}

export function toPrettyJson(value: unknown) {
  return JSON.stringify(value, null, 2);
}

export function formatTime(value: string) {
  return new Date(value).toLocaleString();
}

export function joinTopics(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function beautifyXml(value: string) {
  const normalized = value.replace(/>\s*</g, "><").replace(/></g, ">\n<");
  let depth = 0;
  return normalized
    .split("\n")
    .map((line) => {
      if (line.startsWith("</")) depth = Math.max(depth - 1, 0);
      const formatted = `${"  ".repeat(depth)}${line}`;
      if (
        line.startsWith("<") &&
        !line.startsWith("</") &&
        !line.endsWith("/>") &&
        !line.includes("</")
      )
        depth += 1;
      return formatted;
    })
    .join("\n");
}

export function randomTopicColor() {
  return `#${Math.floor(Math.random() * 0xffffff)
    .toString(16)
    .padStart(6, "0")}`;
}

export function mergeLogs(current: MessageLogRow[], incoming: MessageLogRow[]) {
  const byId = new Map(current.map((log) => [log.id, log]));
  for (const log of incoming) byId.set(log.id, log);
  return [...byId.values()]
    .sort(
      (left, right) =>
        new Date(right.createdAt).getTime() -
        new Date(left.createdAt).getTime(),
    )
    .slice(0, 200);
}
