import { Router } from "express";
import { z } from "zod";
import { AppDatabase } from "../db";
import { AppRepositories } from "../repositories";
import { RuntimeManager } from "../runtime";
import { AppServices, schemas } from "../services/app-services";
import { listBuiltinFunctions } from "../template/functions";
import { asyncHandler } from "../middleware/async-handler";
import { createControllers } from "../controllers";

const asyncRoute = asyncHandler as any;

export function buildMvcRouter(dataSource: any, legacyDb: AppDatabase, runtime: RuntimeManager) {
  const router = Router();
  const services = new AppServices(new AppRepositories(dataSource), legacyDb, runtime);
  const controllers = createControllers(services);

  router.get("/collections", asyncRoute(async (_req: any, res: any) => res.json(await controllers.collections.list())));
  router.post("/collections", asyncRoute(async (req: any, res: any) => res.status(201).json(await controllers.collections.save(schemas.collection.parse(req.body)))));
  router.put("/collections/order", asyncRoute(async (req: any, res: any) => res.json(await controllers.collections.reorder(z.object({ collectionIds: z.array(z.string()) }).parse(req.body).collectionIds))));
  router.put("/collections/:id", asyncRoute(async (req: any, res: any) => {
    const input = schemas.collection.parse({ ...req.body, id: req.params.id });
    return res.json(await controllers.collections.save(input));
  }));
  router.delete("/collections/:id", asyncRoute(async (req: any, res: any) => { await controllers.collections.remove(req.params.id); res.status(204).end(); }));
  router.post("/collections/:id/duplicate", asyncRoute(async (req: any, res: any) => { const result = await controllers.collections.duplicate(req.params.id); if (!result) return res.status(404).json({ message: "Collection not found" }); return res.status(201).json(result); }));

  router.get("/requests", asyncRoute(async (req: any, res: any) => res.json(await services.requests.list(typeof req.query.collectionId === "string" ? req.query.collectionId : undefined))));
  router.post("/requests", asyncRoute(async (req: any, res: any) => res.status(201).json(await services.requests.save(schemas.request.parse(req.body)))));
  router.put("/requests/:id", asyncRoute(async (req: any, res: any) => res.json(await services.requests.save(schemas.request.parse({ ...req.body, id: req.params.id })) )));
  router.delete("/requests/:id", asyncRoute(async (req: any, res: any) => { await services.requests.delete(req.params.id); res.status(204).end(); }));
  router.put("/collections/:id/requests/order", asyncRoute(async (req: any, res: any) => { const input = z.object({ requestIds: z.array(z.string()) }).parse(req.body); res.json(await services.requests.reorder(req.params.id, input.requestIds)); }));

  router.get("/variable-collections", asyncRoute(async (_req: any, res: any) => res.json(await services.variables.collections())));
  router.post("/variable-collections", asyncRoute(async (req: any, res: any) => res.status(201).json(await services.variables.saveCollection(schemas.variableCollection.parse(req.body)))));
  router.put("/variable-collections/:id", asyncRoute(async (req: any, res: any) => res.json(await services.variables.saveCollection(schemas.variableCollection.parse({ ...req.body, id: req.params.id })))));
  router.delete("/variable-collections/:id", asyncRoute(async (req: any, res: any) => { await services.variables.deleteCollection(req.params.id); res.status(204).end(); }));
  router.get("/variable-collections/:id/variables", asyncRoute(async (req: any, res: any) => res.json(await services.variables.list(req.params.id))));
  router.post("/variable-collections/:id/variables", asyncRoute(async (req: any, res: any) => res.status(201).json(await services.variables.save(schemas.variable.parse({ ...req.body, variableCollectionId: req.params.id })) )));
  router.put("/variable-collections/:id/variables/order", asyncRoute(async (req: any, res: any) => { const input = z.object({ variableIds: z.array(z.string()) }).parse(req.body); res.json(await services.variables.reorder(req.params.id, input.variableIds)); }));
  router.put("/variables/:id", asyncRoute(async (req: any, res: any) => { const current = await services.variables.get(req.params.id); if (!current) return res.status(404).json({ message: "Variable not found" }); return res.json(await services.variables.save(schemas.variable.parse({ ...current, ...req.body, id: req.params.id }))); }));
  router.delete("/variables/:id", asyncRoute(async (req: any, res: any) => { await services.variables.delete(req.params.id); res.status(204).end(); }));

  router.get("/brokers", asyncRoute(async (_req: any, res: any) => res.json(await services.brokers.list())));
  router.get("/brokers/status", (_req, res) => res.json(runtime.listBrokerStatuses()));
  router.post("/brokers", asyncRoute(async (req: any, res: any) => res.status(201).json(await services.brokers.save(schemas.broker.parse(req.body)))));
  router.put("/brokers/:id", asyncRoute(async (req: any, res: any) => res.json(await services.brokers.save(schemas.broker.parse({ ...req.body, id: req.params.id })))));
  router.delete("/brokers/:id", asyncRoute(async (req: any, res: any) => { await services.brokers.delete(req.params.id); res.status(204).end(); }));
  router.post("/brokers/:id/connect", asyncRoute(async (req: any, res: any) => res.json(await runtime.connectBroker(req.params.id))));
  router.post("/brokers/:id/test", asyncRoute(async (req: any, res: any) => res.json(await runtime.testBrokerConnection(req.params.id))));
  router.post("/brokers/test", asyncRoute(async (req: any, res: any) => res.json(await runtime.testBrokerConfig(schemas.broker.omit({ id: true, name: true }).parse(req.body)))));
  router.post("/brokers/:id/disconnect", asyncRoute(async (req: any, res: any) => { runtime.disconnectBroker(req.params.id); res.status(204).end(); }));

  router.get("/helpers", asyncRoute(async (_req: any, res: any) => res.json(await services.helpers.list())));
  router.post("/helpers", asyncRoute(async (req: any, res: any) => res.status(201).json(await services.helpers.save(req.body))));
  router.put("/helpers/:id", asyncRoute(async (req: any, res: any) => res.json(await services.helpers.save({ ...req.body, id: req.params.id }))));
  router.delete("/helpers/:id", asyncRoute(async (req: any, res: any) => { await services.helpers.delete(req.params.id); res.status(204).end(); }));

  router.get("/consumer-sessions", asyncRoute(async (_req: any, res: any) => res.json(await new AppRepositories(dataSource).listSessions())));
  router.post("/consumer-sessions", asyncRoute(async (req: any, res: any) => res.status(201).json(await runtime.startConsumer(req.body))));
  router.delete("/consumer-sessions/:id", asyncRoute(async (req: any, res: any) => { const result = await runtime.stopConsumer(req.params.id); if (!result) return res.status(404).json({ message: "Consumer session not found" }); await new AppRepositories(dataSource).deleteSession(req.params.id); return res.status(204).end(); }));
  router.delete("/consumer-sessions/:id/topics", asyncRoute(async (req: any, res: any) => { const result = await runtime.unsubscribeConsumerTopic(req.params.id, z.object({ topic: z.string().min(1) }).parse(req.body).topic); if (!result) return res.status(404).json({ message: "Consumer session not found" }); if (!JSON.parse(result.topicsJson).length) { await new AppRepositories(dataSource).deleteSession(req.params.id); return res.status(204).end(); } return res.json(result); }));

  router.get("/logs", asyncRoute(async (req: any, res: any) => { const limit = Math.min(Number(req.query.limit ?? 200), 1000); res.json(await services.logs.list(Number.isNaN(limit) ? 200 : limit)); }));
  router.delete("/logs", asyncRoute(async (_req: any, res: any) => { await services.logs.clear(); res.status(204).end(); }));

  router.post("/publish", asyncRoute(async (req: any, res: any) => res.json(await services.publish(req.body))));
  router.post("/publish/batch", asyncRoute(async (req: any, res: any) => res.json(await services.batchPublish(req.body))));
  router.post("/templates/resolve", asyncRoute(async (req: any, res: any) => { const input = z.object({ template: z.string(), variableCollectionId: z.string().nullable().optional(), variables: z.record(z.string(), z.any()).default({}) }).parse(req.body); res.json(await services.resolve(input.template, input.variableCollectionId, input.variables)); }));
  router.get("/templates/functions", (_req, res) => res.json(listBuiltinFunctions()));
  router.get("/catalog", asyncRoute(async (_req: any, res: any) => res.json(await new AppRepositories(dataSource).bootstrap())));

  return router;
}
