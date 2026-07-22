import { Router, Request, Response } from "express";
import { z } from "zod";
import {
  addLog,
  bootstrapState,
  clearLogs,
  createConsumerSession,
  deleteBrokerProfile,
  deleteCollection,
  deleteConsumerSession,
  deleteEnvironment,
  deleteHelper,
  deleteRequest,
  getBrokerProfile,
  getCollection,
  getConsumerSession,
  getEnvironment,
  getHelper,
  getRequest,
  listBrokerProfiles,
  listCollections,
  listConsumerSessions,
  listEnvironments,
  listHelpers,
  listLogs,
  listRequests,
  openDatabase,
  upsertBrokerProfile,
  upsertCollection,
  upsertEnvironment,
  upsertHelper,
  upsertRequest,
} from "./db";
import { RuntimeManager } from "./runtime";
import { resolveTemplatePayload } from "./template";
import { createId, nowIso, parseObjectLike, safeJsonParse } from "./utils";

export function buildRouter(db = openDatabase(), runtime: RuntimeManager) {
  const router = Router();

  const collectionSchema = z.object({
    id: z.string().optional(),
    name: z.string().min(1),
    description: z.string().optional().nullable(),
  });

  const requestSchema = z.object({
    id: z.string().optional(),
    collectionId: z.string().min(1),
    name: z.string().min(1),
    topic: z.string().default(""),
    payloadTemplate: z.string().default("{}"),
    qos: z.number().int().min(0).max(2).default(0),
    retain: z.boolean().default(false),
    brokerProfileId: z.string().optional().nullable(),
    environmentId: z.string().optional().nullable(),
  });

  const environmentSchema = z.object({
    id: z.string().optional(),
    name: z.string().min(1),
    variablesJson: z.string().default("{}"),
  });

  const brokerSchema = z.object({
    id: z.string().optional(),
    name: z.string().min(1),
    host: z.string().min(1),
    port: z.number().int().min(1).max(65535),
    protocol: z.string().default("mqtt"),
    username: z.string().optional().nullable(),
    password: z.string().optional().nullable(),
    clientId: z.string().optional(),
    clean: z.boolean().default(true),
    keepAlive: z.number().int().min(1).max(3600).default(30),
    reconnectPeriod: z.number().int().min(250).max(60000).default(1000),
    caCert: z.string().optional().nullable(),
    clientCert: z.string().optional().nullable(),
    clientKey: z.string().optional().nullable(),
  });

  const helperSchema = z.object({
    id: z.string().optional(),
    name: z.string().min(1),
    kind: z.enum(["literal", "now", "uuid", "randomInt", "env"]),
    configJson: z.string().default("{}"),
  });

  router.get("/health", (_req, res) => {
    res.json({ ok: true, now: nowIso() });
  });

  router.get("/bootstrap", (_req, res) => {
    res.json(bootstrapState(db.raw));
  });

  router.get("/collections", (_req, res) => res.json(listCollections(db.raw)));
  router.post("/collections", (req, res) => {
    const input = collectionSchema.parse(req.body);
    const saved = upsertCollection(db.raw, input);
    res.status(201).json(saved);
  });
  router.put("/collections/:id", (req, res) => {
    const input = collectionSchema.parse({ ...req.body, id: req.params.id });
    const saved = upsertCollection(db.raw, input);
    res.json(saved);
  });
  router.delete("/collections/:id", (req, res) => {
    deleteCollection(db.raw, req.params.id);
    res.status(204).end();
  });

  router.get("/requests", (req, res) => {
    const collectionId = typeof req.query.collectionId === "string" ? req.query.collectionId : undefined;
    res.json(listRequests(db.raw, collectionId));
  });
  router.post("/requests", (req, res) => {
    const input = requestSchema.parse(req.body);
    const saved = upsertRequest(db.raw, input);
    res.status(201).json(saved);
  });
  router.put("/requests/:id", (req, res) => {
    const input = requestSchema.parse({ ...req.body, id: req.params.id });
    const saved = upsertRequest(db.raw, input);
    res.json(saved);
  });
  router.delete("/requests/:id", (req, res) => {
    deleteRequest(db.raw, req.params.id);
    res.status(204).end();
  });

  router.get("/environments", (_req, res) => res.json(listEnvironments(db.raw)));
  router.post("/environments", (req, res) => {
    const input = environmentSchema.parse(req.body);
    const saved = upsertEnvironment(db.raw, input);
    res.status(201).json(saved);
  });
  router.put("/environments/:id", (req, res) => {
    const input = environmentSchema.parse({ ...req.body, id: req.params.id });
    const saved = upsertEnvironment(db.raw, input);
    res.json(saved);
  });
  router.delete("/environments/:id", (req, res) => {
    deleteEnvironment(db.raw, req.params.id);
    res.status(204).end();
  });

  router.get("/brokers", (_req, res) => res.json(listBrokerProfiles(db.raw)));
  router.get("/brokers/status", (_req, res) => res.json(runtime.listBrokerStatuses()));
  router.post("/brokers", (req, res) => {
    const input = brokerSchema.parse(req.body);
    const saved = upsertBrokerProfile(db.raw, input);
    res.status(201).json(saved);
  });
  router.put("/brokers/:id", (req, res) => {
    const input = brokerSchema.parse({ ...req.body, id: req.params.id });
    const saved = upsertBrokerProfile(db.raw, input);
    res.json(saved);
  });
  router.delete("/brokers/:id", (req, res) => {
    deleteBrokerProfile(db.raw, req.params.id);
    res.status(204).end();
  });
  router.post("/brokers/:id/connect", async (req, res) => {
    try {
      const status = await runtime.connectBroker(req.params.id);
      res.json(status);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to connect";
      res.status(400).json({ message });
    }
  });
  router.post("/brokers/:id/test", async (req, res) => {
    try {
      const result = await runtime.testBrokerConnection(req.params.id);
      res.json(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to test connection";
      res.status(400).json({ message });
    }
  });
  router.post("/brokers/test", async (req, res) => {
    const schema = z.object({
      name: z.string().optional(),
      host: z.string().min(1),
      port: z.number().int().min(1).max(65535),
      protocol: z.string().default("mqtt"),
      username: z.string().optional().nullable(),
      password: z.string().optional().nullable(),
      clientId: z.string().optional(),
      clean: z.boolean().optional(),
      keepAlive: z.number().int().min(1).max(3600).optional(),
      reconnectPeriod: z.number().int().min(250).max(60000).optional(),
      caCert: z.string().optional().nullable(),
      clientCert: z.string().optional().nullable(),
      clientKey: z.string().optional().nullable(),
    });
    try {
      const input = schema.parse(req.body);
      const result = await runtime.testBrokerConfig(input);
      res.json(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to test connection";
      res.status(400).json({ message });
    }
  });
  router.post("/brokers/:id/disconnect", (req, res) => {
    runtime.disconnectBroker(req.params.id);
    res.status(204).end();
  });

  router.get("/helpers", (_req, res) => res.json(listHelpers(db.raw)));
  router.post("/helpers", (req, res) => {
    const input = helperSchema.parse(req.body);
    const saved = upsertHelper(db.raw, input);
    res.status(201).json(saved);
  });
  router.put("/helpers/:id", (req, res) => {
    const input = helperSchema.parse({ ...req.body, id: req.params.id });
    const saved = upsertHelper(db.raw, input);
    res.json(saved);
  });
  router.delete("/helpers/:id", (req, res) => {
    deleteHelper(db.raw, req.params.id);
    res.status(204).end();
  });

  router.get("/consumer-sessions", (_req, res) => {
    res.json(listConsumerSessions(db.raw));
  });

  router.post("/consumer-sessions", async (req, res) => {
    const schema = z.object({
      name: z.string().min(1),
      brokerProfileId: z.string().min(1),
      topics: z.array(z.string().min(1)).min(1),
      qos: z.number().int().min(0).max(2).default(0),
    });
    const input = schema.parse(req.body);
    try {
      const saved = await runtime.startConsumer({ ...input, qos: input.qos as 0 | 1 | 2 });
      res.status(201).json(saved);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to subscribe";
      res.status(400).json({ message });
    }
  });

  router.delete("/consumer-sessions/:id", async (req, res) => {
    const stopped = await runtime.stopConsumer(req.params.id);
    if (!stopped) {
      res.status(404).json({ message: "Consumer session not found" });
      return;
    }
    deleteConsumerSession(db.raw, req.params.id);
    res.status(204).end();
  });

  const publishSchema = z.object({
    requestId: z.string().optional(),
    brokerProfileId: z.string().optional(),
    topic: z.string().optional(),
    payloadTemplate: z.string().optional(),
    qos: z.number().int().min(0).max(2).default(0),
    retain: z.boolean().default(false),
    environmentId: z.string().optional().nullable(),
    variables: z.record(z.string(), z.any()).default({}),
  });

  router.post("/publish", async (req, res) => {
    const input = publishSchema.parse(req.body);
    let request;
    if (input.requestId) {
      request = getRequest(db.raw, input.requestId);
      if (!request) {
        res.status(404).json({ message: "Request not found" });
        return;
      }
    }

    const brokerProfileId = input.brokerProfileId ?? request?.brokerProfileId ?? null;
    if (!brokerProfileId) {
      res.status(400).json({ message: "Broker profile is required" });
      return;
    }

    const payloadTemplate = input.payloadTemplate ?? request?.payloadTemplate ?? "{}";
    const topic = input.topic ?? request?.topic ?? "";
    if (!topic) {
      res.status(400).json({ message: "Topic is required" });
      return;
    }

    const payload = resolveTemplatePayload(
      db,
      payloadTemplate,
      input.environmentId ?? request?.environmentId ?? null,
      parseObjectLike(input.variables),
      0,
    );

    const result = await runtime.publish(
      brokerProfileId,
      topic,
      payload,
      {
      qos: (input.qos ?? request?.qos ?? 0) as 0 | 1 | 2,
        retain: input.retain ?? Boolean(request?.retain),
      },
      input.requestId ?? request?.id ?? null,
      parseObjectLike(input.variables),
    );

    res.json(result);
  });

  router.post("/publish/batch", async (req, res) => {
    const schema = z.object({
      requestId: z.string().optional(),
      brokerProfileId: z.string().optional(),
      topic: z.string().optional(),
      payloadTemplate: z.string().optional(),
      environmentId: z.string().optional().nullable(),
      variables: z.record(z.string(), z.any()).default({}),
      count: z.number().int().min(1).max(1000).default(10),
      delayMs: z.number().int().min(0).max(60000).default(0),
      qos: z.number().int().min(0).max(2).default(0),
      retain: z.boolean().default(false),
      items: z.array(z.object({ topic: z.string().optional(), payloadTemplate: z.string().optional(), variables: z.record(z.string(), z.any()).optional() })).optional(),
    });
    const input = schema.parse(req.body);
    const request = input.requestId ? getRequest(db.raw, input.requestId) : undefined;
    if (input.requestId && !request) {
      res.status(404).json({ message: "Request not found" });
      return;
    }
    const brokerProfileId = input.brokerProfileId ?? request?.brokerProfileId ?? null;
    if (!brokerProfileId) {
      res.status(400).json({ message: "Broker profile is required" });
      return;
    }

    const items =
      input.items?.length
        ? input.items.map((item, index) => ({
            topic: item.topic ?? input.topic ?? request?.topic ?? "",
            payloadTemplate: item.payloadTemplate ?? input.payloadTemplate ?? request?.payloadTemplate ?? "{}",
            variables: parseObjectLike(item.variables ?? input.variables),
            index,
          }))
        : Array.from({ length: input.count }, (_, index) => ({
            topic: input.topic ?? request?.topic ?? "",
            payloadTemplate: input.payloadTemplate ?? request?.payloadTemplate ?? "{}",
            variables: parseObjectLike(input.variables),
            index,
          }));

    const results = [];
    for (const item of items) {
      if (!item.topic) {
        res.status(400).json({ message: "Topic is required" });
        return;
      }
      const payload = resolveTemplatePayload(
        db,
        item.payloadTemplate,
        input.environmentId ?? request?.environmentId ?? null,
        item.variables,
        item.index,
      );
      const result = await runtime.publish(
        brokerProfileId,
        item.topic,
        payload,
        {
          qos: (input.qos ?? request?.qos ?? 0) as 0 | 1 | 2,
          retain: input.retain ?? Boolean(request?.retain),
        },
        input.requestId ?? request?.id ?? null,
        item.variables,
      );
      results.push(result);
      if (input.delayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, input.delayMs));
      }
    }

    res.json({ count: results.length, results });
  });

  router.get("/logs", (req, res) => {
    const limit = Math.min(Number(req.query.limit ?? 200), 1000);
    res.json(listLogs(db.raw, Number.isNaN(limit) ? 200 : limit));
  });
  router.delete("/logs", (_req, res) => {
    clearLogs(db.raw);
    res.status(204).end();
  });

  router.post("/templates/resolve", (req, res) => {
    const schema = z.object({
      template: z.string(),
      environmentId: z.string().optional().nullable(),
      variables: z.record(z.string(), z.any()).default({}),
    });
    const input = schema.parse(req.body);
    const resolved = resolveTemplatePayload(db, input.template, input.environmentId ?? null, parseObjectLike(input.variables));
    res.json(resolved);
  });

  router.get("/catalog", (_req, res) => {
    res.json({
      collections: listCollections(db.raw),
      requests: listRequests(db.raw),
      environments: listEnvironments(db.raw),
      brokers: listBrokerProfiles(db.raw),
      helpers: listHelpers(db.raw),
      consumerSessions: listConsumerSessions(db.raw),
    });
  });

  router.use((error: unknown, _req: Request, res: Response, _next) => {
    if (error instanceof z.ZodError) {
      res.status(400).json({ message: "Validation failed", issues: error.issues });
      return;
    }
    const message = error instanceof Error ? error.message : "Unknown error";
    res.status(500).json({ message });
  });

  return router;
}
