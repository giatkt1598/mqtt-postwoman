import test from "node:test";
import assert from "node:assert/strict";
import { RuntimeManager } from "../src/runtime";
import { validatePublishTopic } from "../src/topic";
import { AppDatabase } from "../src/db";

const fakeDb = {
  raw: {} as never,
  init() {},
} as AppDatabase;

const payload = { text: "{}", json: {}, value: {} };
const options = { qos: 0, retain: false };

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
  let brokerLookupCount = 0;
  const db = {
    raw: {
      prepare() {
        brokerLookupCount += 1;
        throw new Error("Broker lookup should not run");
      },
    } as never,
    init() {},
  } as AppDatabase;
  const runtime = new RuntimeManager(db, () => undefined);

  await assert.rejects(
    runtime.publish("broker-id", "device/+/status", payload, options),
    /wildcards/,
  );
  assert.equal(brokerLookupCount, 0);
});

test("batch publish rejects an invalid topic before opening a broker connection", async () => {
  let brokerLookupCount = 0;
  const db = {
    raw: {
      prepare() {
        brokerLookupCount += 1;
        throw new Error("Broker lookup should not run");
      },
    } as never,
    init() {},
  } as AppDatabase;
  const runtime = new RuntimeManager(db, () => undefined);

  await assert.rejects(
    runtime.batchPublish(
      "broker-id",
      [{ topic: "device/#", payload }],
      options,
    ),
    /wildcards/,
  );
  assert.equal(brokerLookupCount, 0);
});
