import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import {
  BrokerProfileRow,
  CollectionRow,
  ConsumerSessionRow,
  EnvironmentRow,
  HelperKind,
  MessageLogRow,
  RequestRow,
  TemplateHelperRow,
} from "./types";
import { createId, nowIso } from "./utils";

export interface AppDatabase {
  raw: Database.Database;
  init(): void;
}

export function openDatabase(): AppDatabase {
  const file = process.env.SQLITE_PATH ?? path.resolve(process.cwd(), "data", "mqtt-postwoman.db");
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const raw = new Database(file);
  raw.pragma("journal_mode = WAL");
  raw.pragma("foreign_keys = ON");
  return {
    raw,
    init() {
      raw.exec(`
        CREATE TABLE IF NOT EXISTS collections (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          description TEXT,
          sortOrder INTEGER NOT NULL DEFAULT 0,
          createdAt TEXT NOT NULL,
          updatedAt TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS environments (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          variablesJson TEXT NOT NULL,
          createdAt TEXT NOT NULL,
          updatedAt TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS broker_profiles (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          host TEXT NOT NULL,
          port INTEGER NOT NULL,
          protocol TEXT NOT NULL,
          validateCertificate INTEGER NOT NULL DEFAULT 1,
          encryption INTEGER NOT NULL DEFAULT 0,
          username TEXT,
          password TEXT,
          clientId TEXT NOT NULL,
          clean INTEGER NOT NULL,
          keepAlive INTEGER NOT NULL,
          reconnectPeriod INTEGER NOT NULL,
          caCert TEXT,
          clientCert TEXT,
          clientKey TEXT,
          createdAt TEXT NOT NULL,
          updatedAt TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS requests (
          id TEXT PRIMARY KEY,
          collectionId TEXT NOT NULL,
          name TEXT NOT NULL,
          topic TEXT NOT NULL,
          payloadTemplate TEXT NOT NULL,
          qos INTEGER NOT NULL,
          retain INTEGER NOT NULL,
          brokerProfileId TEXT,
          environmentId TEXT,
          sortOrder INTEGER NOT NULL DEFAULT 0,
          createdAt TEXT NOT NULL,
          updatedAt TEXT NOT NULL,
          FOREIGN KEY(collectionId) REFERENCES collections(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS template_helpers (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL UNIQUE,
          kind TEXT NOT NULL,
          configJson TEXT NOT NULL,
          createdAt TEXT NOT NULL,
          updatedAt TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS consumer_sessions (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          brokerProfileId TEXT NOT NULL,
          topicsJson TEXT NOT NULL,
          qos INTEGER NOT NULL,
          active INTEGER NOT NULL,
          createdAt TEXT NOT NULL,
          updatedAt TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS message_logs (
          id TEXT PRIMARY KEY,
          direction TEXT NOT NULL,
          topic TEXT NOT NULL,
          payloadText TEXT NOT NULL,
          payloadJson TEXT,
          status TEXT NOT NULL,
          error TEXT,
          brokerProfileId TEXT,
          requestId TEXT,
          consumerSessionId TEXT,
          messageKey TEXT,
          createdAt TEXT NOT NULL
        );
      `);
      const brokerColumns = raw.prepare("PRAGMA table_info(broker_profiles)").all() as Array<{ name: string }>;
      if (!brokerColumns.some((column) => column.name === "validateCertificate")) {
        raw.exec("ALTER TABLE broker_profiles ADD COLUMN validateCertificate INTEGER NOT NULL DEFAULT 1");
      }
      if (!brokerColumns.some((column) => column.name === "encryption")) {
        raw.exec("ALTER TABLE broker_profiles ADD COLUMN encryption INTEGER NOT NULL DEFAULT 0");
      }
      const requestColumns = raw.prepare("PRAGMA table_info(requests)").all() as Array<{ name: string }>;
      if (!requestColumns.some((column) => column.name === "sortOrder")) {
        raw.exec("ALTER TABLE requests ADD COLUMN sortOrder INTEGER NOT NULL DEFAULT 0");
      }
      const collectionColumns = raw.prepare("PRAGMA table_info(collections)").all() as Array<{ name: string }>;
      if (!collectionColumns.some((column) => column.name === "sortOrder")) {
        raw.exec("ALTER TABLE collections ADD COLUMN sortOrder INTEGER NOT NULL DEFAULT 0");
      }
    },
  };
}

function rowToCollection(row: any): CollectionRow {
  return row;
}

function rowToRequest(row: any): RequestRow {
  return row;
}

function rowToEnvironment(row: any): EnvironmentRow {
  return row;
}

function rowToBroker(row: any): BrokerProfileRow {
  return row;
}

function rowToHelper(row: any): TemplateHelperRow {
  return row;
}

function rowToSession(row: any): ConsumerSessionRow {
  return row;
}

function rowToLog(row: any): MessageLogRow {
  return row;
}

export function listCollections(db: Database.Database) {
  return db.prepare("SELECT * FROM collections ORDER BY sortOrder ASC, createdAt DESC").all().map(rowToCollection);
}

export function upsertCollection(db: Database.Database, input: Partial<CollectionRow> & { name: string; description?: string | null; id?: string }) {
  const id = input.id ?? createId();
  const timestamp = nowIso();
  const existing = db.prepare("SELECT id FROM collections WHERE id = ?").get(id);
  if (existing) {
    db.prepare("UPDATE collections SET name = ?, description = ?, updatedAt = ? WHERE id = ?").run(
      input.name,
      input.description ?? null,
      timestamp,
      id,
    );
  } else {
    const nextSortOrder =
      input.sortOrder ??
      (db.prepare("SELECT COALESCE(MAX(sortOrder), -1) + 1 AS next FROM collections").get() as { next: number }).next;
    db.prepare("INSERT INTO collections (id, name, description, sortOrder, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)").run(
      id,
      input.name,
      input.description ?? null,
      nextSortOrder,
      timestamp,
      timestamp,
    );
  }
  return getCollection(db, id);
}

export function getCollection(db: Database.Database, id: string) {
  return db.prepare("SELECT * FROM collections WHERE id = ?").get(id) as CollectionRow | undefined;
}

export function deleteCollection(db: Database.Database, id: string) {
  db.prepare("DELETE FROM collections WHERE id = ?").run(id);
}

export function reorderCollections(db: Database.Database, collectionIds: string[]) {
  const collections = listCollections(db);
  const collectionIdSet = new Set(collections.map((collection) => collection.id));
  if (
    collectionIds.length !== collections.length ||
    collectionIds.some((collectionId) => !collectionIdSet.has(collectionId))
  ) {
    throw new Error("Collection order does not match the workspace.");
  }

  db.transaction(() => {
    const update = db.prepare(
      "UPDATE collections SET sortOrder = ?, updatedAt = ? WHERE id = ?",
    );
    collectionIds.forEach((collectionId, index) => {
      update.run(index, nowIso(), collectionId);
    });
  })();

  return listCollections(db);
}

export function duplicateCollection(db: Database.Database, id: string) {
  const source = getCollection(db, id);
  if (!source) return undefined;

  const duplicateId = createId();
  const duplicateName = `${source.name} Copy`;
  const requests = listRequests(db, id);
  const timestamp = nowIso();

  db.transaction(() => {
    db.prepare(
      `INSERT INTO collections (id, name, description, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?)`,
    ).run(
      duplicateId,
      duplicateName,
      source.description,
      timestamp,
      timestamp,
    );

    for (const request of requests) {
      upsertRequest(db, {
        collectionId: duplicateId,
        name: request.name,
        topic: request.topic,
        payloadTemplate: request.payloadTemplate,
        qos: request.qos,
        retain: request.retain,
        brokerProfileId: request.brokerProfileId,
        environmentId: request.environmentId,
        sortOrder: request.sortOrder,
      });
    }
  })();

  return {
    collection: getCollection(db, duplicateId),
    requests: listRequests(db, duplicateId),
  };
}

export function listRequests(db: Database.Database, collectionId?: string) {
  if (collectionId) {
    return db.prepare("SELECT * FROM requests WHERE collectionId = ? ORDER BY sortOrder ASC, createdAt DESC").all(collectionId).map(rowToRequest);
  }
  return db.prepare("SELECT * FROM requests ORDER BY sortOrder ASC, createdAt DESC").all().map(rowToRequest);
}

export function getRequest(db: Database.Database, id: string) {
  return db.prepare("SELECT * FROM requests WHERE id = ?").get(id) as RequestRow | undefined;
}

export function upsertRequest(
  db: Database.Database,
  input: {
    id?: string;
    collectionId: string;
    name: string;
    topic: string;
    payloadTemplate: string;
    qos?: number;
    retain?: boolean | number;
    brokerProfileId?: string | null;
    environmentId?: string | null;
    sortOrder?: number;
  },
) {
  const id = input.id ?? createId();
  const timestamp = nowIso();
  const retain = Number(Boolean(input.retain));
  const existing = db.prepare("SELECT id FROM requests WHERE id = ?").get(id);
  if (existing) {
    db.prepare(
      `UPDATE requests SET collectionId = ?, name = ?, topic = ?, payloadTemplate = ?, qos = ?, retain = ?, brokerProfileId = ?, environmentId = ?, updatedAt = ? WHERE id = ?`,
    ).run(
      input.collectionId,
      input.name,
      input.topic,
      input.payloadTemplate,
      input.qos ?? 0,
      retain,
      input.brokerProfileId ?? null,
      input.environmentId ?? null,
      timestamp,
      id,
    );
  } else {
    db.prepare(
      `INSERT INTO requests (id, collectionId, name, topic, payloadTemplate, qos, retain, brokerProfileId, environmentId, sortOrder, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      input.collectionId,
      input.name,
      input.topic,
      input.payloadTemplate,
      input.qos ?? 0,
      retain,
      input.brokerProfileId ?? null,
      input.environmentId ?? null,
      input.sortOrder ?? 0,
      timestamp,
      timestamp,
    );
  }
  return getRequest(db, id);
}

export function deleteRequest(db: Database.Database, id: string) {
  db.prepare("DELETE FROM requests WHERE id = ?").run(id);
}

export function reorderRequests(
  db: Database.Database,
  collectionId: string,
  requestIds: string[],
) {
  const requests = listRequests(db, collectionId);
  const requestIdSet = new Set(requests.map((request) => request.id));
  if (
    requestIds.length !== requests.length ||
    requestIds.some((requestId) => !requestIdSet.has(requestId))
  ) {
    throw new Error("Request order does not match the collection.");
  }

  db.transaction(() => {
    const update = db.prepare(
      "UPDATE requests SET sortOrder = ?, updatedAt = ? WHERE id = ? AND collectionId = ?",
    );
    requestIds.forEach((requestId, index) => {
      update.run(index, nowIso(), requestId, collectionId);
    });
  })();

  return listRequests(db, collectionId);
}

export function listEnvironments(db: Database.Database) {
  return db.prepare("SELECT * FROM environments ORDER BY createdAt DESC").all().map(rowToEnvironment);
}

export function getEnvironment(db: Database.Database, id: string) {
  return db.prepare("SELECT * FROM environments WHERE id = ?").get(id) as EnvironmentRow | undefined;
}

export function upsertEnvironment(db: Database.Database, input: Partial<EnvironmentRow> & { name: string; variablesJson?: string; id?: string }) {
  const id = input.id ?? createId();
  const timestamp = nowIso();
  const variablesJson = input.variablesJson ?? "{}";
  const existing = db.prepare("SELECT id FROM environments WHERE id = ?").get(id);
  if (existing) {
    db.prepare("UPDATE environments SET name = ?, variablesJson = ?, updatedAt = ? WHERE id = ?").run(
      input.name,
      variablesJson,
      timestamp,
      id,
    );
  } else {
    db.prepare("INSERT INTO environments (id, name, variablesJson, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?)").run(
      id,
      input.name,
      variablesJson,
      timestamp,
      timestamp,
    );
  }
  return getEnvironment(db, id);
}

export function deleteEnvironment(db: Database.Database, id: string) {
  db.prepare("DELETE FROM environments WHERE id = ?").run(id);
}

export function listBrokerProfiles(db: Database.Database) {
  return db.prepare("SELECT * FROM broker_profiles ORDER BY createdAt DESC").all().map(rowToBroker);
}

export function getBrokerProfile(db: Database.Database, id: string) {
  return db.prepare("SELECT * FROM broker_profiles WHERE id = ?").get(id) as BrokerProfileRow | undefined;
}

export function upsertBrokerProfile(
  db: Database.Database,
  input: {
    id?: string;
    name?: string;
    host: string;
    port: number;
    protocol?: string;
    validateCertificate?: boolean | number;
    encryption?: boolean | number;
    username?: string | null;
    password?: string | null;
    clientId?: string;
    clean?: boolean | number;
    keepAlive?: number;
    reconnectPeriod?: number;
    caCert?: string | null;
    clientCert?: string | null;
    clientKey?: string | null;
  },
) {
  const id = input.id ?? createId();
  const timestamp = nowIso();
  const existing = db.prepare("SELECT id FROM broker_profiles WHERE id = ?").get(id);
  const clean = Number(Boolean(input.clean ?? true));
  const validateCertificate = Number(Boolean(input.validateCertificate ?? true));
  const encryption = Number(Boolean(input.encryption ?? false));
  const name = input.name?.trim() || `${input.host}:${input.port}`;
  if (existing) {
    db.prepare(
      `UPDATE broker_profiles
       SET name = ?, host = ?, port = ?, protocol = ?, validateCertificate = ?, encryption = ?, username = ?, password = ?, clientId = ?, clean = ?, keepAlive = ?, reconnectPeriod = ?, caCert = ?, clientCert = ?, clientKey = ?, updatedAt = ?
       WHERE id = ?`,
    ).run(
      name,
      input.host,
      input.port,
      input.protocol ?? "mqtt",
      validateCertificate,
      encryption,
      input.username ?? null,
      input.password ?? null,
      input.clientId ?? `mqtt-postwoman-${id.slice(0, 8)}`,
      clean,
      input.keepAlive ?? 30,
      input.reconnectPeriod ?? 1000,
      input.caCert ?? null,
      input.clientCert ?? null,
      input.clientKey ?? null,
      timestamp,
      id,
    );
  } else {
    db.prepare(
      `INSERT INTO broker_profiles
       (id, name, host, port, protocol, validateCertificate, encryption, username, password, clientId, clean, keepAlive, reconnectPeriod, caCert, clientCert, clientKey, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      name,
      input.host,
      input.port,
      input.protocol ?? "mqtt",
      validateCertificate,
      encryption,
      input.username ?? null,
      input.password ?? null,
      input.clientId ?? `mqtt-postwoman-${id.slice(0, 8)}`,
      clean,
      input.keepAlive ?? 30,
      input.reconnectPeriod ?? 1000,
      input.caCert ?? null,
      input.clientCert ?? null,
      input.clientKey ?? null,
      timestamp,
      timestamp,
    );
  }
  return getBrokerProfile(db, id);
}

export function deleteBrokerProfile(db: Database.Database, id: string) {
  db.prepare("DELETE FROM broker_profiles WHERE id = ?").run(id);
}

export function listHelpers(db: Database.Database) {
  return db.prepare("SELECT * FROM template_helpers ORDER BY createdAt DESC").all().map(rowToHelper);
}

export function getHelper(db: Database.Database, id: string) {
  return db.prepare("SELECT * FROM template_helpers WHERE id = ?").get(id) as TemplateHelperRow | undefined;
}

export function upsertHelper(
  db: Database.Database,
  input: Partial<TemplateHelperRow> & { name: string; kind: HelperKind; configJson?: string; id?: string },
) {
  const id = input.id ?? createId();
  const timestamp = nowIso();
  const existing = db.prepare("SELECT id FROM template_helpers WHERE id = ?").get(id);
  const configJson = input.configJson ?? "{}";
  if (existing) {
    db.prepare("UPDATE template_helpers SET name = ?, kind = ?, configJson = ?, updatedAt = ? WHERE id = ?").run(
      input.name,
      input.kind,
      configJson,
      timestamp,
      id,
    );
  } else {
    db.prepare("INSERT INTO template_helpers (id, name, kind, configJson, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)").run(
      id,
      input.name,
      input.kind,
      configJson,
      timestamp,
      timestamp,
    );
  }
  return getHelper(db, id);
}

export function deleteHelper(db: Database.Database, id: string) {
  db.prepare("DELETE FROM template_helpers WHERE id = ?").run(id);
}

export function listConsumerSessions(db: Database.Database) {
  return db.prepare("SELECT * FROM consumer_sessions ORDER BY createdAt DESC").all().map(rowToSession);
}

export function getConsumerSession(db: Database.Database, id: string) {
  return db.prepare("SELECT * FROM consumer_sessions WHERE id = ?").get(id) as ConsumerSessionRow | undefined;
}

export function createConsumerSession(
  db: Database.Database,
  input: { name: string; brokerProfileId: string; topics: string[]; qos?: number; active?: boolean },
) {
  const id = createId();
  const timestamp = nowIso();
  db.prepare(
    "INSERT INTO consumer_sessions (id, name, brokerProfileId, topicsJson, qos, active, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
  ).run(
    id,
    input.name,
    input.brokerProfileId,
    JSON.stringify(input.topics),
    input.qos ?? 0,
    Number(Boolean(input.active ?? true)),
    timestamp,
    timestamp,
  );
  return getConsumerSession(db, id);
}

export function updateConsumerSession(
  db: Database.Database,
  id: string,
  input: Partial<{ name: string; topics: string[]; qos: number; active: boolean }>,
) {
  const current = getConsumerSession(db, id);
  if (!current) return undefined;
  const timestamp = nowIso();
  const topics = input.topics ?? JSON.parse(current.topicsJson) as string[];
  db.prepare(
    "UPDATE consumer_sessions SET name = ?, topicsJson = ?, qos = ?, active = ?, updatedAt = ? WHERE id = ?",
  ).run(
    input.name ?? current.name,
    JSON.stringify(topics),
    input.qos ?? current.qos,
    Number(Boolean(input.active ?? current.active)),
    timestamp,
    id,
  );
  return getConsumerSession(db, id);
}

export function deleteConsumerSession(db: Database.Database, id: string) {
  db.prepare("DELETE FROM consumer_sessions WHERE id = ?").run(id);
}

export function listLogs(db: Database.Database, limit = 200) {
  return db
    .prepare("SELECT * FROM message_logs ORDER BY createdAt DESC LIMIT ?")
    .all(limit)
    .map(rowToLog);
}

export function clearLogs(db: Database.Database) {
  db.prepare("DELETE FROM message_logs").run();
}

export function addLog(
  db: Database.Database,
  input: Omit<MessageLogRow, "id" | "createdAt"> & { id?: string; createdAt?: string },
) {
  const id = input.id ?? createId();
  const createdAt = input.createdAt ?? nowIso();
  db.prepare(
    `INSERT INTO message_logs
     (id, direction, topic, payloadText, payloadJson, status, error, brokerProfileId, requestId, consumerSessionId, messageKey, createdAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    input.direction,
    input.topic,
    input.payloadText,
    input.payloadJson ?? null,
    input.status,
    input.error ?? null,
    input.brokerProfileId ?? null,
    input.requestId ?? null,
    input.consumerSessionId ?? null,
    input.messageKey ?? null,
    createdAt,
  );
  return db.prepare("SELECT * FROM message_logs WHERE id = ?").get(id) as MessageLogRow;
}

export function bootstrapState(db: Database.Database) {
  return {
    collections: listCollections(db),
    requests: listRequests(db),
    environments: listEnvironments(db),
    brokers: listBrokerProfiles(db),
    helpers: listHelpers(db),
    consumerSessions: listConsumerSessions(db),
    logs: listLogs(db),
  };
}
