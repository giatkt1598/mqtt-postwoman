import { MigrationInterface, QueryRunner } from "typeorm";
import { randomUUID } from "node:crypto";

export class MigrateLegacyEnvironment1760000000001 implements MigrationInterface {
  name = "MigrateLegacyEnvironment1760000000001";

  async up(queryRunner: QueryRunner) {
    const hasTable = async (name: string) => (await queryRunner.query(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = '${name}'`)).length > 0;
    const columns = async (table: string) => (await queryRunner.query(`PRAGMA table_info(${table})`)) as Array<{ name: string }>;
    if (await hasTable("collections")) {
      const collectionColumns = await columns("collections");
      if (!collectionColumns.some((item) => item.name === "variableCollectionId")) await queryRunner.query("ALTER TABLE collections ADD COLUMN variableCollectionId TEXT");
      if (!collectionColumns.some((item) => item.name === "sortOrder")) await queryRunner.query("ALTER TABLE collections ADD COLUMN sortOrder INTEGER NOT NULL DEFAULT 0");
    }
    if (await hasTable("requests")) {
      const requestColumns = await columns("requests");
      if (!requestColumns.some((item) => item.name === "sortOrder")) await queryRunner.query("ALTER TABLE requests ADD COLUMN sortOrder INTEGER NOT NULL DEFAULT 0");
      if (requestColumns.some((item) => item.name === "environmentId") && !requestColumns.some((item) => item.name === "variableCollectionId")) await queryRunner.query("ALTER TABLE requests RENAME COLUMN environmentId TO variableCollectionId");
    }
    if (await hasTable("broker_profiles")) {
      const brokerColumns = await columns("broker_profiles");
      if (!brokerColumns.some((item) => item.name === "validateCertificate")) await queryRunner.query("ALTER TABLE broker_profiles ADD COLUMN validateCertificate INTEGER NOT NULL DEFAULT 1");
      if (!brokerColumns.some((item) => item.name === "encryption")) await queryRunner.query("ALTER TABLE broker_profiles ADD COLUMN encryption INTEGER NOT NULL DEFAULT 0");
    }
    if (await hasTable("environments")) {
      const legacyRows = await queryRunner.query("SELECT id, name, variablesJson, createdAt, updatedAt FROM environments");
      for (const row of legacyRows) {
        await queryRunner.query("INSERT OR IGNORE INTO variable_collections (id, name, createdAt, updatedAt) VALUES (?, ?, ?, ?)", [row.id, row.name, row.createdAt, row.updatedAt]);
        let values: Record<string, unknown> = {};
        try { const parsed = JSON.parse(row.variablesJson); if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) values = parsed; } catch { /* preserve malformed legacy data as an empty collection */ }
        for (const [name, value] of Object.entries(values)) await queryRunner.query("INSERT OR IGNORE INTO variables (id, variableCollectionId, name, value, sortOrder, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?)", [randomUUID(), row.id, name, typeof value === "string" ? value : JSON.stringify(value), Object.keys(values).indexOf(name), row.createdAt, row.updatedAt]);
      }
      if (await hasTable("requests")) await queryRunner.query("UPDATE collections SET variableCollectionId = (SELECT variableCollectionId FROM requests WHERE requests.collectionId = collections.id AND variableCollectionId IS NOT NULL AND variableCollectionId != '' ORDER BY createdAt ASC LIMIT 1) WHERE variableCollectionId IS NULL");
      await queryRunner.query("DROP TABLE environments");
    }
    if (await hasTable("requests") && (await columns("requests")).some((item) => item.name === "variableCollectionId")) {
      await queryRunner.query("UPDATE collections SET variableCollectionId = (SELECT variableCollectionId FROM requests WHERE requests.collectionId = collections.id AND variableCollectionId IS NOT NULL AND variableCollectionId != '' ORDER BY createdAt ASC LIMIT 1) WHERE variableCollectionId IS NULL");
      await queryRunner.query("ALTER TABLE requests DROP COLUMN variableCollectionId");
    }
  }

  async down() { /* legacy data is intentionally not reconstructed */ }
}
