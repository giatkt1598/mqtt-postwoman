import { useRef, useState } from "react";

export type WorkspaceTab = "publishers" | "consumers" | "variables" | "connections";
export type ConnectionView = "list" | "form";

export function useWorkspaceNavigation() {
  const [mainTab, setMainTab] = useState<WorkspaceTab>("publishers");
  const mainTabRef = useRef<WorkspaceTab>("publishers");
  const [selectedCollectionId, setSelectedCollectionId] = useState("");
  const [selectedRequestId, setSelectedRequestId] = useState("");
  const [connectionView, setConnectionView] =
    useState<ConnectionView>("list");

  return {
    mainTab,
    setMainTab,
    mainTabRef,
    selectedCollectionId,
    setSelectedCollectionId,
    selectedRequestId,
    setSelectedRequestId,
    connectionView,
    setConnectionView,
  };
}
