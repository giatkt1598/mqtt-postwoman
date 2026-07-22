import {
  BootstrapState,
  BrokerProfileRow,
  CollectionRow,
  ConsumerSessionRow,
  DraftRequest,
  EnvironmentRow,
  MessageLogRow,
  RequestRow,
  TemplateHelperRow,
} from "./types";

const API_BASE_URL = import.meta.env.VITE_API_URL ?? (import.meta.env.DEV ? "http://localhost:3000" : window.location.origin);
const WS_BASE_URL = import.meta.env.VITE_WS_URL ?? API_BASE_URL.replace(/^http/, "ws");

const api = async <T>(path: string, init?: RequestInit): Promise<T> => {
  const response = await fetch(`${API_BASE_URL}/api${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    ...init,
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: response.statusText }));
    throw new Error(error.message ?? response.statusText);
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
};

export const client = {
  bootstrap: () => api<BootstrapState>("/bootstrap"),
  collections: {
    create: (payload: Partial<CollectionRow> & { name: string }) =>
      api<CollectionRow>("/collections", { method: "POST", body: JSON.stringify(payload) }),
    update: (id: string, payload: Partial<CollectionRow> & { name: string }) =>
      api<CollectionRow>(`/collections/${id}`, { method: "PUT", body: JSON.stringify(payload) }),
    remove: (id: string) => api<void>(`/collections/${id}`, { method: "DELETE" }),
  },
  requests: {
    create: (payload: Partial<RequestRow> & DraftRequest) =>
      api<RequestRow>("/requests", { method: "POST", body: JSON.stringify(payload) }),
    update: (id: string, payload: Partial<RequestRow> & DraftRequest) =>
      api<RequestRow>(`/requests/${id}`, { method: "PUT", body: JSON.stringify(payload) }),
    remove: (id: string) => api<void>(`/requests/${id}`, { method: "DELETE" }),
  },
  environments: {
    create: (payload: Partial<EnvironmentRow> & { name: string; variablesJson: string }) =>
      api<EnvironmentRow>("/environments", { method: "POST", body: JSON.stringify(payload) }),
    update: (id: string, payload: Partial<EnvironmentRow> & { name: string; variablesJson: string }) =>
      api<EnvironmentRow>(`/environments/${id}`, { method: "PUT", body: JSON.stringify(payload) }),
    remove: (id: string) => api<void>(`/environments/${id}`, { method: "DELETE" }),
  },
  brokers: {
    statuses: () => api<Array<{ profileId: string; connected: boolean; refCount: number; lastError: string | null }>>("/brokers/status"),
    create: (payload: Partial<BrokerProfileRow> & Record<string, unknown>) =>
      api<BrokerProfileRow>("/brokers", { method: "POST", body: JSON.stringify(payload) }),
    update: (id: string, payload: Partial<BrokerProfileRow> & Record<string, unknown>) =>
      api<BrokerProfileRow>(`/brokers/${id}`, { method: "PUT", body: JSON.stringify(payload) }),
    remove: (id: string) => api<void>(`/brokers/${id}`, { method: "DELETE" }),
    connect: (id: string) => api<{ profileId: string; connected: boolean; refCount: number; lastError: string | null }>(`/brokers/${id}/connect`, { method: "POST" }),
    test: (payload: Record<string, unknown>) => api<{ ok: true }>("/brokers/test", { method: "POST", body: JSON.stringify(payload) }),
    disconnect: (id: string) => api<void>(`/brokers/${id}/disconnect`, { method: "POST" }),
  },
  helpers: {
    create: (payload: Partial<TemplateHelperRow> & { name: string; kind: TemplateHelperRow["kind"]; configJson: string }) =>
      api<TemplateHelperRow>("/helpers", { method: "POST", body: JSON.stringify(payload) }),
    update: (
      id: string,
      payload: Partial<TemplateHelperRow> & { name: string; kind: TemplateHelperRow["kind"]; configJson: string },
    ) => api<TemplateHelperRow>(`/helpers/${id}`, { method: "PUT", body: JSON.stringify(payload) }),
    remove: (id: string) => api<void>(`/helpers/${id}`, { method: "DELETE" }),
  },
  publish: (payload: Record<string, unknown>) => api("/publish", { method: "POST", body: JSON.stringify(payload) }),
  batchPublish: (payload: Record<string, unknown>) => api("/publish/batch", { method: "POST", body: JSON.stringify(payload) }),
  resolveTemplate: (payload: { template: string; environmentId?: string | null; variables?: Record<string, unknown> }) =>
    api<{ text: string; json: unknown; value: unknown }>("/templates/resolve", { method: "POST", body: JSON.stringify(payload) }),
  consumers: {
    create: (payload: { name: string; brokerProfileId: string; topics: string[]; qos: number }) =>
      api<ConsumerSessionRow>("/consumer-sessions", { method: "POST", body: JSON.stringify(payload) }),
    remove: (id: string) => api<void>(`/consumer-sessions/${id}`, { method: "DELETE" }),
    unsubscribe: (id: string, topic: string) =>
      api<ConsumerSessionRow | void>(`/consumer-sessions/${id}/topics`, { method: "DELETE", body: JSON.stringify({ topic }) }),
  },
  logs: {
    list: () => api<MessageLogRow[]>("/logs"),
    clear: () => api<void>("/logs", { method: "DELETE" }),
  },
};

export function createRealtimeSocket() {
  return new WebSocket(`${WS_BASE_URL}/ws`);
}
