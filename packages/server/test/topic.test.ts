import test from "node:test";
import assert from "node:assert/strict";
import { RuntimeService } from "../src/runtime";
import { validatePublishTopic } from "../src/topic";
import { AppRepositories } from "../src/repositories";

test("accepts concrete MQTT publish topics", () => {
  assert.doesNotThrow(() => validatePublishTopic("device/device-01/status"));
  assert.doesNotThrow(() => validatePublishTopic("/device/status/"));
  assert.doesNotThrow(() => validatePublishTopic("device status"));
});

test("rejects empty, NULL, and wildcard publish topics", () => {
  assert.throws(() => validatePublishTopic(""), /Publish topic is required/);
  assert.throws(() => validatePublishTopic("  "), /Publish topic is required/);
  assert.throws(() => validatePublishTopic("device/\u0000/status"), /NULL character/);
  assert.throws(() => validatePublishTopic("device/+/status"), /wildcards/);
  assert.throws(() => validatePublishTopic("device/#"), /wildcards/);
});

test("rejects invalid topic before opening a broker connection", async () => {
  const runtime = new RuntimeService({} as AppRepositories, () => undefined);
  await assert.rejects(runtime.publish("broker-id", "device/+/status", { text: "{}", json: {}, value: {} }, { qos: 0, retain: false }), /wildcards/);
});
