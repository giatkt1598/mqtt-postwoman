import test from "node:test";
import assert from "node:assert/strict";
import { resolveTemplatePayload } from "../src/template";
import { AppDatabase } from "../src/db";
import { listBuiltinFunctions } from "../src/template/functions";

const fakeDb = {
  raw: {
    prepare() {
      return {
        all() {
          return [];
        },
      };
    },
  } as never,
  init() {},
} as AppDatabase;

test("resolves now token inside json string", () => {
  const result = resolveTemplatePayload(fakeDb, '{"publishDate":"{{now}}"}');
  assert.equal(typeof result.text, "string");
  assert.equal(typeof result.value, "object");
  const payload = result.value as Record<string, unknown>;
  assert.equal(typeof payload.publishDate, "string");
});

test("resolves now token with a Day.js format", () => {
  const result = resolveTemplatePayload(fakeDb, '{"publishDate":"{{now:yyyy-MM-dd}}"}');
  const payload = result.value as Record<string, unknown>;
  assert.match(String(payload.publishDate), /^\d{4}-\d{2}-\d{2}$/);
});

test("resolves env token", () => {
  const result = resolveTemplatePayload(fakeDb, '{"name":"{{env.NAME}}"}', undefined, { NAME: "mqtt" });
  const payload = result.value as Record<string, unknown>;
  assert.equal(payload.name, "mqtt");
});

test("resolves sequence token with batch offset", () => {
  const result = resolveTemplatePayload(fakeDb, '{"sequence":"{{sequence:1}}"}', undefined, {}, 2);
  const payload = result.value as Record<string, unknown>;
  assert.equal(payload.sequence, "3");
});

test("resolves padded sequence token with batch offset", () => {
  const result = resolveTemplatePayload(fakeDb, '{"sequence":"{{sequence:1:6}}"}', undefined, {}, 1);
  const payload = result.value as Record<string, unknown>;
  assert.equal(payload.sequence, "000002");
});

test("resolves timestamp and randomInt built-ins", () => {
  const result = resolveTemplatePayload(
    fakeDb,
    '{"timestamp":"{{timestamp}}","value":"{{randomInt:10:10}}"}',
  );
  const payload = result.value as Record<string, unknown>;
  assert.match(String(payload.timestamp), /^\d+$/);
  assert.equal(payload.value, "10");
});

test("exposes built-ins from the function registry", () => {
  const functions = listBuiltinFunctions();
  assert.deepEqual(
    functions.map((item) => item.name),
    ["now", "uuid", "timestamp", "sequence", "randomInt"],
  );
  assert.ok(functions.every((item) => item.description.length > 0));
});
