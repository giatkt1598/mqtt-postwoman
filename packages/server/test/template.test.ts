import test from "node:test";
import assert from "node:assert/strict";
import { resolveTemplatePayload } from "../src/template";
import { AppDatabase } from "../src/db";

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
