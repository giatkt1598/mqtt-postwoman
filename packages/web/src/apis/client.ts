import {
  BootstrapState,
  BrokerProfileRow,
  CollectionRow,
  ConsumerSessionRow,
  MessageLogRow,
  RequestRow,
  TemplateHelperRow,
  VariableCollectionRow,
  VariableRow,
} from "../models";

const API_BASE_URL =
  import.meta.env.VITE_API_URL ??
  (import.meta.env.DEV ? "http://localhost:3000" : window.location.origin);
const WS_BASE_URL =
  import.meta.env.VITE_WS_URL ?? API_BASE_URL.replace(/^http/, "ws");

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}/api${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    ...init,
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: response.statusText }));
    const message =
      typeof error.message === "string" && error.message.trim()
        ? error.message
        : response.statusText || "Request failed";
    throw new Error(message);
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export const apiClient = {
  bootstrap: () => request<BootstrapState>("/bootstrap"),
  collections: {
    create: (payload: Partial<CollectionRow> & { name: string }) =>
      request<CollectionRow>("/collections", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    update: (id: string, payload: Partial<CollectionRow> & { name: string }) =>
      request<CollectionRow>(`/collections/${id}`, {
        method: "PUT",
        body: JSON.stringify(payload),
      }),
    remove: (id: string) => request<void>(`/collections/${id}`, { method: "DELETE" }),
    duplicate: (id: string) =>
      request<{ collection: CollectionRow; requests: RequestRow[] }>(
        `/collections/${id}/duplicate`,
        { method: "POST" },
      ),
    reorder: (collectionIds: string[]) =>
      request<CollectionRow[]>("/collections/order", {
        method: "PUT",
        body: JSON.stringify({ collectionIds }),
      }),
  },
  requests: {
    create: (payload: Partial<RequestRow> & Record<string, unknown>) =>
      request<RequestRow>("/requests", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    update: (id: string, payload: Partial<RequestRow> & Record<string, unknown>) =>
      request<RequestRow>(`/requests/${id}`, {
        method: "PUT",
        body: JSON.stringify(payload),
      }),
    remove: (id: string) => request<void>(`/requests/${id}`, { method: "DELETE" }),
    reorder: (collectionId: string, requestIds: string[]) =>
      request<RequestRow[]>(`/collections/${collectionId}/requests/order`, {
        method: "PUT",
        body: JSON.stringify({ requestIds }),
      }),
  },
  variableCollections: {
    create: (payload: Partial<VariableCollectionRow> & { name: string }) =>
      request<VariableCollectionRow>("/variable-collections", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    update: (id: string, payload: Partial<VariableCollectionRow> & { name: string }) =>
      request<VariableCollectionRow>(`/variable-collections/${id}`, {
        method: "PUT",
        body: JSON.stringify(payload),
      }),
    remove: (id: string) => request<void>(`/variable-collections/${id}`, { method: "DELETE" }),
    variables: (id: string) => request<VariableRow[]>(`/variable-collections/${id}/variables`),
    createVariable: (id: string, payload: Partial<VariableRow> & { name: string; value: string }) =>
      request<VariableRow>(`/variable-collections/${id}/variables`, {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    updateVariable: (id: string, payload: Partial<VariableRow> & { name: string; value: string }) =>
      request<VariableRow>(`/variables/${id}`, {
        method: "PUT",
        body: JSON.stringify(payload),
      }),
    removeVariable: (id: string) => request<void>(`/variables/${id}`, { method: "DELETE" }),
    reorderVariables: (id: string, variableIds: string[]) =>
      request<VariableRow[]>(`/variable-collections/${id}/variables/order`, {
        method: "PUT",
        body: JSON.stringify({ variableIds }),
      }),
  },
  brokers: {
    statuses: () =>
      request<Array<{ profileId: string; connected: boolean; refCount: number; lastError: string | null }>>(
        "/brokers/status",
      ),
    create: (payload: Partial<BrokerProfileRow> & Record<string, unknown>) =>
      request<BrokerProfileRow>("/brokers", { method: "POST", body: JSON.stringify(payload) }),
    update: (id: string, payload: Partial<BrokerProfileRow> & Record<string, unknown>) =>
      request<BrokerProfileRow>(`/brokers/${id}`, { method: "PUT", body: JSON.stringify(payload) }),
    remove: (id: string) => request<void>(`/brokers/${id}`, { method: "DELETE" }),
    connect: (id: string) =>
      request<{ profileId: string; connected: boolean; refCount: number; lastError: string | null }>(
        `/brokers/${id}/connect`,
        { method: "POST" },
      ),
    test: (payload: Record<string, unknown>) =>
      request<{ ok: true }>("/brokers/test", { method: "POST", body: JSON.stringify(payload) }),
    disconnect: (id: string) => request<void>(`/brokers/${id}/disconnect`, { method: "POST" }),
  },
  helpers: {
    create: (payload: Record<string, unknown>) =>
      request<TemplateHelperRow>("/helpers", { method: "POST", body: JSON.stringify(payload) }),
    update: (id: string, payload: Record<string, unknown>) =>
      request<TemplateHelperRow>(`/helpers/${id}`, { method: "PUT", body: JSON.stringify(payload) }),
    remove: (id: string) => request<void>(`/helpers/${id}`, { method: "DELETE" }),
  },
  batchPublish: (payload: Record<string, unknown>) =>
    request("/publish/batch", { method: "POST", body: JSON.stringify(payload) }),
  resolveTemplate: (payload: Record<string, unknown>) =>
    request<{ text: string; json: unknown; value: unknown }>("/templates/resolve", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  consumers: {
    create: (payload: { name: string; brokerProfileId: string; topics: string[]; qos: number }) =>
      request<ConsumerSessionRow>("/consumer-sessions", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    remove: (id: string) => request<void>(`/consumer-sessions/${id}`, { method: "DELETE" }),
    unsubscribe: (id: string, topic: string) =>
      request<ConsumerSessionRow | void>(`/consumer-sessions/${id}/topics`, {
        method: "DELETE",
        body: JSON.stringify({ topic }),
      }),
  },
  logs: {
    list: () => request<MessageLogRow[]>("/logs"),
    clear: () => request<void>("/logs", { method: "DELETE" }),
  },
};

export function createRealtimeSocket() {
  return new WebSocket(`${WS_BASE_URL}/ws`);
}
