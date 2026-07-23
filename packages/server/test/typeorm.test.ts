import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { initializeDatabase } from "../src/database/data-source";
import { AppRepositories } from "../src/repositories";

test("TypeORM migrations create the current schema and repositories persist data", async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "mqtt-postwoman-typeorm-"));
  const previous = process.env.SQLITE_PATH;
  process.env.SQLITE_PATH = path.join(directory, "test.db");
  const dataSource = await initializeDatabase();
  try {
    const repositories = new AppRepositories(dataSource);
    const variableCollection = await repositories.saveVariableCollection({ name: "local" });
    const variable = await repositories.saveVariable({ variableCollectionId: variableCollection.id, name: "HOST", value: "localhost" });
    assert.equal(variable.value, "localhost");
    assert.equal((await repositories.listVariables(variableCollection.id)).length, 1);
    await repositories.deleteVariableCollection(variableCollection.id);
    assert.equal((await repositories.listVariables(variableCollection.id)).length, 0);
  } finally {
    await dataSource.destroy();
    if (previous === undefined) delete process.env.SQLITE_PATH;
    else process.env.SQLITE_PATH = previous;
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
