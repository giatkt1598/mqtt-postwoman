import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import {
  deleteVariable,
  deleteVariableCollection,
  getVariable,
  listVariableCollections,
  listVariables,
  openDatabase,
  upsertCollection,
  upsertVariable,
  upsertVariableCollection,
} from "../src/db";

function withDatabase(run: (file: string) => void) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "mqtt-postwoman-"));
  const file = path.join(directory, "test.db");
  const previous = process.env.SQLITE_PATH;
  process.env.SQLITE_PATH = file;
  try {
    run(file);
  } finally {
    if (previous === undefined) delete process.env.SQLITE_PATH;
    else process.env.SQLITE_PATH = previous;
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

test("supports variable collection and variable CRUD", () => {
  withDatabase((file) => {
    const database = openDatabase();
    database.init();
    const collection = upsertVariableCollection(database.raw, { name: "local" });
    assert.ok(collection);
    assert.throws(
      () => upsertVariableCollection(database.raw, { name: " LOCAL " }),
      /already exists/,
    );
    const variable = upsertVariable(database.raw, {
      variableCollectionId: collection!.id,
      name: "API_URL",
      value: "http://localhost",
    });
    assert.equal(variable?.value, "http://localhost");
    assert.throws(
      () =>
        upsertVariable(database.raw, {
          variableCollectionId: collection!.id,
          name: "API_URL",
          value: "duplicate",
        }),
      /already exists/,
    );
    assert.equal(listVariables(database.raw, collection!.id).length, 1);
    deleteVariable(database.raw, variable!.id);
    assert.equal(getVariable(database.raw, variable!.id), undefined);
    deleteVariableCollection(database.raw, collection!.id);
    assert.equal(listVariableCollections(database.raw).length, 0);
    database.raw.close();
    assert.ok(file);
  });
});

test("migrates legacy environments and request references", () => {
  withDatabase((file) => {
    const legacy = new Database(file);
    legacy.exec(`
      CREATE TABLE collections (id TEXT PRIMARY KEY, name TEXT, description TEXT, sortOrder INTEGER DEFAULT 0, createdAt TEXT, updatedAt TEXT);
      CREATE TABLE environments (id TEXT PRIMARY KEY, name TEXT, variablesJson TEXT, createdAt TEXT, updatedAt TEXT);
      CREATE TABLE requests (
        id TEXT PRIMARY KEY, collectionId TEXT, name TEXT, topic TEXT, payloadTemplate TEXT,
        qos INTEGER, retain INTEGER, brokerProfileId TEXT, environmentId TEXT,
        sortOrder INTEGER DEFAULT 0, createdAt TEXT, updatedAt TEXT
      );
      INSERT INTO collections VALUES ('collection-1', 'Collection', NULL, 0, 'now', 'now');
      INSERT INTO environments VALUES ('env-1', 'local', '{"API_URL":"http://localhost","PORT":1883}', 'now', 'now');
      INSERT INTO requests VALUES ('request-1', 'collection-1', 'Request', 'topic', '{}', 0, 0, NULL, 'env-1', 0, 'now', 'now');
    `);
    legacy.close();

    const database = openDatabase();
    database.init();
    const collections = listVariableCollections(database.raw);
    const variables = listVariables(database.raw, "env-1");
    const collection = database.raw.prepare("SELECT variableCollectionId FROM collections WHERE id = ?").get("collection-1") as {
      variableCollectionId: string;
    };
    const requestColumns = database.raw.prepare("PRAGMA table_info(requests)").all() as Array<{ name: string }>;
    assert.equal(collections[0]?.name, "local");
    assert.deepEqual(variables.map((item) => item.name), ["API_URL", "PORT"]);
    assert.equal(collection.variableCollectionId, "env-1");
    assert.equal(requestColumns.some((column) => column.name === "variableCollectionId"), false);
    upsertCollection(database.raw, { id: "collection-1", name: "Renamed" });
    assert.equal(
      (database.raw.prepare("SELECT variableCollectionId FROM collections WHERE id = ?").get("collection-1") as { variableCollectionId: string }).variableCollectionId,
      "env-1",
    );
    assert.equal(
      database.raw.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'environments'").get(),
      undefined,
    );
    database.raw.close();
  });
});
