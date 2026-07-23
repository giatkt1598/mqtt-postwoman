import { DraftRequest, RequestRow } from "../models";

export function emptyDraft(
  collectionId = "",
  brokerProfileId = "",
  environmentId = "",
): DraftRequest {
  return {
    collectionId,
    name: "New request",
    topic: "",
    payloadTemplate: '{"publishDate":"{{now}}"}',
    qos: 0,
    retain: false,
    brokerProfileId,
    environmentId,
  };
}

export function requestToDraft(request: RequestRow): DraftRequest {
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

export function isRequestModified(
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
