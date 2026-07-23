import { DataSource, EntityManager, Repository } from "typeorm";
import { createId, nowIso } from "../utils";
import { BrokerProfileEntity, CollectionEntity, ConsumerSessionEntity, MessageLogEntity, RequestEntity, TemplateHelperEntity, VariableCollectionEntity, VariableEntity } from "../database/entities";
import { BrokerProfileRow, CollectionRow, ConsumerSessionRow, MessageLogRow, RequestRow, TemplateHelperRow, VariableCollectionRow, VariableRow } from "../types";

type Store = EntityManager | DataSource;

export class AppRepositories {
  constructor(private readonly source: Store) {}

  private repository<T>(entity: object): Repository<T> {
    return this.source.getRepository(entity as never) as Repository<T>;
  }

  collections() { return this.repository<CollectionRow>(CollectionEntity); }
  requests() { return this.repository<RequestRow>(RequestEntity); }
  variables() { return this.repository<VariableRow>(VariableEntity); }
  variableCollections() { return this.repository<VariableCollectionRow>(VariableCollectionEntity); }
  brokers() { return this.repository<BrokerProfileRow>(BrokerProfileEntity); }
  helpers() { return this.repository<TemplateHelperRow>(TemplateHelperEntity); }
  sessions() { return this.repository<ConsumerSessionRow>(ConsumerSessionEntity); }
  logs() { return this.repository<MessageLogRow>(MessageLogEntity); }

  async listCollections() { return this.collections().find({ order: { sortOrder: "ASC", createdAt: "DESC" } }); }
  async getCollection(id: string) { return this.collections().findOneBy({ id }); }
  async saveCollection(input: Partial<CollectionRow> & { name: string; id?: string }) {
    const repo = this.collections(); const current = input.id ? await this.getCollection(input.id) : undefined; const timestamp = nowIso();
    const entity = repo.create({ id: input.id ?? createId(), name: input.name, description: input.description ?? null, variableCollectionId: input.variableCollectionId !== undefined ? input.variableCollectionId : current?.variableCollectionId ?? null, sortOrder: input.sortOrder ?? current?.sortOrder ?? (await repo.count()), createdAt: current?.createdAt ?? timestamp, updatedAt: timestamp });
    return repo.save(entity);
  }
  async deleteCollection(id: string) { await this.collections().delete(id); }
  async reorderCollections(ids: string[]) { return this.source.transaction(async (manager) => { const repo = new AppRepositories(manager); const current = await repo.listCollections(); if (ids.length !== current.length || ids.some((id) => !current.some((item) => item.id === id))) throw new Error("Collection order does not match the workspace."); for (const [index, id] of ids.entries()) await repo.collections().update(id, { sortOrder: index, updatedAt: nowIso() }); return repo.listCollections(); }); }
  async duplicateCollection(id: string) { return this.source.transaction(async (manager) => { const repo = new AppRepositories(manager); const source = await repo.getCollection(id); if (!source) return undefined; const duplicate = await repo.saveCollection({ name: `${source.name} Copy`, description: source.description, variableCollectionId: source.variableCollectionId, sortOrder: source.sortOrder + 1 }); const requests = await repo.listRequests(id); for (const request of requests) await repo.saveRequest({ collectionId: duplicate.id, name: request.name, topic: request.topic, payloadTemplate: request.payloadTemplate, qos: request.qos, retain: request.retain, brokerProfileId: request.brokerProfileId, sortOrder: request.sortOrder }); return { collection: duplicate, requests: await repo.listRequests(duplicate.id) }; }); }

  async listRequests(collectionId?: string) { return this.requests().find({ where: collectionId ? { collectionId } : undefined, order: { sortOrder: "ASC", createdAt: "DESC" } }); }
  async getRequest(id: string) { return this.requests().findOneBy({ id }); }
  async saveRequest(input: Partial<RequestRow> & { collectionId: string; name: string; topic: string; payloadTemplate: string }) { const repo = this.requests(); const current = input.id ? await this.getRequest(input.id) : undefined; const timestamp = nowIso(); return repo.save(repo.create({ id: input.id ?? createId(), collectionId: input.collectionId, name: input.name, topic: input.topic, payloadTemplate: input.payloadTemplate, qos: input.qos ?? current?.qos ?? 0, retain: Number(Boolean(input.retain ?? current?.retain)), brokerProfileId: input.brokerProfileId !== undefined ? input.brokerProfileId : current?.brokerProfileId ?? null, sortOrder: input.sortOrder ?? current?.sortOrder ?? 0, createdAt: current?.createdAt ?? timestamp, updatedAt: timestamp })); }
  async deleteRequest(id: string) { await this.requests().delete(id); }
  async reorderRequests(collectionId: string, ids: string[]) { return this.source.transaction(async (manager) => { const repo = new AppRepositories(manager); const current = await repo.listRequests(collectionId); if (ids.length !== current.length || ids.some((id) => !current.some((item) => item.id === id))) throw new Error("Request order does not match the collection."); for (const [index, id] of ids.entries()) await repo.requests().update({ id, collectionId }, { sortOrder: index, updatedAt: nowIso() }); return repo.listRequests(collectionId); }); }

  async listVariableCollections() { return this.variableCollections().find({ order: { createdAt: "DESC" } }); }
  async getVariableCollection(id: string) { return this.variableCollections().findOneBy({ id }); }
  async saveVariableCollection(input: { id?: string; name: string }) { const name = input.name.trim(); if (!name) throw new Error("Variable Collection name is required."); const duplicate = await this.variableCollections().createQueryBuilder("item").where("lower(item.name) = lower(:name)", { name }).andWhere(input.id ? "item.id != :id" : "1=1", { id: input.id }).getOne(); if (duplicate) throw new Error(`Variable Collection "${name}" already exists.`); const current = input.id ? await this.getVariableCollection(input.id) : undefined; const timestamp = nowIso(); return this.variableCollections().save(this.variableCollections().create({ id: input.id ?? createId(), name, createdAt: current?.createdAt ?? timestamp, updatedAt: timestamp })); }
  async deleteVariableCollection(id: string) { await this.variableCollections().delete(id); }
  async listVariables(collectionId?: string) { return this.variables().find({ where: collectionId ? { variableCollectionId: collectionId } : undefined, order: { sortOrder: "ASC", createdAt: "ASC" } }); }
  async getVariable(id: string) { return this.variables().findOneBy({ id }); }
  async saveVariable(input: Partial<VariableRow> & { variableCollectionId: string; name: string; value?: string }) { const name = input.name.trim(); if (!name) throw new Error("Variable name is required."); const duplicate = await this.variables().findOne({ where: { variableCollectionId: input.variableCollectionId, name } }); if (duplicate && duplicate.id !== input.id) throw new Error(`Variable "${name}" already exists in this collection.`); const current = input.id ? await this.getVariable(input.id) : undefined; const timestamp = nowIso(); return this.variables().save(this.variables().create({ id: input.id ?? createId(), variableCollectionId: input.variableCollectionId, name, value: input.value ?? current?.value ?? "", sortOrder: input.sortOrder ?? current?.sortOrder ?? (await this.variables().count({ where: { variableCollectionId: input.variableCollectionId } })), createdAt: current?.createdAt ?? timestamp, updatedAt: timestamp })); }
  async deleteVariable(id: string) { await this.variables().delete(id); }
  async reorderVariables(collectionId: string, ids: string[]) { return this.source.transaction(async (manager) => { const repo = new AppRepositories(manager); const current = await repo.listVariables(collectionId); if (ids.length !== current.length || ids.some((id) => !current.some((item) => item.id === id))) throw new Error("Variable order does not match the collection."); for (const [index, id] of ids.entries()) await repo.variables().update({ id, variableCollectionId: collectionId }, { sortOrder: index, updatedAt: nowIso() }); return repo.listVariables(collectionId); }); }

  async listBrokers() { return this.brokers().find({ order: { createdAt: "DESC" } }); }
  async getBroker(id: string) { return this.brokers().findOneBy({ id }); }
  async saveBroker(input: Partial<BrokerProfileRow> & { name: string; host: string; port: number; protocol: string }) { const current = input.id ? await this.getBroker(input.id) : undefined; const timestamp = nowIso(); return this.brokers().save(this.brokers().create({ ...current, ...input, id: input.id ?? createId(), clientId: input.clientId ?? current?.clientId ?? `mqtt-postwoman-${createId().slice(0, 8)}`, validateCertificate: Number(input.validateCertificate ?? current?.validateCertificate ?? 1), encryption: Number(input.encryption ?? current?.encryption ?? 0), clean: Number(input.clean ?? current?.clean ?? 1), keepAlive: input.keepAlive ?? current?.keepAlive ?? 30, reconnectPeriod: input.reconnectPeriod ?? current?.reconnectPeriod ?? 1000, createdAt: current?.createdAt ?? timestamp, updatedAt: timestamp })); }
  async deleteBroker(id: string) { await this.brokers().delete(id); }
  async listHelpers() { return this.helpers().find({ order: { createdAt: "DESC" } }); }
  async getHelper(id: string) { return this.helpers().findOneBy({ id }); }
  async saveHelper(input: Partial<TemplateHelperRow> & { name: string; kind: string; configJson: string }) { const current = input.id ? await this.getHelper(input.id) : undefined; const timestamp = nowIso(); return this.helpers().save(this.helpers().create({ ...current, ...input, id: input.id ?? createId(), createdAt: current?.createdAt ?? timestamp, updatedAt: timestamp } as TemplateHelperRow)); }
  async deleteHelper(id: string) { await this.helpers().delete(id); }
  async listSessions() { return this.sessions().find({ order: { createdAt: "DESC" } }); }
  async getSession(id: string) { return this.sessions().findOneBy({ id }); }
  async saveSession(input: Partial<ConsumerSessionRow> & { name: string; brokerProfileId: string; topics: string[] }) { const current = input.id ? await this.getSession(input.id) : undefined; const timestamp = nowIso(); return this.sessions().save(this.sessions().create({ ...current, id: input.id ?? createId(), name: input.name, brokerProfileId: input.brokerProfileId, topicsJson: JSON.stringify(input.topics), qos: input.qos ?? current?.qos ?? 0, active: Number(input.active ?? current?.active ?? 1), createdAt: current?.createdAt ?? timestamp, updatedAt: timestamp })); }
  async deleteSession(id: string) { await this.sessions().delete(id); }
  async listLogs(limit = 200) { return this.logs().find({ order: { createdAt: "DESC" }, take: limit }); }
  async clearLogs() { await this.logs().clear(); }
  async addLog(input: Omit<MessageLogRow, "id"> & { id?: string }) { return this.logs().save(this.logs().create({ ...input, id: input.id ?? createId() })); }
  async bootstrap() { return { collections: await this.listCollections(), requests: await this.listRequests(), variableCollections: await this.listVariableCollections(), variables: await this.listVariables(), brokers: await this.listBrokers(), helpers: await this.listHelpers(), consumerSessions: await this.listSessions(), logs: await this.listLogs() }; }
}
