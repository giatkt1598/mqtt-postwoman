import { z } from "zod";
import { AppDatabase } from "../db";
import { AppRepositories } from "../repositories";
import { RuntimeManager } from "../runtime";
import { resolveTemplatePayload } from "../template";
import { parseObjectLike } from "../utils";

export class AppServices {
  constructor(private readonly repos: AppRepositories, private readonly legacyDb: AppDatabase, private readonly runtime: RuntimeManager) {}

  collections = { list: () => this.repos.listCollections(), save: (input: any) => this.repos.saveCollection(input), delete: (id: string) => this.repos.deleteCollection(id), reorder: (ids: string[]) => this.repos.reorderCollections(ids), duplicate: (id: string) => this.repos.duplicateCollection(id) };
  requests = { list: (collectionId?: string) => this.repos.listRequests(collectionId), get: (id: string) => this.repos.getRequest(id), save: (input: any) => this.repos.saveRequest(input), delete: (id: string) => this.repos.deleteRequest(id), reorder: (collectionId: string, ids: string[]) => this.repos.reorderRequests(collectionId, ids) };
  variables = { collections: () => this.repos.listVariableCollections(), collection: (id: string) => this.repos.getVariableCollection(id), saveCollection: (input: any) => this.repos.saveVariableCollection(input), deleteCollection: (id: string) => this.repos.deleteVariableCollection(id), list: (id?: string) => this.repos.listVariables(id), get: (id: string) => this.repos.getVariable(id), save: (input: any) => this.repos.saveVariable(input), delete: (id: string) => this.repos.deleteVariable(id), reorder: (id: string, ids: string[]) => this.repos.reorderVariables(id, ids) };
  brokers = { list: () => this.repos.listBrokers(), get: (id: string) => this.repos.getBroker(id), save: (input: any) => this.repos.saveBroker(input), delete: (id: string) => this.repos.deleteBroker(id) };
  helpers = { list: () => this.repos.listHelpers(), save: (input: any) => this.repos.saveHelper(input), delete: (id: string) => this.repos.deleteHelper(id) };
  logs = { list: (limit?: number) => this.repos.listLogs(limit), clear: () => this.repos.clearLogs() };

  async resolve(template: string, variableCollectionId: string | null | undefined, variables: Record<string, unknown>, sequenceOffset = 0) {
    const values = variableCollectionId ? Object.fromEntries((await this.repos.listVariables(variableCollectionId)).map((item) => [item.name, item.value])) : {};
    return resolveTemplatePayload(this.legacyDb, template, null, { ...values, ...parseObjectLike(variables) }, sequenceOffset);
  }

  async publish(input: { requestId?: string; brokerProfileId?: string; topic?: string; payloadTemplate?: string; qos?: number; retain?: boolean; variableCollectionId?: string | null; variables?: Record<string, unknown>; _sequenceOffset?: number }) {
    const request = input.requestId ? await this.repos.getRequest(input.requestId) : undefined;
    if (input.requestId && !request) throw new Error("Request not found");
    const collection = request ? await this.repos.getCollection(request.collectionId) : undefined;
    const brokerProfileId = input.brokerProfileId ?? request?.brokerProfileId ?? null;
    if (!brokerProfileId) throw new Error("Broker profile is required");
    const variableCollectionId = input.variableCollectionId ?? collection?.variableCollectionId ?? null;
    const topic = input.topic ?? request?.topic ?? "";
    if (!topic) throw new Error("Topic is required");
    const variables = parseObjectLike(input.variables);
    const resolvedTopic = await this.resolve(topic, variableCollectionId, variables, input._sequenceOffset ?? 0);
    if (!resolvedTopic.text.trim()) throw new Error("Topic is required");
    const payload = await this.resolve(input.payloadTemplate ?? request?.payloadTemplate ?? "{}", variableCollectionId, variables, input._sequenceOffset ?? 0);
    return this.runtime.publish(brokerProfileId, resolvedTopic.text, payload, { qos: input.qos ?? request?.qos ?? 0, retain: input.retain ?? Boolean(request?.retain) }, input.requestId ?? request?.id ?? null, variables);
  }

  async batchPublish(input: any) {
    const count = input.count ?? 10;
    const items = input.items?.length ? input.items : Array.from({ length: count }, () => ({}));
    const results = [];
    for (const [index, item] of items.entries()) {
      results.push(await this.publish({ ...input, topic: item.topic ?? input.topic, payloadTemplate: item.payloadTemplate ?? input.payloadTemplate, variables: item.variables ?? input.variables, requestId: input.requestId, _sequenceOffset: index }));
      if (input.delayMs > 0) await new Promise((resolve) => setTimeout(resolve, input.delayMs));
    }
    return { count: results.length, results };
  }
}

export const schemas = {
  collection: z.object({ id: z.string().optional(), name: z.string().min(1), description: z.string().optional().nullable(), variableCollectionId: z.string().optional().nullable() }),
  request: z.object({ id: z.string().optional(), collectionId: z.string().min(1), name: z.string().min(1), topic: z.string().default(""), payloadTemplate: z.string().default("{}"), qos: z.number().int().min(0).max(2).default(0), retain: z.boolean().default(false), brokerProfileId: z.string().optional().nullable() }),
  variableCollection: z.object({ id: z.string().optional(), name: z.string().trim().min(1) }),
  variable: z.object({ id: z.string().optional(), variableCollectionId: z.string().min(1), name: z.string().trim().min(1), value: z.string().default(""), sortOrder: z.number().int().nonnegative().optional() }),
  broker: z.object({ id: z.string().optional(), name: z.string().min(1), host: z.string().min(1), port: z.number().int().min(1).max(65535), protocol: z.enum(["mqtt", "ws", "mqtts", "wss"]).default("mqtt"), validateCertificate: z.boolean().default(true), encryption: z.boolean().default(false), username: z.string().optional().nullable(), password: z.string().optional().nullable(), clientId: z.string().optional(), clean: z.boolean().default(true), keepAlive: z.number().int().min(1).max(3600).default(30), reconnectPeriod: z.number().int().min(250).max(60000).default(1000), caCert: z.string().optional().nullable(), clientCert: z.string().optional().nullable(), clientKey: z.string().optional().nullable() }),
};
