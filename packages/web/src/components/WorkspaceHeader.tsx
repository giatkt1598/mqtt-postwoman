import type { ReactNode } from "react";
import { useWorkspaceContext } from "../contexts";

export type WorkspaceTab =
  | "publishers"
  | "consumers"
  | "variables"
  | "connections";

interface ConnectionSummary {
  name: string;
}

interface ConnectionStatus {
  connected: boolean;
}

export interface WorkspaceHeaderProps {
  selectedCollectionName: string | undefined;
  activeConnection: ConnectionSummary | null;
  activeConnectionStatus: ConnectionStatus | undefined;
  mainTab: WorkspaceTab;
  unreadConsumerMessages: number;
  onTabChange: (tab: WorkspaceTab) => void;
  onOpenConnections: () => void;
}

export function WorkspaceHeader(): ReactNode {
  const {
    selectedCollectionName,
    activeConnection,
    activeConnectionStatus,
    mainTab,
    unreadConsumerMessages,
    onTabChange,
    onOpenConnections,
  } = useWorkspaceContext();
  return (
    <header className="topbar">
      <div>
        <div className="eyebrow">MQTT Workspace</div>
        <h1>{selectedCollectionName ?? "No collection selected"}</h1>
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
              {activeConnectionStatus?.connected ? "Connected" : "Disconnected"}
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
            onClick={() => onTabChange("publishers")}
          >
            Publishers
          </button>
          <button
            className={mainTab === "consumers" ? "active" : ""}
            onClick={() => onTabChange("consumers")}
          >
            Consumers
            {unreadConsumerMessages > 0 && (
              <span className="nav-badge">
                {unreadConsumerMessages > 99 ? "99+" : unreadConsumerMessages}
              </span>
            )}
          </button>
          <button
            className={mainTab === "variables" ? "active" : ""}
            onClick={() => onTabChange("variables")}
          >
            Variables
          </button>
          <button
            className={mainTab === "connections" ? "active" : ""}
            onClick={onOpenConnections}
          >
            Connections
          </button>
        </div>
      </div>
    </header>
  );
}
