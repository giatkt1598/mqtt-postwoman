import { createContext, useContext, type ReactNode } from "react";
import type { CollectionSidebarProps, WorkspaceHeaderProps } from "../components";
import type { ConnectionsPageProps, ConsumersPageProps } from "../pages";

export type WorkspaceContextValue = CollectionSidebarProps &
  ConsumersPageProps &
  ConnectionsPageProps &
  WorkspaceHeaderProps;

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function WorkspaceProvider({
  value,
  children,
}: {
  value: WorkspaceContextValue;
  children: ReactNode;
}) {
  return (
    <WorkspaceContext.Provider value={value}>
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspaceContext(): WorkspaceContextValue {
  const context = useContext(WorkspaceContext);
  if (!context) {
    throw new Error("useWorkspaceContext must be used inside WorkspaceProvider");
  }
  return context;
}
