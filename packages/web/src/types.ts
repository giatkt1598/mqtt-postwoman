export interface CollectionRow {
  id: string;
  name: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface RequestRow {
  id: string;
  collectionId: string;
  name: string;
  topic: string;
  payloadTemplate: string;
  qos: number;
  retain: number;
  brokerProfileId: string | null;
  environmentId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface EnvironmentRow {
  id: string;
  name: string;
  variablesJson: string;
  createdAt: string;
  updatedAt: string;
}

export interface BrokerProfileRow {
  id: string;
  name: string;
  host: string;
  port: number;
  protocol: string;
  username: string | null;
  password: string | null;
  clientId: string;
  clean: number;
  keepAlive: number;
  reconnectPeriod: number;
  caCert: string | null;
  clientCert: string | null;
  clientKey: string | null;
  createdAt: string;
  updatedAt: string;
}

export type HelperKind = "literal" | "now" | "uuid" | "randomInt" | "env";

export interface TemplateHelperRow {
  id: string;
  name: string;
  kind: HelperKind;
  configJson: string;
  createdAt: string;
  updatedAt: string;
}

export interface ConsumerSessionRow {
  id: string;
  name: string;
  brokerProfileId: string;
  topicsJson: string;
  qos: number;
  active: number;
  createdAt: string;
  updatedAt: string;
}

export interface MessageLogRow {
  id: string;
  direction: "publish" | "consume";
  topic: string;
  payloadText: string;
  payloadJson: string | null;
  status: string;
  error: string | null;
  brokerProfileId: string | null;
  requestId: string | null;
  consumerSessionId: string | null;
  messageKey: string | null;
  createdAt: string;
}

export interface BootstrapState {
  collections: CollectionRow[];
  requests: RequestRow[];
  environments: EnvironmentRow[];
  brokers: BrokerProfileRow[];
  helpers: TemplateHelperRow[];
  consumerSessions: ConsumerSessionRow[];
  logs: MessageLogRow[];
}

export interface ConsumerMessageEvent {
  consumerSessionId: string;
  topic: string;
  payloadText: string;
  payloadJson: unknown;
  log: MessageLogRow;
}

export interface DraftRequest {
  id?: string;
  collectionId: string;
  name: string;
  topic: string;
  payloadTemplate: string;
  qos: number;
  retain: boolean;
  brokerProfileId: string;
  environmentId: string;
}
