import mqtt, { IClientOptions, MqttClient } from "mqtt";
import { WebSocket } from "ws";
import {
  addLog,
  AppDatabase,
  getBrokerProfile,
  getConsumerSession,
  listConsumerSessions,
  updateConsumerSession,
} from "./db";
import { topicMatches } from "./topic";
import { createId, nowIso, safeJsonParse } from "./utils";
import { ResolvedTemplate } from "./template";

export type RealtimeEvent =
  | { type: "log.created"; payload: unknown }
  | { type: "consumer.updated"; payload: unknown }
  | { type: "consumer.message"; payload: unknown }
  | { type: "broker.status"; payload: unknown };

type PublishOptions = {
  qos: number;
  retain: boolean;
};

type ActiveBroker = {
  client: MqttClient;
  ready: Promise<void>;
  subscriptions: Set<string>;
  refCount: number;
  connected: boolean;
  lastError: string | null;
};

type BrokerConnectionConfig = {
  host: string;
  port: number;
  protocol: string;
  username?: string | null;
  password?: string | null;
  clientId?: string;
  clean?: boolean | number;
  keepAlive?: number;
  reconnectPeriod?: number;
  caCert?: string | null;
  clientCert?: string | null;
  clientKey?: string | null;
};

export interface BrokerConnectionStatus {
  profileId: string;
  connected: boolean;
  refCount: number;
  lastError: string | null;
}

type ActiveConsumer = {
  id: string;
  name: string;
  brokerProfileId: string;
  topics: string[];
  qos: number;
};

export class RuntimeManager {
  private brokers = new Map<string, ActiveBroker>();
  private consumers = new Map<string, ActiveConsumer>();

  constructor(
    private readonly db: AppDatabase,
    private readonly broadcast: (event: RealtimeEvent) => void,
  ) {}

  snapshotConsumers() {
    return listConsumerSessions(this.db.raw);
  }

  listBrokerStatuses(): BrokerConnectionStatus[] {
    return Array.from(this.brokers.entries()).map(([profileId, broker]) => ({
      profileId,
      connected: broker.connected,
      refCount: broker.refCount,
      lastError: broker.lastError,
    }));
  }

  async connectBroker(profileId: string) {
    await this.ensureBroker(profileId);
    return this.getBrokerStatus(profileId);
  }

  async testBrokerConnection(profileId: string) {
    const profile = getBrokerProfile(this.db.raw, profileId);
    if (!profile) {
      throw new Error(`Broker profile ${profileId} not found`);
    }
    return this.testBrokerConfig(profile);
  }

  async testBrokerConfig(config: BrokerConnectionConfig) {
    const url = `${config.protocol}://${config.host}:${config.port}`;
    const client = mqtt.connect(url, this.buildOptionsFromConnection(config));
    try {
      await new Promise<void>((resolve, reject) => {
        client.once("connect", () => resolve());
        client.once("error", (error) => reject(error));
      });
      return { ok: true };
    } finally {
      client.end(true);
    }
  }

  disconnectBroker(profileId: string) {
    const broker = this.brokers.get(profileId);
    if (!broker) return null;
    for (const [sessionId, consumer] of this.consumers.entries()) {
      if (consumer.brokerProfileId === profileId) {
        this.consumers.delete(sessionId);
        updateConsumerSession(this.db.raw, sessionId, { active: false });
      }
    }
    broker.subscriptions.clear();
    broker.client.end(true);
    this.brokers.delete(profileId);
    this.broadcast({ type: "broker.status", payload: { profileId, status: "disconnected" } });
    return this.getBrokerStatus(profileId);
  }

  getBrokerStatus(profileId: string): BrokerConnectionStatus {
    const broker = this.brokers.get(profileId);
    return {
      profileId,
      connected: Boolean(broker?.connected),
      refCount: broker?.refCount ?? 0,
      lastError: broker?.lastError ?? null,
    };
  }

  private buildOptionsFromConnection(profile: BrokerConnectionConfig): IClientOptions {
    const options: IClientOptions = {
      clientId: profile.clientId ?? "mqtt-postwoman-temp",
      clean: Boolean(profile.clean ?? true),
      keepalive: profile.keepAlive ?? 30,
      reconnectPeriod: profile.reconnectPeriod ?? 1000,
    };
    if (profile.username) options.username = profile.username;
    if (profile.password) options.password = profile.password;
    if (profile.protocol === "mqtts") {
      options.protocol = "mqtts";
      if (profile.caCert) options.ca = profile.caCert;
      if (profile.clientCert) options.cert = profile.clientCert;
      if (profile.clientKey) options.key = profile.clientKey;
    }
    return options;
  }

  private buildOptions(profile: ReturnType<typeof getBrokerProfile>): IClientOptions {
    if (!profile) {
      throw new Error("Broker profile not found");
    }
    return this.buildOptionsFromConnection(profile);
  }

  private async ensureBroker(profileId: string) {
    const profile = getBrokerProfile(this.db.raw, profileId);
    if (!profile) {
      throw new Error(`Broker profile ${profileId} not found`);
    }

    const existing = this.brokers.get(profileId);
    if (existing) {
      existing.refCount += 1;
      await existing.ready;
      return existing;
    }

    const url = `${profile.protocol}://${profile.host}:${profile.port}`;
    const client = mqtt.connect(url, this.buildOptions(profile));

    const broker: ActiveBroker = {
      client,
      ready: Promise.resolve(),
      subscriptions: new Set<string>(),
      refCount: 1,
      connected: false,
      lastError: null,
    };

    broker.ready = new Promise<void>((resolve, reject) => {
      const onConnect = () => {
        broker.connected = true;
        broker.lastError = null;
        this.broadcast({ type: "broker.status", payload: { profileId, status: "connected" } });
        resolve();
      };
      const onError = (error: Error) => {
        broker.lastError = error.message;
        this.broadcast({ type: "broker.status", payload: { profileId, status: "error", error: error.message } });
        reject(error);
      };
      client.once("connect", onConnect);
      client.once("error", onError);
      client.on("reconnect", () => {
        this.broadcast({ type: "broker.status", payload: { profileId, status: "reconnecting" } });
      });
      client.on("close", () => {
        broker.connected = false;
        this.broadcast({ type: "broker.status", payload: { profileId, status: "closed" } });
      });
      client.on("message", (topic, message, packet) => {
        this.handleIncomingMessage(profileId, topic, message, packet?.messageId?.toString() ?? null);
      });
    });

    this.brokers.set(profileId, broker);
    await broker.ready;
    return broker;
  }

  async publish(
    profileId: string,
    topic: string,
    payload: ResolvedTemplate,
    options: PublishOptions,
    requestId?: string | null,
    variables?: Record<string, unknown>,
  ) {
    await this.ensureBroker(profileId);
    const broker = this.brokers.get(profileId);
    if (!broker) throw new Error("Broker connection unavailable");

    const messageText = payload.text;
    const payloadJson = payload.json !== null ? JSON.stringify(payload.json) : null;

    await new Promise<void>((resolve, reject) => {
      broker.client.publish(topic, messageText, { qos: options.qos as 0 | 1 | 2, retain: options.retain }, (error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });

    const log = addLog(this.db.raw, {
      direction: "publish",
      topic,
      payloadText: messageText,
      payloadJson,
      status: "ok",
      error: null,
      brokerProfileId: profileId,
      requestId: requestId ?? null,
      consumerSessionId: null,
      messageKey: createId(),
      createdAt: nowIso(),
    });

    this.broadcast({ type: "log.created", payload: log });
    return { ok: true, log, variables };
  }

  async batchPublish(
    profileId: string,
    items: Array<{ topic: string; payload: ResolvedTemplate }>,
    options: PublishOptions,
    requestId?: string | null,
    delayMs = 0,
  ) {
    const results = [];
    for (const item of items) {
      const result = await this.publish(profileId, item.topic, item.payload, options, requestId);
      results.push(result);
      if (delayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
    return results;
  }

  async startConsumer(input: { name: string; brokerProfileId: string; topics: string[]; qos?: number }) {
    const profile = getBrokerProfile(this.db.raw, input.brokerProfileId);
    if (!profile) throw new Error("Broker profile not found");
    const session = updateConsumerSession(
      this.db.raw,
      (await this.createOrReplaceConsumer(input)).id,
      { active: true },
    );
    if (!session) {
      throw new Error("Failed to create consumer session");
    }
    const broker = await this.ensureBroker(input.brokerProfileId);
    void broker;

    this.consumers.set(session.id, {
      id: session.id,
      name: session.name,
      brokerProfileId: session.brokerProfileId,
      topics: JSON.parse(session.topicsJson) as string[],
      qos: session.qos,
    });

    const activeBroker = this.brokers.get(input.brokerProfileId);
    if (!activeBroker) throw new Error("Broker connection unavailable");
    for (const topic of input.topics) {
      if (!activeBroker.subscriptions.has(topic)) {
        await new Promise<void>((resolve, reject) => {
          activeBroker.client.subscribe(topic, { qos: (input.qos ?? 0) as 0 | 1 | 2 }, (error) => {
            if (error) {
              reject(error);
              return;
            }
            activeBroker.subscriptions.add(topic);
            resolve();
          });
        });
      }
    }

    const updated = getConsumerSession(this.db.raw, session.id);
    this.broadcast({ type: "consumer.updated", payload: updated });
    return updated;
  }

  private async createOrReplaceConsumer(input: { name: string; brokerProfileId: string; topics: string[]; qos?: number }) {
    const uniqueTopics = [...new Set(input.topics.map((topic) => topic.trim()).filter(Boolean))];
    if (uniqueTopics.length !== input.topics.length) {
      throw new Error("Topic already subscribed in this request");
    }
    const existing = listConsumerSessions(this.db.raw).find(
      (session) => session.name === input.name && session.brokerProfileId === input.brokerProfileId,
    );
    if (existing) {
      const currentTopics = JSON.parse(existing.topicsJson) as string[];
      const duplicateTopics = uniqueTopics.filter((topic) => currentTopics.includes(topic));
      if (duplicateTopics.length) {
        throw new Error(`Topic already subscribed: ${duplicateTopics.join(", ")}`);
      }
      const updated = updateConsumerSession(this.db.raw, existing.id, {
        topics: [...currentTopics, ...uniqueTopics],
        qos: input.qos ?? 0,
        active: true,
      });
      if (!updated) throw new Error("Failed to update consumer session");
      return updated;
    }
    const createdId = createId();
    this.db.raw.prepare(
      "INSERT INTO consumer_sessions (id, name, brokerProfileId, topicsJson, qos, active, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    ).run(createdId, input.name, input.brokerProfileId, JSON.stringify(uniqueTopics), input.qos ?? 0, 1, nowIso(), nowIso());
    const created = getConsumerSession(this.db.raw, createdId);
    if (!created) throw new Error("Failed to create consumer session");
    return created;
  }

  async stopConsumer(sessionId: string) {
    const session = getConsumerSession(this.db.raw, sessionId);
    if (!session) return null;
    updateConsumerSession(this.db.raw, sessionId, { active: false });

    const topics = JSON.parse(session.topicsJson) as string[];
    const activeBroker = this.brokers.get(session.brokerProfileId);
    this.consumers.delete(sessionId);
    if (activeBroker) {
      for (const topic of topics) activeBroker.subscriptions.delete(topic);
      for (const topic of topics) {
        const stillUsed = Array.from(this.consumers.values()).some(
          (consumer) => consumer.brokerProfileId === session.brokerProfileId && consumer.topics.some((filter) => filter === topic),
        );
        if (!stillUsed) {
          await new Promise<void>((resolve) => {
            activeBroker.client.unsubscribe(topic, () => resolve());
          });
        }
      }
    }

    const updated = getConsumerSession(this.db.raw, sessionId);
    this.broadcast({ type: "consumer.updated", payload: updated });
    return updated;
  }

  private handleIncomingMessage(profileId: string, topic: string, message: Buffer, messageKey: string | null) {
    const payloadText = message.toString("utf8");
    const payloadJson = safeJsonParse(payloadText);
    const activeConsumers = Array.from(this.consumers.values()).filter((consumer) => consumer.brokerProfileId === profileId);
    for (const consumer of activeConsumers) {
      if (consumer.topics.some((filter) => topicMatches(filter, topic))) {
        const log = addLog(this.db.raw, {
          direction: "consume",
          topic,
          payloadText,
          payloadJson: payloadJson === null ? null : JSON.stringify(payloadJson),
          status: "ok",
          error: null,
          brokerProfileId: profileId,
          requestId: null,
          consumerSessionId: consumer.id,
          messageKey,
          createdAt: nowIso(),
        });
        this.broadcast({
          type: "consumer.message",
          payload: {
            consumerSessionId: consumer.id,
            topic,
            payloadText,
            payloadJson,
            log,
          },
        });
        this.broadcast({ type: "log.created", payload: log });
      }
    }
  }
}
