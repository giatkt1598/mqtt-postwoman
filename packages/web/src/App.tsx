import { useEffect, useMemo, useRef, useState } from "react";
import { ToastContainer, toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import { client } from "./api";
import { createRealtimeSocket } from "./api";
import {
  BootstrapState,
  BrokerProfileRow,
  CollectionRow,
  ConsumerMessageEvent,
  ConsumerSessionRow,
  DraftRequest,
  EnvironmentRow,
  MessageLogRow,
  RequestRow,
  TemplateHelperRow,
} from "./types";

type AssetTab = "environments" | "brokers" | "helpers";
type RightTab = "history" | "functions" | "assets";
type MainTab = "publishers" | "consumers" | "connections";
type ConnectionView = "list" | "form";
type CollectionModal = "create" | "edit" | null;
type PayloadFormat = "raw" | "xml" | "json";
type InactiveConsumerTopic = {
  key: string;
  topic: string;
  brokerProfileId: string;
};
type DeleteConfirmation = {
  title: string;
  message: string;
  onConfirm: () => void | Promise<void>;
};

const emptyDraft = (
  collectionId = "",
  brokerProfileId = "",
  environmentId = "",
): DraftRequest => ({
  collectionId,
  name: "New request",
  topic: "",
  payloadTemplate: '{"publishDate":"{{now}}"}',
  qos: 0,
  retain: false,
  brokerProfileId,
  environmentId,
});

function requestToDraft(request: RequestRow): DraftRequest {
  return {
    id: request.id,
    collectionId: request.collectionId,
    name: request.name,
    topic: request.topic,
    payloadTemplate: request.payloadTemplate,
    qos: request.qos,
    retain: Boolean(request.retain),
    brokerProfileId: request.brokerProfileId ?? "",
    environmentId: request.environmentId ?? "",
  };
}

function isRequestModified(
  request: RequestRow | undefined,
  draft: DraftRequest | undefined,
) {
  if (!request || !draft) return false;
  return (
    request.collectionId !== draft.collectionId ||
    request.name !== draft.name ||
    request.topic !== draft.topic ||
    request.payloadTemplate !== draft.payloadTemplate ||
    request.qos !== draft.qos ||
    Boolean(request.retain) !== draft.retain ||
    (request.brokerProfileId ?? "") !== draft.brokerProfileId ||
    (request.environmentId ?? "") !== draft.environmentId
  );
}

const emptyBrokerDraft = () => ({
  id: "",
  name: "local-mosquitto",
  host: "localhost",
  port: 1883,
  protocol: "mqtt",
  validateCertificate: true,
  encryption: false,
  username: "",
  password: "",
  clientId: "",
  clean: true,
  keepAlive: 30,
  reconnectPeriod: 1000,
  caCert: "",
  clientCert: "",
  clientKey: "",
});

function parseJsonObject(value: string) {
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed
      : null;
  } catch {
    return null;
  }
}

function toPrettyJson(value: unknown) {
  return JSON.stringify(value, null, 2);
}

function formatTime(value: string) {
  return new Date(value).toLocaleString();
}

function joinTopics(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function topicMatches(filter: string, topic: string) {
  const filterParts = filter.split("/");
  const topicParts = topic.split("/");
  for (let index = 0; index < filterParts.length; index += 1) {
    if (filterParts[index] === "#") return true;
    if (filterParts[index] === "+") {
      if (!topicParts[index]) return false;
      continue;
    }
    if (filterParts[index] !== topicParts[index]) return false;
  }
  return filterParts.length === topicParts.length;
}

function beautifyXml(value: string) {
  const normalized = value.replace(/>\s*</g, "><").replace(/></g, ">\n<");
  let depth = 0;
  return normalized
    .split("\n")
    .map((line) => {
      if (line.startsWith("</")) depth = Math.max(depth - 1, 0);
      const formatted = `${"  ".repeat(depth)}${line}`;
      if (
        line.startsWith("<") &&
        !line.startsWith("</") &&
        !line.endsWith("/>") &&
        !line.includes("</")
      )
        depth += 1;
      return formatted;
    })
    .join("\n");
}

function randomTopicColor() {
  return `#${Math.floor(Math.random() * 0xffffff)
    .toString(16)
    .padStart(6, "0")}`;
}

function mergeLogs(current: MessageLogRow[], incoming: MessageLogRow[]) {
  const byId = new Map(current.map((log) => [log.id, log]));
  for (const log of incoming) byId.set(log.id, log);
  return [...byId.values()]
    .sort(
      (left, right) =>
        new Date(right.createdAt).getTime() -
        new Date(left.createdAt).getTime(),
    )
    .slice(0, 200);
}

function TopicAutocomplete({
  value,
  topics,
  label,
  onChange,
}: {
  value: string;
  topics: string[];
  label: string;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const currentPart = value.split(",").pop()?.trim() ?? "";
  const suggestions = topics.filter((topic) =>
    topic.toLowerCase().includes(currentPart.toLowerCase()),
  );

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node))
        setOpen(false);
    };
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, []);

  const selectTopic = (topic: string) => {
    const parts = value.split(",");
    parts[parts.length - 1] = ` ${topic}`;
    onChange(parts.join(",").replace(/^\s+/, ""));
    setOpen(false);
  };

  return (
    <div
      className={`topic-autocomplete ${value.trim() ? "has-value" : ""}`}
      ref={rootRef}
    >
      <span className="topic-floating-label">{label}</span>
      <input
        aria-label={label}
        value={value}
        onFocus={() => setOpen(true)}
        onChange={(event) => {
          onChange(event.target.value);
          setOpen(true);
        }}
      />
      {open && suggestions.length > 0 && (
        <div className="topic-suggestion-list" role="listbox">
          {suggestions.map((topic) => (
            <button
              key={topic}
              type="button"
              role="option"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => selectTopic(topic)}
            >
              {topic}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function App() {
  const [bootstrap, setBootstrap] = useState<BootstrapState | null>(null);
  const [brokerStatuses, setBrokerStatuses] = useState<
    Array<{
      profileId: string;
      connected: boolean;
      refCount: number;
      lastError: string | null;
    }>
  >([]);
  const [mainTab, setMainTab] = useState<MainTab>("publishers");
  const mainTabRef = useRef<MainTab>("publishers");
  const [selectedCollectionId, setSelectedCollectionId] = useState<string>("");
  const [selectedRequestId, setSelectedRequestId] = useState<string>("");
  const [expandedCollectionIds, setExpandedCollectionIds] = useState<string[]>(
    () => {
      try {
        return JSON.parse(
          localStorage.getItem("mqtt-postwoman.expandedCollections") ?? "[]",
        ) as string[];
      } catch {
        return [];
      }
    },
  );
  const [collectionModal, setCollectionModal] = useState<CollectionModal>(null);
  const [collectionMenuId, setCollectionMenuId] = useState<string | null>(null);
  const [favoriteCollectionIds, setFavoriteCollectionIds] = useState<string[]>(
    () => {
      try {
        return JSON.parse(
          localStorage.getItem("mqtt-postwoman.favoriteCollections") ?? "[]",
        ) as string[];
      } catch {
        return [];
      }
    },
  );
  const [activeConnectionId, setActiveConnectionId] = useState<string>(
    () => localStorage.getItem("mqtt-postwoman.activeConnectionId") ?? "",
  );
  const [connectionView, setConnectionView] = useState<ConnectionView>("list");
  const [rightTab, setRightTab] = useState<RightTab>("history");
  const [assetTab, setAssetTab] = useState<AssetTab>("environments");
  const [draft, setDraft] = useState<DraftRequest>(emptyDraft());
  const [requestDrafts, setRequestDrafts] = useState<
    Record<string, DraftRequest>
  >({});
  const [payloadFormat, setPayloadFormat] = useState<PayloadFormat>("json");
  const [batchCount, setBatchCount] = useState(1);
  const [batchDelayMs, setBatchDelayMs] = useState(0);
  const [consumerTopics, setConsumerTopics] = useState("device/+/status");
  const [consumerTopicColor, setConsumerTopicColor] = useState(
    () =>
      localStorage.getItem("mqtt-postwoman.consumerTopicColor") ?? "#4fd1c5",
  );
  const [inactiveConsumerTopics, setInactiveConsumerTopics] = useState<
    InactiveConsumerTopic[]
  >(() => {
    try {
      return JSON.parse(
        localStorage.getItem("mqtt-postwoman.inactiveConsumerTopics") ?? "[]",
      ) as InactiveConsumerTopic[];
    } catch {
      return [];
    }
  });
  const [topicColors, setTopicColors] = useState<Record<string, string>>(() => {
    try {
      return JSON.parse(
        localStorage.getItem("mqtt-postwoman.topicColors") ?? "{}",
      ) as Record<string, string>;
    } catch {
      return {};
    }
  });
  const [consumerQos, setConsumerQos] = useState(0);
  const [collectionDraft, setCollectionDraft] = useState({
    id: "",
    name: "",
    description: "",
  });
  const [envDraft, setEnvDraft] = useState({
    id: "",
    name: "local",
    variablesJson: '{\n  "env": "local"\n}',
  });
  const [brokerDraft, setBrokerDraft] = useState(emptyBrokerDraft());
  const [connectionTestMessage, setConnectionTestMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [connectionTestPending, setConnectionTestPending] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [helperDraft, setHelperDraft] = useState({
    id: "",
    name: "requestId",
    kind: "uuid" as TemplateHelperRow["kind"],
    configJson: "{}",
  });
  const [liveMessages, setLiveMessages] = useState<ConsumerMessageEvent[]>([]);
  const [unreadConsumerMessages, setUnreadConsumerMessages] = useState(0);
  const [historyLogs, setHistoryLogs] = useState<MessageLogRow[]>([]);
  const [error, setError] = useState<string>("");
  const [deleteConfirmation, setDeleteConfirmation] =
    useState<DeleteConfirmation | null>(null);
  const [topicValidationError, setTopicValidationError] = useState(false);

  const refresh = async () => {
    const [data, statuses, fetchedLogs] = await Promise.all([
      client.bootstrap(),
      client.brokers.statuses(),
      client.logs.list(),
    ]);
    setBootstrap(data);
    setBrokerStatuses(statuses);
    setHistoryLogs((current) => mergeLogs(current, fetchedLogs));
    if (!selectedCollectionId && data.collections[0]) {
      setSelectedCollectionId(data.collections[0].id);
    }
    const connectedConnectionId =
      statuses.find(
        (status) =>
          status.connected &&
          data.brokers.some((broker) => broker.id === status.profileId),
      )?.profileId ?? "";
    const availableConnectionId = statuses.some(
      (status) => status.profileId === activeConnectionId && status.connected,
    )
      ? activeConnectionId
      : connectedConnectionId;
    if (!activeConnectionId || availableConnectionId !== activeConnectionId) {
      setActiveConnectionId(availableConnectionId);
    }
  };

  useEffect(() => {
    void refresh().catch((err) => setError(err.message));
  }, []);

  useEffect(() => {
    if (rightTab !== "history") return;
    void client.logs
      .list()
      .then((fetchedLogs) =>
        setHistoryLogs((current) => mergeLogs(current, fetchedLogs)),
      )
      .catch((err) =>
        setError(err instanceof Error ? err.message : "Unable to load history"),
      );
  }, [rightTab]);

  useEffect(() => {
    mainTabRef.current = mainTab;
    if (mainTab === "consumers") setUnreadConsumerMessages(0);
  }, [mainTab]);

  useEffect(() => {
    localStorage.setItem(
      "mqtt-postwoman.activeConnectionId",
      activeConnectionId,
    );
  }, [activeConnectionId]);

  useEffect(() => {
    let ws: WebSocket | null = null;
    const timer = window.setTimeout(() => {
      ws = createRealtimeSocket();
      ws.onmessage = (event) => {
        const message = JSON.parse(event.data as string) as
          | { type: "bootstrap"; payload: BootstrapState }
          | { type: "log.created"; payload: MessageLogRow }
          | { type: "consumer.updated"; payload: ConsumerSessionRow | null }
          | { type: "consumer.message"; payload: ConsumerMessageEvent }
          | { type: "broker.status"; payload: unknown };
        if (message.type === "bootstrap") {
          setBootstrap(message.payload);
          setHistoryLogs((current) => mergeLogs(current, message.payload.logs));
        }
        if (message.type === "log.created") {
          setHistoryLogs((current) => mergeLogs(current, [message.payload]));
          if (
            message.payload.direction === "consume" &&
            message.payload.consumerSessionId
          ) {
            const liveMessage: ConsumerMessageEvent = {
              consumerSessionId: message.payload.consumerSessionId,
              topic: message.payload.topic,
              payloadText: message.payload.payloadText,
              payloadJson: message.payload.payloadJson
                ? JSON.parse(message.payload.payloadJson)
                : null,
              log: message.payload,
            };
            setLiveMessages((current) =>
              [
                liveMessage,
                ...current.filter((item) => item.log.id !== liveMessage.log.id),
              ].slice(0, 25),
            );
          }
          setBootstrap((current) =>
            current
              ? {
                  ...current,
                  logs: [
                    message.payload,
                    ...current.logs.filter(
                      (item) => item.id !== message.payload.id,
                    ),
                  ],
                }
              : current,
          );
        }
        if (message.type === "consumer.updated") {
          const current = message.payload;
          if (!current) return;
          setBootstrap((state) =>
            state
              ? {
                  ...state,
                  consumerSessions: [
                    current,
                    ...state.consumerSessions.filter(
                      (session) => session.id !== current.id,
                    ),
                  ],
                }
              : state,
          );
        }
        if (message.type === "consumer.message") {
          setLiveMessages((current) =>
            [message.payload, ...current].slice(0, 25),
          );
          if (mainTabRef.current !== "consumers") {
            setUnreadConsumerMessages((current) => current + 1);
          }
        }
        if (message.type === "broker.status") {
          const status = message.payload as {
            profileId?: string;
            status?: string;
            error?: string;
          };
          if (!status.profileId) return;
          setBrokerStatuses((current) =>
            current.some((item) => item.profileId === status.profileId)
              ? current.map((item) =>
                  item.profileId === status.profileId
                    ? {
                        ...item,
                        connected:
                          status.status === "connected"
                            ? true
                            : status.status === "closed" ||
                                status.status === "error"
                              ? false
                              : item.connected,
                        lastError:
                          status.status === "error"
                            ? status.error?.trim() || "Connection failed"
                            : status.status === "connected"
                              ? null
                              : item.lastError,
                      }
                    : item,
                )
              : [
                  {
                    profileId: status.profileId,
                    connected: status.status === "connected",
                    refCount: 0,
                    lastError:
                      status.status === "error"
                        ? status.error?.trim() || "Connection failed"
                        : null,
                  },
                ],
          );
        }
      };
      ws.onerror = () => setError("WebSocket connection failed");
    }, 0);
    return () => {
      window.clearTimeout(timer);
      ws?.close();
    };
  }, []);

  const collections = bootstrap?.collections ?? [];
  const environments = bootstrap?.environments ?? [];
  const brokers = bootstrap?.brokers ?? [];
  const helpers = bootstrap?.helpers ?? [];
  const consumerSessions = bootstrap?.consumerSessions ?? [];
  const logs = historyLogs;
  const publishLogCount = logs.filter(
    (log) => log.direction === "publish",
  ).length;
  const consumeLogCount = logs.filter(
    (log) => log.direction === "consume",
  ).length;
  const allTopics = useMemo(
    () =>
      [
        ...new Set(
          (bootstrap?.requests ?? [])
            .map((request) => request.topic.trim())
            .filter(Boolean),
        ),
      ].sort(),
    [bootstrap?.requests],
  );
  const getTopicColor = (topic: string) =>
    Object.entries(topicColors).find(([filter]) =>
      topicMatches(filter, topic),
    )?.[1] ?? "rgba(79, 209, 197, 0.5)";
  const activeTopicKeys = new Set(
    consumerSessions.flatMap((session) =>
      (JSON.parse(session.topicsJson) as string[]).map(
        (topic) => `${session.brokerProfileId}:${topic}`,
      ),
    ),
  );
  const activeConnection =
    brokers.find((broker) => broker.id === activeConnectionId) ?? null;
  const activeConnectionStatus = brokerStatuses.find(
    (status) => status.profileId === activeConnectionId,
  );
  const selectedRequestRecord = bootstrap?.requests.find(
    (request) => request.id === selectedRequestId,
  );
  const selectedRequestModified = isRequestModified(
    selectedRequestRecord,
    draft,
  );
  const fallbackConnectionId = activeConnectionId || brokers[0]?.id || "";
  const sortedCollections = useMemo(
    () =>
      [...collections].sort(
        (left, right) =>
          Number(favoriteCollectionIds.includes(right.id)) -
          Number(favoriteCollectionIds.includes(left.id)),
      ),
    [collections, favoriteCollectionIds],
  );

  useEffect(() => {
    if (draft.id) {
      setRequestDrafts((current) =>
        current[draft.id] === draft
          ? current
          : { ...current, [draft.id]: draft },
      );
    }
  }, [draft]);

  useEffect(() => {
    setEnvDraft((current) => current);
  }, [assetTab]);

  const selectedCollection = collections.find(
    (collection) => collection.id === selectedCollectionId,
  );

  useEffect(() => {
    if (selectedCollection) {
      setCollectionDraft({
        id: selectedCollection.id,
        name: selectedCollection.name,
        description: selectedCollection.description ?? "",
      });
    } else {
      setCollectionDraft({ id: "", name: "", description: "" });
    }
  }, [selectedCollection]);

  const selectCollection = (collection: CollectionRow) => {
    setSelectedCollectionId(collection.id);
    setExpandedCollectionIds((current) => {
      if (current.includes(collection.id)) return current;
      const next = [...current, collection.id];
      localStorage.setItem(
        "mqtt-postwoman.expandedCollections",
        JSON.stringify(next),
      );
      return next;
    });
    setSelectedRequestId("");
    setDraft(
      emptyDraft(
        collection.id,
        fallbackConnectionId,
        environments[0]?.id ?? "",
      ),
    );
  };

  const toggleCollection = (collectionId: string) => {
    setExpandedCollectionIds((current) => {
      const next = current.includes(collectionId)
        ? current.filter((id) => id !== collectionId)
        : [...current, collectionId];
      localStorage.setItem(
        "mqtt-postwoman.expandedCollections",
        JSON.stringify(next),
      );
      return next;
    });
  };

  const selectRequest = (request: RequestRow) => {
    if (draft.id) {
      setRequestDrafts((current) => ({ ...current, [draft.id]: draft }));
    }
    setSelectedCollectionId(request.collectionId);
    setSelectedRequestId(request.id);
    setTopicValidationError(false);
    setDraft(requestDrafts[request.id] ?? requestToDraft(request));
    setMainTab("publishers");
  };

  const saveCollection = async () => {
    if (!collectionDraft.name.trim()) return;
    const saved = collectionDraft.id
      ? await client.collections.update(collectionDraft.id, {
          name: collectionDraft.name,
          description: collectionDraft.description,
        })
      : await client.collections.create({
          name: collectionDraft.name,
          description: collectionDraft.description,
        });
    await refresh();
    setSelectedCollectionId(saved.id);
    setCollectionModal(null);
  };

  const deleteCollection = async (collection?: CollectionRow) => {
    const collectionId = collection?.id ?? collectionDraft.id;
    if (!collectionId) return;
    await client.collections.remove(collectionId);
    setFavoriteCollectionIds((current) => {
      const next = current.filter((id) => id !== collectionId);
      localStorage.setItem(
        "mqtt-postwoman.favoriteCollections",
        JSON.stringify(next),
      );
      return next;
    });
    if (selectedCollectionId === collectionId) {
      setSelectedCollectionId("");
      setSelectedRequestId("");
    }
    setExpandedCollectionIds((current) => {
      const next = current.filter((id) => id !== collectionId);
      localStorage.setItem(
        "mqtt-postwoman.expandedCollections",
        JSON.stringify(next),
      );
      return next;
    });
    setCollectionMenuId(null);
    await refresh();
    setCollectionModal(null);
  };

  const openCreateCollection = () => {
    setCollectionDraft({ id: "", name: "", description: "" });
    setCollectionMenuId(null);
    setCollectionModal("create");
  };

  const openEditCollection = (collection: CollectionRow) => {
    setCollectionDraft({
      id: collection.id,
      name: collection.name,
      description: collection.description ?? "",
    });
    setCollectionMenuId(null);
    setCollectionModal("edit");
  };

  const askDeleteConfirmation = (
    title: string,
    message: string,
    onConfirm: () => void | Promise<void>,
  ) => {
    setDeleteConfirmation({ title, message, onConfirm });
  };

  const confirmDelete = async () => {
    if (!deleteConfirmation) return;
    const { onConfirm } = deleteConfirmation;
    setDeleteConfirmation(null);
    try {
      await onConfirm();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to delete");
    }
  };

  const addRequestToCollection = async (collection: CollectionRow) => {
    selectCollection(collection);
    const { id: _draftId, ...newRequestPayload } = emptyDraft(
      collection.id,
      fallbackConnectionId,
      environments[0]?.id ?? "",
    );
    const saved = await client.requests.create({
      ...newRequestPayload,
      name: "New Request",
      brokerProfileId: newRequestPayload.brokerProfileId || null,
      environmentId: newRequestPayload.environmentId || null,
    });
    await refresh();
    setSelectedCollectionId(collection.id);
    setSelectedRequestId(saved.id);
    setTopicValidationError(false);
    setDraft(requestToDraft(saved));
    setCollectionMenuId(null);
  };

  const toggleFavoriteCollection = (collectionId: string) => {
    setFavoriteCollectionIds((current) => {
      const next = current.includes(collectionId)
        ? current.filter((id) => id !== collectionId)
        : [collectionId, ...current];
      localStorage.setItem(
        "mqtt-postwoman.favoriteCollections",
        JSON.stringify(next),
      );
      return next;
    });
    setCollectionMenuId(null);
  };

  const saveRequest = async () => {
    if (!draft.collectionId) return;
    const payload = {
      ...draft,
      brokerProfileId: draft.brokerProfileId || null,
      environmentId: draft.environmentId || null,
    };
    const saved = draft.id
      ? await client.requests.update(draft.id, payload)
      : await client.requests.create(payload);
    await refresh();
    setSelectedRequestId(saved.id);
    setDraft(requestToDraft(saved));
    setRequestDrafts((current) => {
      const next = { ...current };
      delete next[saved.id];
      return next;
    });
  };

  const deleteRequest = async () => {
    if (!draft.id) return;
    await client.requests.remove(draft.id);
    await refresh();
    setSelectedRequestId("");
    setRequestDrafts((current) => {
      const next = { ...current };
      delete next[draft.id];
      return next;
    });
    setDraft(
      emptyDraft(
        selectedCollectionId,
        fallbackConnectionId,
        environments[0]?.id ?? "",
      ),
    );
  };

  const publishRequest = async () => {
    const trimmedTopic = draft.topic.trim();
    const hasConnectedBroker = Boolean(
      activeConnectionId &&
      brokerStatuses.some(
        (status) => status.profileId === activeConnectionId && status.connected,
      ),
    );
    const hasTopic = Boolean(trimmedTopic);
    const hasNullCharacter = draft.topic.includes("\u0000");
    const hasPublishWildcard = draft.topic.includes("+") || draft.topic.includes("#");
    setTopicValidationError(!hasTopic || hasNullCharacter || hasPublishWildcard);
    if (!hasTopic) {
      toast.error("Enter a topic before publishing.");
      return;
    }
    if (hasNullCharacter) {
      toast.error("Publish topic must not contain the NULL character.");
      return;
    }
    if (hasPublishWildcard) {
      toast.error("Publish topic must not contain MQTT wildcards (+ or #).");
      return;
    }
    if (!hasConnectedBroker) {
      toast.error("Connect to a broker before publishing.");
      return;
    }
    await client.batchPublish({
      requestId: draft.id,
      brokerProfileId: activeConnectionId,
      topic: draft.topic,
      payloadTemplate: draft.payloadTemplate,
      count: batchCount,
      delayMs: batchDelayMs,
      qos: draft.qos,
      retain: draft.retain,
      environmentId: draft.environmentId || undefined,
      variables: {},
    });
  };

  const clearHistory = async () => {
    await client.logs.clear();
    setHistoryLogs([]);
    setBootstrap((current) => (current ? { ...current, logs: [] } : current));
    toast.success("History cleared.");
  };

  const startConsumer = async () => {
    const topics = joinTopics(consumerTopics);
    const targetBroker = activeConnectionId;
    const hasConnectedBroker = Boolean(
      targetBroker &&
      brokerStatuses.some(
        (status) => status.profileId === targetBroker && status.connected,
      ),
    );
    if (!hasConnectedBroker) {
      toast.error("Connect to a broker before subscribing.");
      return;
    }
    if (!topics.length) {
      toast.error("Enter at least one topic.");
      return;
    }
    try {
      await client.consumers.create({
        name: "consumer",
        brokerProfileId: targetBroker,
        topics,
        qos: consumerQos,
      });
      setTopicColors((current) => {
        const next = { ...current };
        for (const topic of topics) next[topic] = consumerTopicColor;
        localStorage.setItem(
          "mqtt-postwoman.topicColors",
          JSON.stringify(next),
        );
        return next;
      });
      await refresh();
      setConsumerTopics("");
      const nextColor = randomTopicColor();
      setConsumerTopicColor(nextColor);
      localStorage.setItem("mqtt-postwoman.consumerTopicColor", nextColor);
      setInactiveConsumerTopics((current) => {
        const next = current.filter(
          (item) =>
            item.brokerProfileId !== targetBroker ||
            !topics.includes(item.topic),
        );
        localStorage.setItem(
          "mqtt-postwoman.inactiveConsumerTopics",
          JSON.stringify(next),
        );
        return next;
      });
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Unable to subscribe",
      );
    }
  };

  const unsubscribeTopic = async (sessionId: string, topic: string) => {
    try {
      const session = consumerSessions.find((item) => item.id === sessionId);
      if (!session) return;
      await client.consumers.unsubscribe(sessionId, topic);
      setInactiveConsumerTopics((current) => {
        const item = {
          key: `${session.brokerProfileId}:${topic}`,
          topic,
          brokerProfileId: session.brokerProfileId,
        };
        const next = [
          ...current.filter((entry) => entry.key !== item.key),
          item,
        ];
        localStorage.setItem(
          "mqtt-postwoman.inactiveConsumerTopics",
          JSON.stringify(next),
        );
        return next;
      });
      await refresh();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Unable to unsubscribe",
      );
    }
  };

  const subscribeSavedTopic = async (item: InactiveConsumerTopic) => {
    try {
      const targetBroker = activeConnectionId;
      const hasConnectedBroker = Boolean(
        targetBroker &&
        brokerStatuses.some(
          (status) => status.profileId === targetBroker && status.connected,
        ),
      );
      if (!hasConnectedBroker) {
        toast.error("Connect to a broker before subscribing.");
        return;
      }
      await client.consumers.create({
        name: "consumer",
        brokerProfileId: targetBroker,
        topics: [item.topic],
        qos: consumerQos,
      });
      setTopicColors((current) => {
        const next = { ...current, [item.topic]: getTopicColor(item.topic) };
        localStorage.setItem(
          "mqtt-postwoman.topicColors",
          JSON.stringify(next),
        );
        return next;
      });
      setInactiveConsumerTopics((current) => {
        const next = current.filter((entry) => entry.key !== item.key);
        localStorage.setItem(
          "mqtt-postwoman.inactiveConsumerTopics",
          JSON.stringify(next),
        );
        return next;
      });
      await refresh();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Unable to subscribe",
      );
    }
  };

  const deleteSavedTopic = (key: string) => {
    setInactiveConsumerTopics((current) => {
      const next = current.filter((item) => item.key !== key);
      localStorage.setItem(
        "mqtt-postwoman.inactiveConsumerTopics",
        JSON.stringify(next),
      );
      return next;
    });
  };

  const saveEnvironment = async () => {
    if (envDraft.id) {
      await client.environments.update(envDraft.id, {
        name: envDraft.name,
        variablesJson: envDraft.variablesJson,
      });
    } else {
      await client.environments.create({
        name: envDraft.name,
        variablesJson: envDraft.variablesJson,
      });
    }
    await refresh();
    setAssetTab("environments");
  };

  const deleteEnvironment = async () => {
    if (!envDraft.id) return;
    await client.environments.remove(envDraft.id);
    setEnvDraft({
      id: "",
      name: "local",
      variablesJson: '{\n  "env": "local"\n}',
    });
    await refresh();
  };

  const saveBroker = async () => {
    setConnectionTestMessage(null);
    const { id: brokerId, ...brokerPayload } = brokerDraft;
    const payload = {
      ...brokerPayload,
      name: brokerDraft.name,
      validateCertificate: brokerDraft.validateCertificate,
      encryption: brokerDraft.encryption,
      username: brokerDraft.username || null,
      password: brokerDraft.password || null,
      clientId: brokerDraft.clientId || `mqtt-postwoman-${Date.now()}`,
      caCert: brokerDraft.caCert || null,
      clientCert: brokerDraft.clientCert || null,
      clientKey: brokerDraft.clientKey || null,
    };
    if (brokerId) {
      await client.brokers.update(brokerId, payload);
    } else {
      await client.brokers.create(payload);
    }
    await refresh();
    setConnectionView("list");
  };

  const connectBroker = async (brokerId: string) => {
    setError("");
    try {
      const activeConsumerSessionIds = consumerSessions
        .filter((session) => Boolean(session.active))
        .map((session) => session.id);
      await Promise.all(
        activeConsumerSessionIds.map((sessionId) =>
          client.consumers.remove(sessionId),
        ),
      );
      const otherConnectedIds = brokerStatuses
        .filter((status) => status.connected && status.profileId !== brokerId)
        .map((status) => status.profileId);
      await Promise.all(
        otherConnectedIds.map((profileId) =>
          client.brokers.disconnect(profileId),
        ),
      );
      setActiveConnectionId("");
      const status = await client.brokers.connect(brokerId);
      await refresh();
      if (status.connected) {
        setActiveConnectionId(brokerId);
      } else {
        toast.error(
          status.lastError?.trim() || "Unable to connect to MQTT broker",
        );
      }
    } catch (err) {
      toast.error(
        err instanceof Error && err.message.trim()
          ? err.message
          : "Unable to connect to MQTT broker",
      );
    }
  };

  const testBroker = async () => {
    setError("");
    setConnectionTestMessage(null);
    setConnectionTestPending(true);
    try {
      const { id: _brokerId, ...brokerPayload } = brokerDraft;
      await client.brokers.test({
        ...brokerPayload,
        name: brokerDraft.name,
        validateCertificate: brokerDraft.validateCertificate,
        encryption: brokerDraft.encryption,
        username: brokerDraft.username || null,
        password: brokerDraft.password || null,
        clientId: brokerDraft.clientId || undefined,
        caCert: brokerDraft.caCert || null,
        clientCert: brokerDraft.clientCert || null,
        clientKey: brokerDraft.clientKey || null,
      });
      setConnectionTestMessage({
        type: "success",
        text: "Test connection succeeded.",
      });
    } catch (err) {
      setConnectionTestMessage({
        type: "error",
        text:
          err instanceof Error && err.message.trim()
            ? err.message
            : "Unable to test connection",
      });
    } finally {
      setConnectionTestPending(false);
    }
  };

  const openNewConnection = () => {
    setBrokerDraft(emptyBrokerDraft());
    setConnectionTestMessage(null);
    setShowPassword(false);
    setConnectionView("form");
  };

  const openEditConnection = (broker: BrokerProfileRow) => {
    setConnectionTestMessage(null);
    setShowPassword(false);
    setBrokerDraft({
      id: broker.id,
      name: broker.name,
      host: broker.host,
      port: broker.port,
      protocol:
        broker.protocol === "ws" || broker.protocol === "wss" ? "ws" : "mqtt",
      validateCertificate: broker.validateCertificate !== 0,
      encryption:
        broker.encryption !== 0 ||
        broker.protocol === "mqtts" ||
        broker.protocol === "wss",
      username: broker.username ?? "",
      password: broker.password ?? "",
      clientId: broker.clientId,
      clean: Boolean(broker.clean),
      keepAlive: broker.keepAlive,
      reconnectPeriod: broker.reconnectPeriod,
      caCert: broker.caCert ?? "",
      clientCert: broker.clientCert ?? "",
      clientKey: broker.clientKey ?? "",
    });
    setConnectionView("form");
  };

  const cancelConnectionForm = () => {
    setConnectionView("list");
    setBrokerDraft(emptyBrokerDraft());
    setConnectionTestMessage(null);
    setShowPassword(false);
  };

  const disconnectBroker = async (brokerId: string) => {
    await client.brokers.disconnect(brokerId);
    if (activeConnectionId === brokerId) {
      setActiveConnectionId("");
    }
    await refresh();
  };

  const deleteBroker = async () => {
    if (!brokerDraft.id) return;
    await client.brokers.remove(brokerDraft.id);
    await refresh();
    setConnectionView("list");
    setBrokerDraft(emptyBrokerDraft());
  };

  const saveHelper = async () => {
    if (helperDraft.id) {
      await client.helpers.update(helperDraft.id, helperDraft);
    } else {
      await client.helpers.create(helperDraft);
    }
    await refresh();
  };

  const deleteHelper = async () => {
    if (!helperDraft.id) return;
    await client.helpers.remove(helperDraft.id);
    setHelperDraft({
      id: "",
      name: "requestId",
      kind: "uuid",
      configJson: "{}",
    });
    await refresh();
  };

  const currentEnvValue = parseJsonObject(envDraft.variablesJson);
  const selectedEnvJson = draft.environmentId
    ? (environments.find((env) => env.id === draft.environmentId)
        ?.variablesJson ?? "{}")
    : "{}";
  const resolvedPreview = useMemo(() => {
    return currentEnvValue
      ? JSON.stringify(currentEnvValue, null, 2)
      : envDraft.variablesJson;
  }, [currentEnvValue, envDraft.variablesJson]);

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">MP</div>
          <div>
            <div className="brand-title">MQTT Postwoman</div>
            <div className="brand-sub">Local-first MQTT control room</div>
          </div>
        </div>

        <div className="sidebar-panel">
          <div className="panel-header">
            <span>Collections</span>
            <button
              className="icon-button"
              aria-label="Create collection"
              title="Create collection"
              onClick={openCreateCollection}
            >
              +
            </button>
          </div>
          <div className="collection-list">
            {sortedCollections.map((collection) => {
              const collectionRequests = (bootstrap?.requests ?? []).filter(
                (request) => request.collectionId === collection.id,
              );
              const isExpanded = expandedCollectionIds.includes(collection.id);
              return (
                <div key={collection.id} className="collection-node">
                  <div
                    className={`collection-item ${collection.id === selectedCollectionId ? "active" : ""}`}
                  >
                    <button
                      className="collection-toggle"
                      aria-label={
                        isExpanded ? "Collapse collection" : "Expand collection"
                      }
                      title={
                        isExpanded ? "Collapse collection" : "Expand collection"
                      }
                      onClick={() => toggleCollection(collection.id)}
                    >
                      {isExpanded ? "⌄" : "›"}
                    </button>
                    <button
                      className="collection-main"
                      onClick={() => selectCollection(collection)}
                    >
                      <span className="collection-label">
                        <span>{collection.name}</span>
                        {favoriteCollectionIds.includes(collection.id) && (
                          <span className="favorite-mark">★</span>
                        )}
                      </span>
                      <small>{collectionRequests.length} requests</small>
                    </button>
                    <div className="collection-actions">
                      <button
                        className="icon-button"
                        aria-label="Add request"
                        title="Add request"
                        onClick={() => addRequestToCollection(collection)}
                      >
                        +
                      </button>
                      <button
                        className={`icon-button ${favoriteCollectionIds.includes(collection.id) ? "is-favorite" : ""}`}
                        aria-label="Add to favorites"
                        title="Add to favorites"
                        onClick={() => toggleFavoriteCollection(collection.id)}
                      >
                        ★
                      </button>
                      <button
                        className="icon-button"
                        aria-label="More collection actions"
                        title="More collection actions"
                        onClick={() =>
                          setCollectionMenuId((current) =>
                            current === collection.id ? null : collection.id,
                          )
                        }
                      >
                        ⋯
                      </button>
                      {collectionMenuId === collection.id && (
                        <div className="collection-menu">
                          <button
                            onClick={() => openEditCollection(collection)}
                          >
                            Edit
                          </button>
                          <button
                            className="danger-text"
                            onClick={() =>
                              askDeleteConfirmation(
                                "Delete collection",
                                "Delete this collection and all of its requests?",
                                () => deleteCollection(collection),
                              )
                            }
                          >
                            Delete
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                  {isExpanded && (
                    <div className="request-tree">
                      {collectionRequests.map((request) => (
                        <button
                          key={request.id}
                          className={`request-tree-item ${request.id === selectedRequestId ? "active" : ""}`}
                          onClick={() => selectRequest(request)}
                        >
                          <span className="request-method">MQTT</span>
                          {isRequestModified(
                            request,
                            requestDrafts[request.id],
                          ) && (
                            <span
                              className="request-modified-dot"
                              aria-label="Modified"
                              title="Modified"
                            />
                          )}
                          <span className="request-tree-name">
                            {request.name}
                          </span>
                        </button>
                      ))}
                      {collectionRequests.length === 0 && (
                        <small className="request-tree-empty">
                          No requests yet
                        </small>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </aside>

      <main className="workspace">
        <header className="topbar">
          <div>
            <div className="eyebrow">MQTT Workspace</div>
            <h1>{selectedCollection?.name ?? "No collection selected"}</h1>
          </div>
          <div className="topbar-actions">
            <div className="status-row">
              {activeConnection ? (
                <span className="connection-status-pill">
                  <strong>{activeConnection.name}</strong>
                  <i
                    className={
                      activeConnectionStatus?.connected
                        ? "status-dot connected"
                        : "status-dot disconnected"
                    }
                  />
                  {activeConnectionStatus?.connected
                    ? "Connected"
                    : "Disconnected"}
                </span>
              ) : (
                <span className="connection-status-pill no-connection">
                  No Connection
                </span>
              )}
            </div>
            <div className="tab-row">
              <button
                className={mainTab === "publishers" ? "active" : ""}
                onClick={() => setMainTab("publishers")}
              >
                Publishers
              </button>
              <button
                className={mainTab === "consumers" ? "active" : ""}
                onClick={() => setMainTab("consumers")}
              >
                Consumers
                {unreadConsumerMessages > 0 && (
                  <span className="nav-badge">
                    {unreadConsumerMessages > 99
                      ? "99+"
                      : unreadConsumerMessages}
                  </span>
                )}
              </button>
              <button
                className={mainTab === "connections" ? "active" : ""}
                onClick={() => {
                  setConnectionView("list");
                  setMainTab("connections");
                }}
              >
                Connections
              </button>
            </div>
          </div>
        </header>

        {mainTab === "publishers" ? (
          <section className="editor-grid">
            <div
              className={`card editor-card ${!selectedRequestId ? "request-editor-empty" : ""}`}
            >
              {!selectedRequestId && (
                <div className="request-empty-state">
                  <div className="empty-state-icon">⌁</div>
                  <strong>Select a request</strong>
                  <span>
                    Choose an MQTT request from the collection tree to view its
                    details.
                  </span>
                </div>
              )}
              <div className="request-toolbar">
                <div>
                  <div className="request-name-line">
                    <input
                      className="request-name-input"
                      aria-label="Request name"
                      value={draft.name}
                      onChange={(event) =>
                        setDraft({ ...draft, name: event.target.value })
                      }
                    />
                    {selectedRequestModified && (
                      <span className="modified-label">(Modified)</span>
                    )}
                  </div>
                  <div className="card-sub">MQTT message</div>
                </div>
                <div className="button-row">
                  <button onClick={saveRequest}>Save</button>
                  <button
                    onClick={() =>
                      askDeleteConfirmation(
                        "Delete request",
                        "Delete this MQTT request?",
                        deleteRequest,
                      )
                    }
                    className="danger"
                  >
                    Delete
                  </button>
                </div>
              </div>

              <div
                className={`request-topic-row ${topicValidationError ? "topic-invalid" : ""}`}
              >
                <div className="topic-field">
                  <TopicAutocomplete
                    label="Topic"
                    value={draft.topic}
                    topics={allTopics}
                    onChange={(topic) => {
                      setTopicValidationError(false);
                      setDraft({ ...draft, topic });
                    }}
                  />
                </div>
                <button
                  className="topic-clear"
                  aria-label="Clear topic"
                  title="Clear topic"
                  onClick={() => setDraft({ ...draft, topic: "" })}
                >
                  ×
                </button>
              </div>

              <div className="request-options-row">
                <div className="payload-format-tabs">
                  {(["raw", "xml", "json"] as PayloadFormat[]).map((format) => (
                    <button
                      key={format}
                      className={payloadFormat === format ? "active" : ""}
                      onClick={() => setPayloadFormat(format)}
                    >
                      {format}
                    </button>
                  ))}
                  {payloadFormat !== "raw" && (
                    <button
                      className="beautify-link"
                      onClick={() => {
                        if (payloadFormat === "json") {
                          try {
                            setDraft({
                              ...draft,
                              payloadTemplate: JSON.stringify(
                                JSON.parse(draft.payloadTemplate),
                                null,
                                2,
                              ),
                            });
                          } catch {
                            toast.error("Payload is not valid JSON.");
                          }
                        } else {
                          setDraft({
                            ...draft,
                            payloadTemplate: beautifyXml(draft.payloadTemplate),
                          });
                        }
                      }}
                    >
                      Beautify
                    </button>
                  )}
                </div>
                <div className="request-send-actions">
                  <button onClick={publishRequest} className="publish-button">
                    Publish
                  </button>
                </div>
              </div>

              <textarea
                className="payload-editor"
                rows={15}
                value={draft.payloadTemplate}
                spellCheck={false}
                onChange={(event) =>
                  setDraft({ ...draft, payloadTemplate: event.target.value })
                }
              />

              <div className="request-controls">
                <label>
                  Batch
                  <input
                    type="number"
                    min={1}
                    max={1000}
                    step={1}
                    value={batchCount}
                    onChange={(event) =>
                      setBatchCount(
                        Math.min(
                          1000,
                          Math.max(1, Number(event.target.value) || 1),
                        ),
                      )
                    }
                  />
                </label>
                <label>
                  Environment
                  <select
                    value={draft.environmentId}
                    onChange={(event) =>
                      setDraft({ ...draft, environmentId: event.target.value })
                    }
                  >
                    <option value="">No env</option>
                    {environments.map((environment) => (
                      <option key={environment.id} value={environment.id}>
                        {environment.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  QoS
                  <select
                    value={draft.qos}
                    onChange={(event) =>
                      setDraft({ ...draft, qos: Number(event.target.value) })
                    }
                  >
                    <option value={0}>0</option>
                    <option value={1}>1</option>
                    <option value={2}>2</option>
                  </select>
                </label>
                <label className="retain-control">
                  <input
                    type="checkbox"
                    checked={draft.retain}
                    onChange={(event) =>
                      setDraft({ ...draft, retain: event.target.checked })
                    }
                  />
                  Retain
                </label>
              </div>
            </div>

            <div className="card inspector-card">
              <div className="tab-row">
                <button
                  className={rightTab === "history" ? "active" : ""}
                  onClick={() => setRightTab("history")}
                >
                  History
                </button>
                <button
                  className={rightTab === "functions" ? "active" : ""}
                  onClick={() => setRightTab("functions")}
                >
                  Functions
                </button>
              </div>

              {false && (
                <div className="stack">
                  <div className="card-section">
                    <div className="section-head">
                      <span>Start consumer</span>
                      <button onClick={startConsumer} className="primary">
                        Subscribe
                      </button>
                    </div>
                    <label>
                      Topics comma separated
                      <div className="topic-input-with-color">
                        <TopicAutocomplete
                          label="Topics comma separated"
                          value={consumerTopics}
                          topics={allTopics}
                          onChange={setConsumerTopics}
                        />
                        <input
                          className="topic-color-picker"
                          type="color"
                          value={consumerTopicColor}
                          aria-label="Choose topic color"
                          title="Choose topic color"
                          onChange={(event) => {
                            setConsumerTopicColor(event.target.value);
                            localStorage.setItem(
                              "mqtt-postwoman.consumerTopicColor",
                              event.target.value,
                            );
                          }}
                        />
                      </div>
                    </label>
                    <label>
                      QoS
                      <select
                        value={consumerQos}
                        onChange={(event) =>
                          setConsumerQos(Number(event.target.value))
                        }
                      >
                        <option value={0}>0</option>
                        <option value={1}>1</option>
                        <option value={2}>2</option>
                      </select>
                    </label>
                  </div>

                  <div className="card-section">
                    <div className="section-head">
                      <span>Active sessions</span>
                    </div>
                    <div className="session-list">
                      {consumerSessions.flatMap((session) =>
                        (JSON.parse(session.topicsJson) as string[]).map(
                          (topic) => (
                            <div
                              key={`${session.id}:${topic}`}
                              className="session-row consumer-session-topic"
                              style={{ borderLeftColor: getTopicColor(topic) }}
                            >
                              <strong>{topic}</strong>
                              <button
                                onClick={() =>
                                  unsubscribeTopic(session.id, topic)
                                }
                              >
                                Unsubscribe
                              </button>
                            </div>
                          ),
                        ),
                      )}
                      {inactiveConsumerTopics
                        .filter((item) => !activeTopicKeys.has(item.key))
                        .map((item) => (
                          <div
                            key={`inactive:${item.key}`}
                            className="session-row consumer-session-topic inactive-session"
                            style={{
                              borderLeftColor: getTopicColor(item.topic),
                            }}
                          >
                            <strong>{item.topic}</strong>
                            <div className="button-row">
                              <button onClick={() => subscribeSavedTopic(item)}>
                                Subscribe
                              </button>
                              <button
                                className="danger"
                                onClick={() =>
                                  askDeleteConfirmation(
                                    "Delete saved topic",
                                    `Delete saved topic "${item.topic}"?`,
                                    () => deleteSavedTopic(item.key),
                                  )
                                }
                              >
                                Delete
                              </button>
                            </div>
                          </div>
                        ))}
                    </div>
                  </div>

                  <div className="card-section">
                    <div className="section-head">
                      <span>Live messages</span>
                    </div>
                    <div className="message-list">
                      {liveMessages.map((message) => (
                        <div key={`${message.log.id}`} className="message-row">
                          <strong>{message.topic}</strong>
                          <small>
                            {typeof message.payloadJson === "object"
                              ? toPrettyJson(message.payloadJson)
                              : message.payloadText}
                          </small>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {rightTab === "history" && (
                <div className="stack">
                  <div className="card-section">
                    <div className="section-head">
                      <div className="section-title-stack">
                        <span>Publish and consume log</span>
                        <small>
                          (publish: {publishLogCount}, consume:{" "}
                          {consumeLogCount})
                        </small>
                      </div>
                      <button
                        onClick={clearHistory}
                        className="danger"
                        disabled={!logs.length}
                      >
                        Clear
                      </button>
                    </div>
                    <div className="log-list">
                      {logs.map((log) => (
                        <div
                          key={log.id}
                          className={`log-row ${log.direction}`}
                        >
                          <div className="log-top">
                            <strong>{log.topic}</strong>
                            <span>{log.direction}</span>
                          </div>
                          <small>{formatTime(log.createdAt)}</small>
                          <pre>{log.payloadText}</pre>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {rightTab === "functions" && (
                <div className="stack">
                  <div className="card-section function-guide">
                    <div className="section-head">
                      <span>Built-in functions</span>
                    </div>
                    <p>
                      Use these tokens directly inside topic or payload
                      templates.
                    </p>
                    <div className="function-list">
                      <div className="function-row">
                        <code>{`{{now[:format]}}`}</code>
                        <span>
                          Current time, optionally formatted with Day.js tokens.
                        </span>
                        <pre>{`{"publishDate":"{{now:yyyy-MM-dd}}"}`}</pre>
                      </div>
                      <div className="function-row">
                        <code>{`{{uuid}}`}</code>
                        <span>Generates a new UUID for each message.</span>
                        <pre>{`{"requestId":"{{uuid}}"}`}</pre>
                      </div>
                      <div className="function-row">
                        <code>{`{{sequence:<start>:<numberOfDigits>}}`}</code>
                        <span>
                          Generates a zero-padded sequence from the given start
                          value.
                        </span>
                        <pre>{`{"sequence":"{{sequence:1:6}}"}`}</pre>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {rightTab === "assets" && (
                <div className="stack">
                  <div className="tab-row compact">
                    <button
                      className={assetTab === "environments" ? "active" : ""}
                      onClick={() => setAssetTab("environments")}
                    >
                      Envs
                    </button>
                    <button
                      className={assetTab === "brokers" ? "active" : ""}
                      onClick={() => setAssetTab("brokers")}
                    >
                      Brokers
                    </button>
                    <button
                      className={assetTab === "helpers" ? "active" : ""}
                      onClick={() => setAssetTab("helpers")}
                    >
                      Helpers
                    </button>
                  </div>

                  {assetTab === "environments" && (
                    <div className="card-section">
                      <div className="section-head">
                        <span>Environment CRUD</span>
                        <div className="button-row">
                          <button onClick={saveEnvironment} className="primary">
                            Save env
                          </button>
                          <button
                            onClick={() =>
                              askDeleteConfirmation(
                                "Delete environment",
                                "Delete this environment?",
                                deleteEnvironment,
                              )
                            }
                            className="danger"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                      <label>
                        Name
                        <input
                          value={envDraft.name}
                          onChange={(event) =>
                            setEnvDraft({
                              ...envDraft,
                              name: event.target.value,
                            })
                          }
                        />
                      </label>
                      <label>
                        Variables JSON
                        <textarea
                          rows={10}
                          value={envDraft.variablesJson}
                          onChange={(event) =>
                            setEnvDraft({
                              ...envDraft,
                              variablesJson: event.target.value,
                            })
                          }
                        />
                      </label>
                      <div className="mini-list">
                        {environments.map((environment) => (
                          <button
                            key={environment.id}
                            className="mini-row"
                            onClick={() =>
                              setEnvDraft({
                                id: environment.id,
                                name: environment.name,
                                variablesJson: environment.variablesJson,
                              })
                            }
                          >
                            <span>{environment.name}</span>
                            <small>{environment.id.slice(0, 8)}</small>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {assetTab === "brokers" && (
                    <div className="card-section">
                      <div className="section-head">
                        <span>Broker profile CRUD</span>
                        <div className="button-row">
                          <button onClick={saveBroker} className="primary">
                            Save broker
                          </button>
                          <button
                            onClick={() =>
                              askDeleteConfirmation(
                                "Delete broker",
                                "Delete this broker connection?",
                                deleteBroker,
                              )
                            }
                            className="danger"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                      <div className="form-grid">
                        <label>
                          Name
                          <input
                            value={brokerDraft.name}
                            onChange={(event) =>
                              setBrokerDraft({
                                ...brokerDraft,
                                name: event.target.value,
                              })
                            }
                          />
                        </label>
                        <label>
                          Host
                          <input
                            value={brokerDraft.host}
                            onChange={(event) =>
                              setBrokerDraft({
                                ...brokerDraft,
                                host: event.target.value,
                              })
                            }
                          />
                        </label>
                        <label>
                          Port
                          <input
                            type="number"
                            value={brokerDraft.port}
                            onChange={(event) =>
                              setBrokerDraft({
                                ...brokerDraft,
                                port: Number(event.target.value),
                              })
                            }
                          />
                        </label>
                        <label>
                          Protocol
                          <select
                            value={brokerDraft.protocol}
                            onChange={(event) =>
                              setBrokerDraft({
                                ...brokerDraft,
                                protocol: event.target.value,
                              })
                            }
                          >
                            <option value="mqtt">mqtt://</option>
                            <option value="ws">ws://</option>
                          </select>
                        </label>
                        <label>
                          Client ID
                          <input
                            value={brokerDraft.clientId}
                            onChange={(event) =>
                              setBrokerDraft({
                                ...brokerDraft,
                                clientId: event.target.value,
                              })
                            }
                          />
                        </label>
                        <label>
                          Username
                          <input
                            value={brokerDraft.username}
                            onChange={(event) =>
                              setBrokerDraft({
                                ...brokerDraft,
                                username: event.target.value,
                              })
                            }
                          />
                        </label>
                        <label>
                          Password
                          <input
                            value={brokerDraft.password}
                            onChange={(event) =>
                              setBrokerDraft({
                                ...brokerDraft,
                                password: event.target.value,
                              })
                            }
                          />
                        </label>
                        <label>
                          Keep alive
                          <input
                            type="number"
                            value={brokerDraft.keepAlive}
                            onChange={(event) =>
                              setBrokerDraft({
                                ...brokerDraft,
                                keepAlive: Number(event.target.value),
                              })
                            }
                          />
                        </label>
                      </div>
                      <div className="inline-row">
                        <label className="inline mb-3">
                          <input
                            type="checkbox"
                            checked={brokerDraft.clean}
                            onChange={(event) =>
                              setBrokerDraft({
                                ...brokerDraft,
                                clean: event.target.checked,
                              })
                            }
                          />
                          Clean session
                        </label>
                        <label className="inline switch-control mb-3">
                          <input
                            type="checkbox"
                            checked={brokerDraft.validateCertificate}
                            onChange={(event) =>
                              setBrokerDraft({
                                ...brokerDraft,
                                validateCertificate: event.target.checked,
                              })
                            }
                          />
                          Validate Certificate
                        </label>
                        <label className="inline switch-control mb-3">
                          <input
                            type="checkbox"
                            checked={brokerDraft.encryption}
                            onChange={(event) =>
                              setBrokerDraft({
                                ...brokerDraft,
                                encryption: event.target.checked,
                              })
                            }
                          />
                          Encryption (TLS)
                        </label>
                        <label className="inline">
                          Reconnect period
                          <input
                            type="number"
                            value={brokerDraft.reconnectPeriod}
                            onChange={(event) =>
                              setBrokerDraft({
                                ...brokerDraft,
                                reconnectPeriod: Number(event.target.value),
                              })
                            }
                          />
                        </label>
                      </div>
                      <div className="mini-list">
                        {brokers.map((broker) => (
                          <button
                            key={broker.id}
                            className="mini-row"
                            onClick={() =>
                              setBrokerDraft({
                                id: broker.id,
                                name: broker.name,
                                host: broker.host,
                                port: broker.port,
                                protocol:
                                  broker.protocol === "ws" ||
                                  broker.protocol === "wss"
                                    ? "ws"
                                    : "mqtt",
                                validateCertificate:
                                  broker.validateCertificate !== 0,
                                encryption:
                                  broker.encryption !== 0 ||
                                  broker.protocol === "mqtts" ||
                                  broker.protocol === "wss",
                                username: broker.username ?? "",
                                password: broker.password ?? "",
                                clientId: broker.clientId,
                                clean: Boolean(broker.clean),
                                keepAlive: broker.keepAlive,
                                reconnectPeriod: broker.reconnectPeriod,
                                caCert: broker.caCert ?? "",
                                clientCert: broker.clientCert ?? "",
                                clientKey: broker.clientKey ?? "",
                              })
                            }
                          >
                            <span>{broker.name}</span>
                            <small>
                              {broker.host}:{broker.port} · {broker.protocol}
                            </small>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {assetTab === "helpers" && (
                    <div className="card-section">
                      <div className="section-head">
                        <span>Template helper CRUD</span>
                        <div className="button-row">
                          <button onClick={saveHelper} className="primary">
                            Save helper
                          </button>
                          <button
                            onClick={() =>
                              askDeleteConfirmation(
                                "Delete helper",
                                "Delete this template helper?",
                                deleteHelper,
                              )
                            }
                            className="danger"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                      <div className="form-grid two-col">
                        <label>
                          Name
                          <input
                            value={helperDraft.name}
                            onChange={(event) =>
                              setHelperDraft({
                                ...helperDraft,
                                name: event.target.value,
                              })
                            }
                          />
                        </label>
                        <label>
                          Kind
                          <select
                            value={helperDraft.kind}
                            onChange={(event) =>
                              setHelperDraft({
                                ...helperDraft,
                                kind: event.target
                                  .value as TemplateHelperRow["kind"],
                              })
                            }
                          >
                            <option value="literal">literal</option>
                            <option value="now">now</option>
                            <option value="uuid">uuid</option>
                            <option value="randomInt">randomInt</option>
                            <option value="env">env</option>
                          </select>
                        </label>
                      </div>
                      <label>
                        Config JSON
                        <textarea
                          rows={10}
                          value={helperDraft.configJson}
                          onChange={(event) =>
                            setHelperDraft({
                              ...helperDraft,
                              configJson: event.target.value,
                            })
                          }
                        />
                      </label>
                      <div className="mini-list">
                        {helpers.map((helper) => (
                          <button
                            key={helper.id}
                            className="mini-row"
                            onClick={() =>
                              setHelperDraft({
                                id: helper.id,
                                name: helper.name,
                                kind: helper.kind,
                                configJson: helper.configJson,
                              })
                            }
                          >
                            <span>{helper.name}</span>
                            <small>{helper.kind}</small>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </section>
        ) : mainTab === "consumers" ? (
          <section className="consumer-screen">
            <div className="card consumer-card">
              <div className="card-head">
                <div>
                  <div className="card-title">Consumers</div>
                  <div className="card-sub">
                    Subscribe to MQTT topics and inspect incoming messages in
                    realtime.
                  </div>
                </div>
                <button onClick={() => setMainTab("publishers")}>
                  Back to publishers
                </button>
              </div>
              <div className="consumer-layout">
                <div className="card-section">
                  <div className="section-head">
                    <span>Start consumer</span>
                    <button onClick={startConsumer} className="primary">
                      Subscribe
                    </button>
                  </div>
                  <div className="topic-input-with-color">
                    <TopicAutocomplete
                      label="Topics comma separated"
                      value={consumerTopics}
                      topics={allTopics}
                      onChange={setConsumerTopics}
                    />
                    <input
                      className="topic-color-picker"
                      type="color"
                      value={consumerTopicColor}
                      aria-label="Choose topic color"
                      title="Choose topic color"
                      onChange={(event) => {
                        setConsumerTopicColor(event.target.value);
                        localStorage.setItem(
                          "mqtt-postwoman.consumerTopicColor",
                          event.target.value,
                        );
                      }}
                    />
                  </div>
                  <label>
                    QoS
                    <select
                      value={consumerQos}
                      onChange={(event) =>
                        setConsumerQos(Number(event.target.value))
                      }
                    >
                      <option value={0}>0</option>
                      <option value={1}>1</option>
                      <option value={2}>2</option>
                    </select>
                  </label>
                </div>
                <div className="card-section">
                  <div className="section-head">
                    <span>Active sessions</span>
                  </div>
                  <div className="session-list">
                    {consumerSessions.flatMap((session) =>
                      (JSON.parse(session.topicsJson) as string[]).map(
                        (topic) => (
                          <div
                            key={`${session.id}:${topic}`}
                            className="session-row consumer-session-topic"
                            style={{ borderLeftColor: getTopicColor(topic) }}
                          >
                            <strong>{topic}</strong>
                            <button
                              onClick={() =>
                                unsubscribeTopic(session.id, topic)
                              }
                            >
                              Unsubscribe
                            </button>
                          </div>
                        ),
                      ),
                    )}
                    {inactiveConsumerTopics
                      .filter((item) => !activeTopicKeys.has(item.key))
                      .map((item) => (
                        <div
                          key={`inactive:${item.key}`}
                          className="session-row consumer-session-topic inactive-session"
                          style={{ borderLeftColor: getTopicColor(item.topic) }}
                        >
                          <strong>{item.topic}</strong>
                          <div className="button-row">
                            <button onClick={() => subscribeSavedTopic(item)}>
                              Subscribe
                            </button>
                            <button
                              className="danger"
                              onClick={() =>
                                askDeleteConfirmation(
                                  "Delete saved topic",
                                  `Delete saved topic "${item.topic}"?`,
                                  () => deleteSavedTopic(item.key),
                                )
                              }
                            >
                              Delete
                            </button>
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              </div>
              <div className="card-section live-consumer-messages">
                <div className="section-head">
                  <span>Live messages</span>
                </div>
                <div className="message-list">
                  {liveMessages.map((message) => (
                    <div
                      key={message.log.id}
                      className="message-row"
                      style={{ borderLeftColor: getTopicColor(message.topic) }}
                    >
                      <strong>{message.topic}</strong>
                      <small>
                        {typeof message.payloadJson === "object"
                          ? toPrettyJson(message.payloadJson)
                          : message.payloadText}
                      </small>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>
        ) : (
          <section className="connections-grid">
            <div className="card connection-manager">
              <div className="card-head">
                <div className="mt-3">
                  <div className="card-title">Connections</div>
                  <div className="card-sub">
                    Choose one active connection for the workspace, or
                    create/edit connection profiles here.
                  </div>
                </div>
                <div className="button-row">
                  {connectionView === "list" ? (
                    <>
                      <button onClick={openNewConnection} className="primary">
                        New connection
                      </button>
                      <button onClick={() => setMainTab("publishers")}>
                        Back to publishers
                      </button>
                    </>
                  ) : (
                    <button onClick={() => setConnectionView("list")}>
                      Back to list
                    </button>
                  )}
                </div>
              </div>

              {connectionView === "list" ? (
                <div className="connection-list mt-3">
                  {brokers.length === 0 ? (
                    <div className="empty-state">
                      <strong>No connections yet</strong>
                      <small>Click New connection to add one.</small>
                    </div>
                  ) : (
                    brokers.map((broker) => {
                      const status = brokerStatuses.find(
                        (item) => item.profileId === broker.id,
                      );
                      const isActive = broker.id === activeConnectionId;
                      return (
                        <div
                          key={broker.id}
                          className={`connection-row ${isActive ? "active" : ""}`}
                        >
                          <div className="connection-details">
                            <strong className="connection-name">
                              {broker.name}
                            </strong>
                            <small className="connection-endpoint">
                              {broker.host}:{broker.port} · {broker.protocol}
                            </small>
                            <small
                              className={
                                status?.connected
                                  ? "connection-status connected"
                                  : "connection-status"
                              }
                            >
                              {status?.connected ? "connected" : "disconnected"}
                              {status?.lastError
                                ? ` · ${status.lastError}`
                                : ""}
                            </small>
                          </div>
                          <div className="button-row">
                            <button onClick={() => openEditConnection(broker)}>
                              Edit
                            </button>
                            {status?.connected && (
                              <button
                                className="danger"
                                onClick={() => disconnectBroker(broker.id)}
                              >
                                Disconnect
                              </button>
                            )}
                            <button
                              className={
                                status?.connected ? "connected" : "primary"
                              }
                              disabled={status?.connected === true}
                              onClick={() => connectBroker(broker.id)}
                            >
                              {status?.connected ? "Connected" : "Connect"}
                            </button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              ) : (
                <div className="connections-form">
                  <div className="section-head">
                    <span>
                      {brokerDraft.id ? "Edit connection" : "Create connection"}
                    </span>
                  </div>
                  <div className="connection-primary-row">
                    <label className="connection-name-field">
                      Name
                      <input
                        value={brokerDraft.name}
                        onChange={(event) =>
                          setBrokerDraft({
                            ...brokerDraft,
                            name: event.target.value,
                          })
                        }
                      />
                    </label>
                    <label className="inline switch-control mb-3">
                      <input
                        type="checkbox"
                        checked={brokerDraft.validateCertificate}
                        onChange={(event) =>
                          setBrokerDraft({
                            ...brokerDraft,
                            validateCertificate: event.target.checked,
                          })
                        }
                      />
                      Validate certificate
                    </label>
                    <label className="inline switch-control mb-3">
                      <input
                        type="checkbox"
                        checked={brokerDraft.encryption}
                        onChange={(event) =>
                          setBrokerDraft({
                            ...brokerDraft,
                            encryption: event.target.checked,
                          })
                        }
                      />
                      Encryption (TLS)
                    </label>
                  </div>
                  <div className="connection-endpoint-row">
                    <label className="connection-protocol-field">
                      Protocol
                      <select
                        value={brokerDraft.protocol}
                        onChange={(event) =>
                          setBrokerDraft({
                            ...brokerDraft,
                            protocol: event.target.value,
                          })
                        }
                      >
                        <option value="mqtt">mqtt://</option>
                        <option value="ws">ws://</option>
                      </select>
                    </label>
                    <label>
                      Host
                      <input
                        value={brokerDraft.host}
                        onChange={(event) =>
                          setBrokerDraft({
                            ...brokerDraft,
                            host: event.target.value,
                          })
                        }
                      />
                    </label>
                    <label className="connection-port-field">
                      Port
                      <input
                        type="number"
                        value={brokerDraft.port}
                        onChange={(event) =>
                          setBrokerDraft({
                            ...brokerDraft,
                            port: Number(event.target.value),
                          })
                        }
                      />
                    </label>
                  </div>
                  <div className="connection-credentials-row">
                    <label>
                      Client ID
                      <input
                        value={brokerDraft.clientId}
                        onChange={(event) =>
                          setBrokerDraft({
                            ...brokerDraft,
                            clientId: event.target.value,
                          })
                        }
                      />
                    </label>
                    <label>
                      Username
                      <input
                        value={brokerDraft.username}
                        onChange={(event) =>
                          setBrokerDraft({
                            ...brokerDraft,
                            username: event.target.value,
                          })
                        }
                      />
                    </label>
                    <label>
                      Password
                      <span className="password-field">
                        <input
                          type={showPassword ? "text" : "password"}
                          value={brokerDraft.password}
                          onChange={(event) =>
                            setBrokerDraft({
                              ...brokerDraft,
                              password: event.target.value,
                            })
                          }
                        />
                        <button
                          type="button"
                          className="password-toggle"
                          aria-label={
                            showPassword ? "Hide password" : "Show password"
                          }
                          title={
                            showPassword ? "Hide password" : "Show password"
                          }
                          onClick={() => setShowPassword((current) => !current)}
                        >
                          <svg viewBox="0 0 24 24" aria-hidden="true">
                            <path d="M2.5 12s3.5-5 9.5-5 9.5 5 9.5 5-3.5 5-9.5 5-9.5-5-9.5-5Z" />
                            <circle cx="12" cy="12" r="2.5" />
                            {!showPassword && <path d="m4 4 16 16" />}
                          </svg>
                        </button>
                      </span>
                    </label>
                  </div>
                  <div className="connection-advanced-row">
                    <label>
                      Keep alive
                      <input
                        type="number"
                        value={brokerDraft.keepAlive}
                        onChange={(event) =>
                          setBrokerDraft({
                            ...brokerDraft,
                            keepAlive: Number(event.target.value),
                          })
                        }
                      />
                    </label>
                    <label className="inline mb-3">
                      <input
                        type="checkbox"
                        checked={brokerDraft.clean}
                        onChange={(event) =>
                          setBrokerDraft({
                            ...brokerDraft,
                            clean: event.target.checked,
                          })
                        }
                      />
                      Clean session
                    </label>
                    <label>
                      Reconnect period
                      <input
                        type="number"
                        value={brokerDraft.reconnectPeriod}
                        onChange={(event) =>
                          setBrokerDraft({
                            ...brokerDraft,
                            reconnectPeriod: Number(event.target.value),
                          })
                        }
                      />
                    </label>
                  </div>
                  <div className="connection-form-actions">
                    <button
                      onClick={testBroker}
                      disabled={connectionTestPending}
                    >
                      {connectionTestPending ? "Testing..." : "Test connection"}
                    </button>
                    <button onClick={saveBroker} className="primary">
                      Save
                    </button>
                    <button onClick={cancelConnectionForm}>Cancel</button>
                    {brokerDraft.id && (
                      <button
                        onClick={() =>
                          askDeleteConfirmation(
                            "Delete connection",
                            "Delete this connection?",
                            deleteBroker,
                          )
                        }
                        className="danger"
                      >
                        Delete
                      </button>
                    )}
                  </div>
                  {connectionTestMessage && (
                    <div
                      className={`connection-test-alert ${connectionTestMessage.type}`}
                      role="alert"
                    >
                      {connectionTestMessage.text}
                    </div>
                  )}
                </div>
              )}
            </div>
          </section>
        )}

        {error && <div className="error-banner">{error}</div>}
      </main>
      {collectionModal && (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={() => setCollectionModal(null)}
        >
          <div
            className="modal-card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="collection-modal-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="section-head">
              <div>
                <div id="collection-modal-title" className="card-title">
                  {collectionModal === "create"
                    ? "New collection"
                    : "Edit collection"}
                </div>
                <div className="card-sub">
                  Organize requests into a reusable MQTT collection.
                </div>
              </div>
              <button
                className="icon-button"
                aria-label="Close"
                onClick={() => setCollectionModal(null)}
              >
                ×
              </button>
            </div>
            <label>
              Name
              <input
                autoFocus
                value={collectionDraft.name}
                onChange={(event) =>
                  setCollectionDraft({
                    ...collectionDraft,
                    name: event.target.value,
                  })
                }
              />
            </label>
            <label>
              Description
              <textarea
                rows={4}
                value={collectionDraft.description}
                onChange={(event) =>
                  setCollectionDraft({
                    ...collectionDraft,
                    description: event.target.value,
                  })
                }
              />
            </label>
            <div className="button-row modal-actions">
              <button onClick={() => setCollectionModal(null)}>Cancel</button>
              <button
                className="primary"
                onClick={saveCollection}
                disabled={!collectionDraft.name.trim()}
              >
                {collectionModal === "create"
                  ? "Create collection"
                  : "Save changes"}
              </button>
            </div>
          </div>
        </div>
      )}
      {deleteConfirmation && (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={() => setDeleteConfirmation(null)}
        >
          <div
            className="modal-card confirm-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-modal-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div>
              <div id="delete-modal-title" className="card-title">
                {deleteConfirmation.title}
              </div>
              <div className="card-sub">{deleteConfirmation.message}</div>
            </div>
            <div className="button-row modal-actions">
              <button onClick={() => setDeleteConfirmation(null)}>
                Cancel
              </button>
              <button className="danger" onClick={() => void confirmDelete()}>
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
      <ToastContainer
        position="top-right"
        autoClose={3500}
        newestOnTop
        closeOnClick
        pauseOnFocusLoss
      />
    </div>
  );
}
